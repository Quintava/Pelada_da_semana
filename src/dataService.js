import { supabase } from "./supabase";

const fingerprints = new Map();
const json = (value) => JSON.stringify(value ?? null);
const fail = (error) => { if (error) throw error; };

function rowsToState(rows) {
  const { profile, settings, players, matches, activeMatch, plans, sessions, activeTraining } = rows;
  return {
    profile: { displayName: profile?.display_name || "" },
    settings: settings?.data || {},
    players: (players || []).map(({ id, name }) => ({ id, name })),
    history: (matches || []).map((row) => row.payload),
    activeMatch: activeMatch?.payload || null,
    trainingPlans: (plans || []).map((row) => row.payload),
    trainingHistory: (sessions || []).map((row) => row.payload),
    activeTraining: activeTraining?.payload || null,
  };
}

function remember(key, state) {
  fingerprints.set(key, {
    profile: json(state.profile), settings: json(state.settings),
    players: new Map(state.players.map((item) => [item.id, json(item)])),
    matches: new Map(state.history.map((item) => [item.id, json(item)])),
    activeMatch: json(state.activeMatch),
    plans: new Map((state.trainingPlans || []).map((item) => [item.id, json(item)])),
    sessions: new Map((state.trainingHistory || []).map((item) => [item.id, json(item)])),
    activeTraining: json(state.activeTraining),
  });
}

export async function bootstrapWorkspace(userId, fallbackName) {
  const { data: defaultId, error: ensureError } = await supabase.rpc("ensure_default_group", { group_name: `${fallbackName || "Minha"} · Resenha` });
  fail(ensureError);
  const groups = await listGroups();
  return { groups, activeGroupId: groups.some((item) => item.id === defaultId) ? defaultId : groups[0]?.id };
}

export async function listGroups() {
  const { data, error } = await supabase.from("group_members").select("group_id,role,joined_at,group:groups(id,name,invite_code,public_slug,is_public,owner_id)").order("joined_at");
  fail(error);
  return (data || []).filter((row) => row.group).map((row) => ({ ...row.group, role: row.role }));
}

export async function loadWorkspace(groupId, userId, defaults) {
  const requests = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    supabase.from("group_settings").select("data").eq("group_id", groupId).maybeSingle(),
    supabase.from("players").select("id,name").eq("group_id", groupId).order("created_at"),
    supabase.from("matches").select("id,payload,finished_at").eq("group_id", groupId).order("finished_at", { ascending: false }),
    supabase.from("active_matches").select("payload").eq("group_id", groupId).maybeSingle(),
    supabase.from("training_plans").select("id,payload").eq("user_id", userId),
    supabase.from("training_sessions").select("id,payload,finished_at").eq("user_id", userId).order("finished_at", { ascending: false }),
    supabase.from("active_trainings").select("payload").eq("user_id", userId).maybeSingle(),
  ]);
  requests.forEach(({ error }) => fail(error));
  let state = rowsToState({ profile: requests[0].data, settings: requests[1].data, players: requests[2].data, matches: requests[3].data, activeMatch: requests[4].data, plans: requests[5].data, sessions: requests[6].data, activeTraining: requests[7].data });
  state = { ...defaults, ...state, profile: { ...defaults.profile, ...state.profile }, settings: { ...defaults.settings, ...state.settings } };

  if (!state.players.length && !state.history.length) {
    const { data: legacy } = await supabase.from("app_state").select("data").eq("user_id", userId).maybeSingle();
    if (legacy?.data && ((legacy.data.players || []).length || (legacy.data.history || []).length)) {
      state = { ...defaults, ...legacy.data, profile: { displayName: legacy.data.profile?.displayName || "" }, settings: { ...defaults.settings, ...(legacy.data.settings || {}) } };
      await saveWorkspace(groupId, userId, state, true);
    }
  }
  remember(`${userId}:${groupId}`, state);
  return state;
}

async function syncRows({ table, ownerColumn, ownerId, items, map, rowOf }) {
  const changed = items.filter((item) => map.get(item.id) !== json(item));
  if (changed.length) {
    const { error } = await supabase.from(table).upsert(changed.map((item) => rowOf(item)));
    fail(error);
  }
  const removed = [...map.keys()].filter((id) => !items.some((item) => item.id === id));
  if (removed.length) {
    const { error } = await supabase.from(table).delete().eq(ownerColumn, ownerId).in("id", removed);
    fail(error);
  }
}

export async function saveWorkspace(groupId, userId, state, force = false) {
  const key = `${userId}:${groupId}`;
  const previous = fingerprints.get(key) || { players: new Map(), matches: new Map(), plans: new Map(), sessions: new Map() };
  const now = new Date().toISOString();
  if (force || previous.profile !== json(state.profile)) fail((await supabase.from("profiles").upsert({ user_id: userId, display_name: state.profile?.displayName || "", updated_at: now })).error);
  if (force || previous.settings !== json(state.settings)) fail((await supabase.from("group_settings").upsert({ group_id: groupId, data: state.settings, updated_at: now })).error);
  await syncRows({ table: "players", ownerColumn: "group_id", ownerId: groupId, items: state.players, map: force ? new Map() : previous.players, rowOf: (item) => ({ group_id: groupId, id: item.id, name: item.name, updated_at: now }) });
  await syncRows({ table: "matches", ownerColumn: "group_id", ownerId: groupId, items: state.history, map: force ? new Map() : previous.matches, rowOf: (item) => ({ group_id: groupId, id: item.id, payload: item, finished_at: item.finishedAt || item.date || now, updated_at: now }) });
  await syncRows({ table: "training_plans", ownerColumn: "user_id", ownerId: userId, items: state.trainingPlans || [], map: force ? new Map() : previous.plans, rowOf: (item) => ({ user_id: userId, id: item.id, payload: item, updated_at: now }) });
  await syncRows({ table: "training_sessions", ownerColumn: "user_id", ownerId: userId, items: state.trainingHistory || [], map: force ? new Map() : previous.sessions, rowOf: (item) => ({ user_id: userId, id: item.id, payload: item, finished_at: item.finishedAt || now }) });

  if (previous.activeMatch !== json(state.activeMatch) || force) {
    if (state.activeMatch) fail((await supabase.from("active_matches").upsert({ group_id: groupId, payload: state.activeMatch, updated_at: now })).error);
    else fail((await supabase.from("active_matches").delete().eq("group_id", groupId)).error);
  }
  if (previous.activeTraining !== json(state.activeTraining) || force) {
    if (state.activeTraining) fail((await supabase.from("active_trainings").upsert({ user_id: userId, payload: state.activeTraining, updated_at: now })).error);
    else fail((await supabase.from("active_trainings").delete().eq("user_id", userId)).error);
  }
  remember(key, state);
}

export async function createGroup(name) { const { data, error } = await supabase.rpc("create_group", { group_name: name }); fail(error); return data; }
export async function joinGroup(code) { const { data, error } = await supabase.rpc("join_group", { code }); fail(error); return data; }
export async function updateGroup(groupId, values) { const { error } = await supabase.from("groups").update({ ...values, updated_at: new Date().toISOString() }).eq("id", groupId); fail(error); }
export async function leaveGroup(groupId, userId) { const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId); fail(error); }

export async function listMembers(groupId) {
  const { data, error } = await supabase.from("group_members").select("user_id,role,joined_at").eq("group_id", groupId).order("joined_at"); fail(error);
  const ids = (data || []).map((item) => item.user_id);
  const profiles = ids.length ? (await supabase.from("profiles").select("user_id,display_name").in("user_id", ids)).data || [] : [];
  return (data || []).map((item) => ({ ...item, displayName: profiles.find((profile) => profile.user_id === item.user_id)?.display_name || "Participante" }));
}
export async function updateMemberRole(groupId, userId, role) { const { error } = await supabase.from("group_members").update({ role }).eq("group_id", groupId).eq("user_id", userId); fail(error); }
export async function removeMember(groupId, userId) { const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId); fail(error); }
export async function createAttendanceLink(groupId, date, title) { const { data, error } = await supabase.rpc("create_attendance_link", { target_group: groupId, target_date: date, target_title: title }); fail(error); return data; }
export async function getAttendance(token) { const { data, error } = await supabase.rpc("get_attendance_by_token", { target_token: token }); fail(error); return data; }
export async function respondAttendance(token, playerId, present) { const { data, error } = await supabase.rpc("respond_attendance", { target_token: token, target_player: playerId, target_present: present }); fail(error); return data; }

export async function loadLatestAttendance(groupId) {
  const { data: session, error } = await supabase.from("attendance_sessions").select("id,title,game_date").eq("group_id", groupId).eq("open", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  fail(error);
  if (!session) return null;
  const { data: responses, error: responseError } = await supabase.from("attendance_responses").select("player_id,present").eq("session_id", session.id);
  fail(responseError);
  return { ...session, presentIds: (responses || []).filter((item) => item.present).map((item) => item.player_id), responses: responses || [] };
}

export async function loadPublicGroup(slug) {
  const { data: group, error } = await supabase.from("groups").select("id,name,public_slug").eq("public_slug", slug).eq("is_public", true).maybeSingle(); fail(error);
  if (!group) return null;
  const [players, matches] = await Promise.all([supabase.from("players").select("id,name").eq("group_id", group.id), supabase.from("matches").select("payload,finished_at").eq("group_id", group.id).order("finished_at", { ascending: false }).limit(30)]);
  fail(players.error); fail(matches.error);
  return { group, players: players.data || [], history: (matches.data || []).map((item) => item.payload) };
}
