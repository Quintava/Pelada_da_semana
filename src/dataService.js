import { supabase } from "./supabase";

export const HISTORY_PAGE_SIZE = 10;
const fingerprints = new Map();
const json = (value) => JSON.stringify(value ?? null);
const fail = (error) => { if (error) throw error; };
const withoutEvents = (match) => match ? { ...match, events: undefined } : null;
const activePayload = (match) => match ? { ...match, events: undefined, score: undefined } : null;
const coreOf = (state) => ({ profile: state.profile, players: state.players, settings: state.settings, trainingPlans: state.trainingPlans || [], trainingHistory: state.trainingHistory || [], activeTraining: state.activeTraining || null });
const eventsOf = (state) => {
  const result = [];
  if (state.activeMatch) (state.activeMatch.events || []).forEach((event) => result.push({ matchId: state.activeMatch.id, event }));
  (state.history || []).forEach((match) => (match.events || []).forEach((event) => result.push({ matchId: match.id, event })));
  return result;
};
const eventKey = (matchId, id) => `${matchId}:${id}`;
const eventRow = (userId, matchId, event) => ({ user_id: userId, match_id: matchId, id: event.id, event_type: event.type, player_id: event.playerId || null, player_name: event.playerName || null, assist_player_id: event.assistPlayerId || null, assist_player_name: event.assistPlayerName || null, payload: event });

function remember(userId, state) {
  fingerprints.set(userId, {
    core: json(coreOf(state)),
    active: json(activePayload(state.activeMatch)),
    matches: new Map((state.history || []).map((match) => [match.id, json(withoutEvents(match))])),
    events: new Map(eventsOf(state).map(({ matchId, event }) => [eventKey(matchId, event.id), json(event)])),
  });
}

function attachEvents(matches, eventRows) {
  const grouped = new Map();
  (eventRows || []).forEach((row) => { const list = grouped.get(row.match_id) || []; list.push(row.payload); grouped.set(row.match_id, list); });
  return matches.map((row) => ({ ...row.payload, events: (grouped.get(row.id) || []).sort((a, b) => String(b.id).localeCompare(String(a.id))) }));
}

async function fetchMatchPage(userId, offset = 0) {
  const { data: fetched, error } = await supabase.from("user_matches").select("id,payload,finished_at").eq("user_id", userId).order("finished_at", { ascending: false }).range(offset, offset + HISTORY_PAGE_SIZE);
  fail(error);
  const rows = (fetched || []).slice(0, HISTORY_PAGE_SIZE);
  const ids = (rows || []).map((row) => row.id);
  let eventRows = [];
  if (ids.length) {
    const response = await supabase.from("user_match_events").select("match_id,payload").eq("user_id", userId).in("match_id", ids);
    fail(response.error); eventRows = response.data || [];
  }
  return { history: attachEvents(rows, eventRows), hasMore: (fetched || []).length > HISTORY_PAGE_SIZE };
}

export async function loadWorkspace(userId, defaults) {
  const [coreResult, activeResult, page] = await Promise.all([
    supabase.from("user_core").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("user_active_matches").select("payload").eq("user_id", userId).maybeSingle(),
    fetchMatchPage(userId, 0),
  ]);
  fail(coreResult.error); fail(activeResult.error);
  let core = coreResult.data?.data;
  let activeMatch = activeResult.data?.payload || null;
  let history = page.history;

  if (!core) {
    const { data: legacy, error } = await supabase.from("app_state").select("data").eq("user_id", userId).maybeSingle();
    fail(error);
    if (legacy?.data) {
      const migrated = { ...defaults, ...legacy.data, profile: { ...defaults.profile, ...(legacy.data.profile || {}) }, settings: { ...defaults.settings, ...(legacy.data.settings || {}) } };
      await saveWorkspace(userId, migrated, true);
      core = coreOf(migrated);
      activeMatch = migrated.activeMatch || null;
      history = (migrated.history || []).slice(0, HISTORY_PAGE_SIZE);
      page.hasMore = (migrated.history || []).length > HISTORY_PAGE_SIZE;
    }
  }

  if (activeMatch) {
    const { data: activeEvents, error } = await supabase.from("user_match_events").select("payload").eq("user_id", userId).eq("match_id", activeMatch.id);
    fail(error);
    const events = (activeEvents || []).map((row) => row.payload);
    const score = events.reduce((total, event) => { if (event.type === "goal" && (event.teamIndex === 0 || event.teamIndex === 1)) total[event.teamIndex] += 1; return total; }, [0, 0]);
    activeMatch = { ...activeMatch, score, events };
  }
  const state = { ...defaults, ...(core || {}), profile: { ...defaults.profile, ...(core?.profile || {}) }, settings: { ...defaults.settings, ...(core?.settings || {}) }, activeMatch, history };
  remember(userId, state);
  return { state, hasMore: page.hasMore };
}

export async function loadMoreHistory(userId, offset) {
  const page = await fetchMatchPage(userId, offset);
  const previous = fingerprints.get(userId);
  if (previous) {
    page.history.forEach((match) => {
      previous.matches.set(match.id, json(withoutEvents(match)));
      (match.events || []).forEach((event) => previous.events.set(eventKey(match.id, event.id), json(event)));
    });
  }
  return page;
}

export async function loadAllHistory(userId) {
  const all = []; let offset = 0; let hasMore = true;
  while (hasMore) { const page = await fetchMatchPage(userId, offset); all.push(...page.history); hasMore = page.hasMore; offset += HISTORY_PAGE_SIZE; }
  return all;
}

export async function saveWorkspace(userId, state, force = false) {
  const previous = fingerprints.get(userId) || { core: "", active: "", matches: new Map(), events: new Map() };
  const now = new Date().toISOString();
  const core = coreOf(state);
  if (force || previous.core !== json(core)) fail((await supabase.from("user_core").upsert({ user_id: userId, data: core, updated_at: now })).error);

  const active = activePayload(state.activeMatch);
  if (force || previous.active !== json(active)) {
    if (active) fail((await supabase.from("user_active_matches").upsert({ user_id: userId, payload: active, updated_at: now })).error);
    else fail((await supabase.from("user_active_matches").delete().eq("user_id", userId)).error);
  }

  const currentMatches = new Map((state.history || []).map((match) => [match.id, match]));
  const changedMatches = [...currentMatches.values()].filter((match) => force || previous.matches.get(match.id) !== json(withoutEvents(match)));
  if (changedMatches.length) fail((await supabase.from("user_matches").upsert(changedMatches.map((match) => ({ user_id: userId, id: match.id, payload: withoutEvents(match), finished_at: match.finishedAt || match.date || now, updated_at: now })))).error);
  const removedMatches = [...previous.matches.keys()].filter((id) => !currentMatches.has(id));
  if (removedMatches.length) fail((await supabase.from("user_matches").delete().eq("user_id", userId).in("id", removedMatches)).error);

  const currentEvents = new Map(eventsOf(state).map((item) => [eventKey(item.matchId, item.event.id), item]));
  const changedEvents = [...currentEvents.values()].filter(({ matchId, event }) => force || previous.events.get(eventKey(matchId, event.id)) !== json(event));
  if (changedEvents.length) fail((await supabase.from("user_match_events").upsert(changedEvents.map(({ matchId, event }) => eventRow(userId, matchId, event)))).error);
  const removedEvents = [...previous.events.keys()].filter((key) => !currentEvents.has(key));
  for (const key of removedEvents) { const separator = key.lastIndexOf(":"); const matchId = key.slice(0, separator); const id = key.slice(separator + 1); fail((await supabase.from("user_match_events").delete().eq("user_id", userId).eq("match_id", matchId).eq("id", id)).error); }
  remember(userId, state);
}

export async function getPublicSettings(userId, title) {
  const { data, error } = await supabase.rpc("ensure_public_page", { page_title: title }); fail(error);
  const { data: games, error: gamesError } = await supabase.from("upcoming_games").select("*").eq("user_id", userId).order("scheduled_at"); fail(gamesError);
  return { page: data, games: games || [] };
}
export async function setPublicEnabled(userId, enabled) { fail((await supabase.from("public_pages").update({ enabled, updated_at: new Date().toISOString() }).eq("user_id", userId)).error); }
export async function addUpcomingGame(userId, game) { fail((await supabase.from("upcoming_games").insert({ user_id: userId, ...game })).error); }
export async function deleteUpcomingGame(userId, id) { fail((await supabase.from("upcoming_games").delete().eq("user_id", userId).eq("id", id)).error); }
export async function getPublicPage(slug, offset = 0, sport = "Futebol de Salão") { const { data, error } = await supabase.rpc("get_public_resenha", { target_slug: slug, result_offset: offset, result_limit: HISTORY_PAGE_SIZE, target_sport: sport }); fail(error); return data; }
