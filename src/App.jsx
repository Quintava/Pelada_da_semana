"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownUp, BarChart3, CalendarDays, Check, ChevronRight, CirclePause, CirclePlay, Clock3, Cloud, CloudOff, Download, Eye, EyeOff, Goal, LockKeyhole, LogOut, Mail, Medal, Moon, Plus, RefreshCw, RotateCcw, Shield, ShieldCheck, Sparkles, Sun, Trash2, Trophy, Upload, UserPlus, Users, X } from "lucide-react";
import { supabase, supabaseConfigured } from "./supabase";

const LEGACY_STORAGE_KEY = "pelada-da-semana-v4";
const USER_STORAGE_PREFIX = "pelada-da-semana-user";
const MIGRATION_OWNER_KEY = "pelada-da-semana-legacy-owner";
const THEME_KEY = "pelada-da-semana-theme";
const TEAM_META = [
  { name: "Time Azul", short: "AZL", color: "blue" },
  { name: "Time Laranja", short: "LRJ", color: "orange" },
];
const startersBySport = { Futebol: 11, Futsal: 5, Vôlei: 6, Basquete: 5, Handebol: 7 };
const initialState = { players: [], settings: { sport: "Futsal", duration: 20, startersPerTeam: 5, drawMode: "balanced" }, activeMatch: null, history: [] };
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const thisMonth = () => new Date().toLocaleDateString("sv-SE").slice(0, 7);
const monthKey = (date) => new Date(date).toLocaleDateString("sv-SE").slice(0, 7);
const formatTime = (seconds) => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
const minuteOf = (match) => Math.max(1, Math.ceil((match.durationSeconds - match.remainingSeconds) / 60));

function readSaved(key) {
  if (typeof window === "undefined") return initialState;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved ? { ...initialState, ...saved } : initialState;
  } catch {
    return initialState;
  }
}

const userStorageKey = (userId) => `${USER_STORAGE_PREFIX}:${userId}`;
const hasSavedContent = (saved) => saved.players.length > 0 || saved.history.length > 0 || Boolean(saved.activeMatch);

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawTeams(players, mode, startersPerTeam) {
  let ordered = shuffle(players);
  if (mode === "balanced") ordered = ordered.sort((a, b) => b.level - a.level);
  const teams = TEAM_META.map((meta) => ({ ...meta, starters: [], bench: [] }));
  ordered.forEach((player, index) => {
    let target = index % 2;
    if (mode === "balanced") {
      const totals = teams.map((team) => [...team.starters, ...team.bench].reduce((sum, item) => sum + item.level, 0));
      target = totals[0] <= totals[1] ? 0 : 1;
    }
    const list = teams[target].starters.length < startersPerTeam ? "starters" : "bench";
    teams[target][list].push(player);
  });
  return teams;
}

export default function Home() {
  const [data, setData] = useState(initialState);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("setup");
  const [playerName, setPlayerName] = useState("");
  const [playerLevel, setPlayerLevel] = useState(3);
  const [goalTeam, setGoalTeam] = useState(null);
  const [subTeam, setSubTeam] = useState(null);
  const [selectedOut, setSelectedOut] = useState("");
  const [selectedIn, setSelectedIn] = useState("");
  const [month, setMonth] = useState(thisMonth());
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? "offline" : "local");
  const nameInput = useRef(null);
  const importInput = useRef(null);
  const dataRef = useRef(initialState);
  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);
  const cloudLoadedUser = useRef(null);

  useEffect(() => {
    if (ready && session?.user) {
      localStorage.setItem(userStorageKey(session.user.id), JSON.stringify(data));
      dataRef.current = data;
      dirtyRef.current = true;
    }
  }, [data, ready, session?.user?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthReady(true);
      return undefined;
    }
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !session?.user) {
      setReady(false);
      cloudLoadedUser.current = null;
      return;
    }
    const key = userStorageKey(session.user.id);
    let saved = readSaved(key);
    const migrationOwner = localStorage.getItem(MIGRATION_OWNER_KEY);
    if (!hasSavedContent(saved) && !migrationOwner) {
      const legacy = readSaved(LEGACY_STORAGE_KEY);
      if (hasSavedContent(legacy)) {
        saved = legacy;
        localStorage.setItem(MIGRATION_OWNER_KEY, session.user.id);
      }
    }
    setData(saved);
    dataRef.current = saved;
    setView(saved.activeMatch ? "match" : "setup");
    setReady(true);
  }, [authReady, session?.user?.id]);

  useEffect(() => {
    if (!ready || !session?.user || !supabaseConfigured) {
      cloudLoadedUser.current = null;
      return undefined;
    }
    let cancelled = false;
    const loadCloud = async () => {
      setSyncStatus("loading");
      const { data: cloudRow, error } = await supabase.from("app_state").select("data").eq("user_id", session.user.id).maybeSingle();
      if (cancelled) return;
      if (error) {
        setSyncStatus("error");
        setAuthMessage(`Não foi possível carregar a nuvem: ${error.message}`);
        return;
      }
      if (cloudRow?.data) {
        const cloudData = { ...initialState, ...cloudRow.data };
        setData(cloudData);
        dataRef.current = cloudData;
        if (cloudData.activeMatch) setView("match");
      } else {
        const { error: uploadError } = await supabase.from("app_state").upsert({ user_id: session.user.id, data: dataRef.current, updated_at: new Date().toISOString() });
        if (uploadError) {
          setSyncStatus("error");
          setAuthMessage(`Não foi possível criar o backup: ${uploadError.message}`);
          return;
        }
      }
      cloudLoadedUser.current = session.user.id;
      dirtyRef.current = false;
      setSyncStatus("synced");
    };
    loadCloud();
    return () => { cancelled = true; };
  }, [ready, session?.user?.id]);

  const syncNow = useCallback(async () => {
    if (!supabaseConfigured || !session?.user || syncingRef.current || cloudLoadedUser.current !== session.user.id) return;
    syncingRef.current = true;
    setSyncStatus("syncing");
    const { error } = await supabase.from("app_state").upsert({ user_id: session.user.id, data: dataRef.current, updated_at: new Date().toISOString() });
    syncingRef.current = false;
    if (error) {
      setSyncStatus("error");
      setAuthMessage(`Falha ao sincronizar: ${error.message}`);
    } else {
      dirtyRef.current = false;
      setSyncStatus("synced");
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !supabaseConfigured) return undefined;
    const interval = window.setInterval(() => {
      if (dirtyRef.current) syncNow();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [session?.user?.id, syncNow]);

  useEffect(() => {
    if (!data.activeMatch?.running || data.activeMatch.remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setData((current) => {
        if (!current.activeMatch?.running) return current;
        const next = Math.max(0, current.activeMatch.remainingSeconds - 1);
        return { ...current, activeMatch: { ...current.activeMatch, remainingSeconds: next, running: next > 0 } };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data.activeMatch?.running]);

  const addPlayer = useCallback((rawName = playerName, rawLevel = playerLevel) => {
    const name = String(rawName).trim();
    const level = Math.max(1, Math.min(5, Number(rawLevel) || 3));
    if (!name) return { ok: false, error: "Informe o nome do jogador." };
    if (data.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "Este jogador já está na lista." };
    const player = { id: uid(), name, level };
    setData((current) => ({ ...current, players: [...current.players, player] }));
    setPlayerName("");
    setPlayerLevel(3);
    nameInput.current?.focus();
    return { ok: true, player };
  }, [data.players, playerLevel, playerName]);

  const startMatch = useCallback(() => {
    if (data.players.length < 2) return { ok: false, error: "Cadastre pelo menos 2 jogadores." };
    const durationSeconds = data.settings.duration * 60;
    const match = { id: uid(), date: new Date().toISOString(), sport: data.settings.sport, durationSeconds, remainingSeconds: durationSeconds, running: false, teams: drawTeams(data.players, data.settings.drawMode, data.settings.startersPerTeam), score: [0, 0], events: [] };
    setData((current) => ({ ...current, activeMatch: match }));
    setView("match");
    return { ok: true, matchId: match.id };
  }, [data.players, data.settings]);

  const registerGoal = useCallback((teamIndex, playerId) => {
    let result = { ok: false, error: "Jogador não encontrado." };
    setData((current) => {
      const match = current.activeMatch;
      const player = match?.teams[teamIndex]?.starters.find((item) => item.id === playerId);
      if (!match || !player) return current;
      const score = [...match.score];
      score[teamIndex] += 1;
      const event = { id: uid(), type: "goal", teamIndex, playerId, playerName: player.name, minute: minuteOf(match) };
      result = { ok: true, player: player.name, score };
      return { ...current, activeMatch: { ...match, score, events: [event, ...match.events] } };
    });
    setGoalTeam(null);
    return result;
  }, []);

  useEffect(() => {
    const context = typeof document === "undefined" ? null : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool) => {
      try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    };
    register({ name: "add_player", title: "Adicionar jogador", description: "Adiciona um jogador à lista da pelada.", inputSchema: { type: "object", properties: { name: { type: "string" }, level: { type: "number", minimum: 1, maximum: 5 } }, required: ["name"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ name, level = 3 }) => addPlayer(name, level) });
    register({ name: "start_match", title: "Sortear times e iniciar jogo", description: "Sorteia os dois times e abre a partida.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => startMatch() });
    register({ name: "record_goal", title: "Registrar gol", description: "Registra um gol de um titular na partida atual.", inputSchema: { type: "object", properties: { teamIndex: { type: "number", enum: [0, 1] }, playerId: { type: "string" } }, required: ["teamIndex", "playerId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: ({ teamIndex, playerId }) => registerGoal(teamIndex, playerId) });
    return () => lifecycle.abort();
  }, [addPlayer, registerGoal, startMatch]);

  const updateSettings = (field, value) => setData((current) => ({ ...current, settings: { ...current.settings, [field]: value } }));
  const changeSport = (sport) => setData((current) => ({ ...current, settings: { ...current.settings, sport, startersPerTeam: startersBySport[sport] } }));
  const removePlayer = (id) => setData((current) => ({ ...current, players: current.players.filter((player) => player.id !== id) }));
  const toggleTimer = () => setData((current) => !current.activeMatch || current.activeMatch.remainingSeconds === 0 ? current : ({ ...current, activeMatch: { ...current.activeMatch, running: !current.activeMatch.running } }));
  const resetTimer = () => setData((current) => ({ ...current, activeMatch: current.activeMatch ? { ...current.activeMatch, remainingSeconds: current.activeMatch.durationSeconds, running: false } : null }));

  const openSubstitution = (teamIndex) => {
    const team = data.activeMatch?.teams[teamIndex];
    setSubTeam(teamIndex);
    setSelectedOut(team?.starters[0]?.id || "");
    setSelectedIn(team?.bench[0]?.id || "");
  };

  const confirmSubstitution = () => {
    setData((current) => {
      const match = current.activeMatch;
      if (!match || subTeam === null || !selectedOut || !selectedIn) return current;
      const out = match.teams[subTeam].starters.find((player) => player.id === selectedOut);
      const incoming = match.teams[subTeam].bench.find((player) => player.id === selectedIn);
      if (!out || !incoming) return current;
      const teams = match.teams.map((team, index) => index !== subTeam ? team : ({ ...team, starters: team.starters.map((player) => player.id === selectedOut ? incoming : player), bench: team.bench.map((player) => player.id === selectedIn ? out : player) }));
      const event = { id: uid(), type: "sub", teamIndex: subTeam, playerOut: out.name, playerIn: incoming.name, minute: minuteOf(match) };
      return { ...current, activeMatch: { ...match, teams, events: [event, ...match.events] } };
    });
    setSubTeam(null);
  };

  const undoGoal = (eventId) => setData((current) => {
    const match = current.activeMatch;
    const event = match?.events.find((item) => item.id === eventId && item.type === "goal");
    if (!match || !event) return current;
    const score = [...match.score];
    score[event.teamIndex] = Math.max(0, score[event.teamIndex] - 1);
    return { ...current, activeMatch: { ...match, score, events: match.events.filter((item) => item.id !== eventId) } };
  });

  const finishMatch = () => {
    if (!data.activeMatch) return;
    const finished = { ...data.activeMatch, running: false, finishedAt: new Date().toISOString() };
    setData((current) => ({ ...current, history: [finished, ...current.history], activeMatch: null }));
    setView("stats");
  };

  const cancelMatch = () => {
    if (!window.confirm("Descartar esta partida sem salvar os gols?")) return;
    setData((current) => ({ ...current, activeMatch: null }));
    setView("setup");
  };

  const monthMatches = useMemo(() => data.history.filter((match) => monthKey(match.finishedAt || match.date) === month), [data.history, month]);
  const ranking = useMemo(() => {
    const goals = new Map();
    monthMatches.forEach((match) => match.events.filter((event) => event.type === "goal").forEach((event) => {
      const item = goals.get(event.playerId) || { id: event.playerId, name: event.playerName, goals: 0 };
      item.goals += 1;
      goals.set(event.playerId, item);
    }));
    return [...goals.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  }, [monthMatches]);

  const submitAuth = async (event) => {
    event.preventDefault();
    if (!supabaseConfigured) return;
    setAuthBusy(true);
    setAuthMessage("");
    const credentials = { email: authEmail.trim(), password: authPassword };
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` } })
      : await supabase.auth.signInWithPassword(credentials);
    setAuthBusy(false);
    if (result.error) {
      setAuthMessage(result.error.message);
      return;
    }
    setAuthPassword("");
    if (authMode === "signup" && !result.data.session) {
      setAuthMessage("Cadastro criado. Confirme o e-mail recebido e depois entre na conta.");
    } else {
      setAuthMessage("Conta conectada. Os dados estão sendo sincronizados.");
    }
  };

  const signOut = async () => {
    if (dirtyRef.current) await syncNow();
    await supabase.auth.signOut();
    setCloudOpen(false);
    setData(initialState);
    dataRef.current = initialState;
    dirtyRef.current = false;
    cloudLoadedUser.current = null;
    setReady(false);
    setSyncStatus("offline");
    setAuthMessage("");
    setView("setup");
  };

  const exportBackup = () => {
    const file = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pelada-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported.players) || !Array.isArray(imported.history) || !imported.settings) throw new Error("Arquivo incompatível");
      if (!window.confirm("Substituir os dados atuais pelos dados deste backup?")) return;
      const nextData = { ...initialState, ...imported };
      setData(nextData);
      dataRef.current = nextData;
      dirtyRef.current = true;
      setAuthMessage("Backup importado com sucesso.");
    } catch {
      setAuthMessage("O arquivo selecionado não é um backup válido deste aplicativo.");
    }
  };

  const syncLabel = { local: "Configuração pendente", offline: "Conectando...", loading: "Carregando...", syncing: "Salvando...", synced: "Nuvem sincronizada", error: "Erro na nuvem" }[syncStatus];

  if (!authReady) return <main className="app-shell loading">Verificando acesso…</main>;
  if (!supabaseConfigured) return <AuthSetupRequired theme={theme} setTheme={setTheme} />;
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} showPassword={showPassword} setShowPassword={setShowPassword} message={authMessage} busy={authBusy} onSubmit={submitAuth} theme={theme} setTheme={setTheme} />;
  if (!ready) return <main className="app-shell loading">Preparando a pelada…</main>;
  const match = data.activeMatch;

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("setup")} aria-label="Ir para o início"><span className="brand-mark"><Goal size={24} /></span><span><strong>Pelada da Semana</strong><small>Times, placar e artilharia</small></span></button>
        <div className="topbar-actions">
          <div className="topbar-status"><span className={`status-dot ${match ? "live" : ""}`} />{match ? "Partida em andamento" : `${data.players.length} jogadores no grupo`}</div>
          <button className="icon-button theme-button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
          <button className="cloud-button connected" onClick={() => setCloudOpen(true)}><Cloud size={18} /><span>{syncLabel}</span></button>
        </div>
      </header>

      <div className="page-wrap">
        <nav className="nav-tabs nav-list" aria-label="Navegação principal"><button className={`nav-item ${view === "setup" ? "active" : ""}`} onClick={() => setView("setup")}><Users size={18} /> Preparar jogo</button><button className={`nav-item ${view === "match" ? "active" : ""}`} onClick={() => setView("match")} disabled={!match}><Activity size={18} /> Partida</button><button className={`nav-item ${view === "stats" ? "active" : ""}`} onClick={() => setView("stats")}><BarChart3 size={18} /> Artilharia</button></nav>

        {view === "setup" && <section className="view-grid setup-grid">
          <div className="main-column">
            <div className="section-heading"><div><span className="eyebrow">PASSO 1</span><h1>Quem vai jogar hoje?</h1></div><span className="count-pill">{data.players.length} cadastrados</span></div>
            <form className="add-player" onSubmit={(event) => { event.preventDefault(); addPlayer(); }}>
              <div className="field grow"><label htmlFor="player-name">Nome do jogador</label><input ref={nameInput} id="player-name" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Ex.: João" autoComplete="off" /></div>
              <div className="field level-field"><label htmlFor="player-level">Nível</label><select id="player-level" value={playerLevel} onChange={(event) => setPlayerLevel(Number(event.target.value))}>{[1,2,3,4,5].map((level) => <option key={level}>{level}</option>)}</select></div>
              <button className="button primary add-button" type="submit"><UserPlus size={19} /> Adicionar</button>
            </form>
            <div className="player-list">{data.players.length === 0 ? <Empty icon={<Users size={28} />} title="A lista ainda está vazia" text="Adicione os amigos que vão participar do jogo." /> : data.players.map((player, index) => <article className="player-row" key={player.id}><Avatar name={player.name} /><div className="player-info"><strong>{player.name}</strong><span>Jogador #{String(index + 1).padStart(2, "0")}</span></div><div className="level-dots" aria-label={`Nível ${player.level} de 5`}>{[1,2,3,4,5].map((dot) => <i key={dot} className={dot <= player.level ? "filled" : ""} />)}</div><button className="icon-button danger" onClick={() => removePlayer(player.id)} aria-label={`Remover ${player.name}`}><Trash2 size={17} /></button></article>)}</div>
          </div>
          <aside className="config-card">
            <div className="section-heading compact"><div><span className="eyebrow">PASSO 2</span><h2>Configurar partida</h2></div><Sparkles size={21} /></div>
            <div className="field"><label htmlFor="sport">Esporte</label><select id="sport" value={data.settings.sport} onChange={(event) => changeSport(event.target.value)}>{Object.keys(startersBySport).map((sport) => <option key={sport}>{sport}</option>)}</select></div>
            <div className="two-fields"><div className="field"><label htmlFor="duration">Tempo de jogo</label><div className="input-suffix"><input id="duration" type="number" min="1" max="120" value={data.settings.duration} onChange={(event) => updateSettings("duration", Math.max(1, Number(event.target.value)))} /><span>min</span></div></div><div className="field"><label htmlFor="starters">Em jogo por time</label><input id="starters" type="number" min="1" max="11" value={data.settings.startersPerTeam} onChange={(event) => updateSettings("startersPerTeam", Math.max(1, Number(event.target.value)))} /></div></div>
            <fieldset className="mode-group"><legend>Modo do sorteio</legend><Mode active={data.settings.drawMode === "balanced"} onClick={() => updateSettings("drawMode", "balanced")} icon={<Shield size={19} />} title="Equilibrado" text="Distribui os níveis" /><Mode active={data.settings.drawMode === "random"} onClick={() => updateSettings("drawMode", "random")} icon={<Sparkles size={19} />} title="Aleatório" text="Sem considerar nível" /></fieldset>
            <div className="config-summary"><Clock3 size={18} /><span><strong>{data.settings.duration} minutos</strong> · {data.settings.startersPerTeam} titulares por time</span></div>
            <button className="button primary large full" onClick={startMatch} disabled={data.players.length < 2}>Sortear times e abrir jogo <ChevronRight size={20} /></button>{data.players.length < 2 && <p className="helper">Adicione pelo menos 2 jogadores para começar.</p>}
          </aside>
        </section>}

        {view === "match" && match && <section className="match-view">
          <div className="scoreboard"><TeamScore team={match.teams[0]} score={match.score[0]} /><div className="timer-panel"><span className={match.running ? "live-label" : "live-label paused"}>{match.running ? "EM JOGO" : match.remainingSeconds === 0 ? "FIM DO TEMPO" : "PAUSADO"}</span><strong className={match.remainingSeconds <= 60 ? "ending" : ""}>{formatTime(match.remainingSeconds)}</strong><div className="timer-actions"><button className="button timer-button" onClick={toggleTimer}>{match.running ? <CirclePause size={19} /> : <CirclePlay size={19} />}{match.running ? "Pausar" : "Iniciar"}</button><button className="icon-button" onClick={resetTimer} aria-label="Reiniciar cronômetro"><RotateCcw size={18} /></button></div></div><TeamScore team={match.teams[1]} score={match.score[1]} /></div>
          <div className="match-grid">
            {match.teams.map((team, teamIndex) => <TeamCard key={team.name} team={team} onGoal={() => setGoalTeam(teamIndex)} onSub={() => openSubstitution(teamIndex)} />)}
            <aside className="events-card"><header><div><span className="eyebrow">SÚMULA</span><h2>Lances do jogo</h2></div><span className="event-count">{match.events.length}</span></header><div className="events-list">{match.events.length === 0 ? <div className="empty-events"><Activity size={25} /><span>Os gols e trocas aparecerão aqui.</span></div> : match.events.map((event) => <div className={`event-row ${event.type}`} key={event.id}><span className="event-minute">{event.minute}&apos;</span><span className={`event-icon ${match.teams[event.teamIndex].color}`}>{event.type === "goal" ? <Goal size={17} /> : <ArrowDownUp size={17} />}</span><div>{event.type === "goal" ? <><strong>Gol de {event.playerName}</strong><small>{match.teams[event.teamIndex].name}</small></> : <><strong>Entrou {event.playerIn}</strong><small>Saiu {event.playerOut}</small></>}</div>{event.type === "goal" && <button className="icon-button mini" onClick={() => undoGoal(event.id)} aria-label="Desfazer gol"><X size={14} /></button>}</div>)}</div><div className="finish-actions"><button className="button primary full" onClick={finishMatch}><Check size={18} /> Encerrar e salvar jogo</button><button className="text-button danger-text" onClick={cancelMatch}>Descartar partida</button></div></aside>
          </div>
        </section>}

        {view === "stats" && <section className="stats-view">
          <div className="section-heading stats-heading"><div><span className="eyebrow">FECHAMENTO DO MÊS</span><h1>Artilharia e resultados</h1></div><label className="month-picker"><CalendarDays size={18} /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>
          <div className="summary-strip"><Summary icon={<Trophy size={20} />} label="Artilheiro" value={ranking[0]?.name || "—"} /><Summary icon={<Goal size={20} />} label="Gols no mês" value={ranking.reduce((sum, item) => sum + item.goals, 0)} /><Summary icon={<CalendarDays size={20} />} label="Jogos realizados" value={monthMatches.length} /></div>
          <div className="stats-grid"><article className="ranking-card"><header><div><span className="eyebrow">RANKING</span><h2>Artilheiros do mês</h2></div><Medal size={23} /></header>{ranking.length === 0 ? <Empty icon={<Goal size={28} />} title="Nenhum gol registrado" text="Encerre uma partida para contabilizar a artilharia." /> : <div className="ranking-list">{ranking.map((player, index) => <div className={`ranking-row rank-${index + 1}`} key={player.id}><span className="rank-number">{index + 1}</span><Avatar name={player.name} /><strong>{player.name}</strong><div className="goal-total"><b>{player.goals}</b><small>{player.goals === 1 ? "gol" : "gols"}</small></div></div>)}</div>}</article><article className="history-card"><header><div><span className="eyebrow">HISTÓRICO</span><h2>Jogos do mês</h2></div></header>{monthMatches.length === 0 ? <Empty icon={<CalendarDays size={28} />} title="Nenhum jogo neste mês" text="Os resultados salvos ficarão organizados aqui." /> : <div className="history-list">{monthMatches.map((game) => <div className="history-row" key={game.id}><div className="history-date"><strong>{new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</strong><small>{game.sport}</small></div><div className="history-score"><span>{game.teams[0].short}</span><strong>{game.score[0]} <i>×</i> {game.score[1]}</strong><span>{game.teams[1].short}</span></div></div>)}</div>}</article></div>
        </section>}
      </div>

      {goalTeam !== null && match && <Modal onClose={() => setGoalTeam(null)} icon={<Goal size={25} />} color={match.teams[goalTeam].color} title="Quem fez o gol?" text={`Selecione quem está em jogo pelo ${match.teams[goalTeam].name}.`}><div className="scorer-grid">{match.teams[goalTeam].starters.map((player) => <button key={player.id} onClick={() => registerGoal(goalTeam, player.id)}><Avatar name={player.name} /><strong>{player.name}</strong><ChevronRight size={17} /></button>)}</div></Modal>}
      {subTeam !== null && match && <Modal onClose={() => setSubTeam(null)} icon={<ArrowDownUp size={25} />} color={match.teams[subTeam].color} title="Fazer substituição" text={`Escolha quem sai e quem entra no ${match.teams[subTeam].name}.`}><div className="sub-fields"><div className="field"><label htmlFor="player-out">Sai de quadra</label><select id="player-out" value={selectedOut} onChange={(event) => setSelectedOut(event.target.value)}>{match.teams[subTeam].starters.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></div><ArrowDownUp size={21} /><div className="field"><label htmlFor="player-in">Entra no jogo</label><select id="player-in" value={selectedIn} onChange={(event) => setSelectedIn(event.target.value)}>{match.teams[subTeam].bench.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></div></div><button className="button primary large full" onClick={confirmSubstitution}>Confirmar troca</button></Modal>}
      {cloudOpen && <Modal onClose={() => setCloudOpen(false)} icon={<Cloud size={25} />} color="green" title="Conta e sincronização" text="Estes jogadores e históricos pertencem somente a esta conta. Uma cópia também fica protegida neste aparelho para continuar funcionando durante quedas de conexão.">
        <div className="cloud-account">
          <div className="account-line"><span><Cloud size={20} /><span><small>Conta conectada</small><strong>{session.user.email}</strong></span></span><b className={`sync-badge ${syncStatus}`}>{syncLabel}</b></div>
          <button className="button secondary full" onClick={syncNow} disabled={syncStatus === "syncing" || syncStatus === "loading"}><RefreshCw size={18} /> Sincronizar agora</button>
          <button className="button secondary full" onClick={signOut}><LogOut size={18} /> Salvar e sair da conta</button>
        </div>
        {authMessage && <p className="cloud-message" role="status">{authMessage}</p>}
        <div className="backup-actions"><button className="button secondary" onClick={exportBackup}><Download size={17} /> Exportar backup</button><button className="button secondary" onClick={() => importInput.current?.click()}><Upload size={17} /> Importar backup</button><input ref={importInput} type="file" accept="application/json,.json" onChange={importBackup} hidden /></div>
      </Modal>}
    </main>
  );
}

function ThemeToggle({ theme, setTheme, className = "" }) {
  return <button className={`icon-button theme-button ${className}`} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}>{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>;
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, showPassword, setShowPassword, message, busy, onSubmit, theme, setTheme }) {
  return <main className="auth-page">
    <ThemeToggle theme={theme} setTheme={setTheme} className="auth-theme" />
    <section className="auth-hero">
      <div className="auth-brand"><span className="brand-mark"><Goal size={27} /></span><span><strong>Pelada da Semana</strong><small>Organização completa do jogo</small></span></div>
      <div className="auth-copy"><span className="eyebrow">SEU FUTEBOL, SEUS DADOS</span><h1>Da escalação até a artilharia do mês.</h1><p>Monte os times, controle o placar e guarde cada resultado em um espaço exclusivo da sua conta.</p></div>
      <div className="auth-benefits"><span><ShieldCheck size={19} /> Informações separadas por conta</span><span><Cloud size={19} /> Histórico sincronizado entre aparelhos</span><span><Trophy size={19} /> Artilharia mensal sempre atualizada</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <span className="auth-lock"><LockKeyhole size={23} /></span>
        <h2>{mode === "signup" ? "Criar uma conta" : "Entrar no aplicativo"}</h2>
        <p>{mode === "signup" ? "Crie um acesso para cadastrar seus jogadores e começar o histórico." : "Use seu acesso para abrir jogadores, partidas e artilharia."}</p>
        <div className="auth-tabs"><button type="button" className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Entrar</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Criar conta</button></div>
        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field"><label htmlFor="login-email">E-mail</label><div className="auth-input"><Mail size={18} /><input id="login-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.com" /></div></div>
          <div className="field"><label htmlFor="login-password">Senha</label><div className="auth-input"><LockKeyhole size={18} /><input id="login-password" type={showPassword ? "text" : "password"} minLength="6" required autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="button primary large full" disabled={busy}>{busy ? "Aguarde..." : mode === "signup" ? "Criar minha conta" : "Entrar"}<ChevronRight size={19} /></button>
        </form>
        <small className="auth-privacy"><Shield size={14} /> Cada conta acessa somente os próprios dados.</small>
      </div>
    </section>
  </main>;
}

function AuthSetupRequired({ theme, setTheme }) {
  return <main className="auth-page setup-required-page">
    <ThemeToggle theme={theme} setTheme={setTheme} className="auth-theme" />
    <section className="setup-required-card"><span className="auth-lock"><CloudOff size={25} /></span><span className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</span><h1>Ative o banco de dados para liberar o login</h1><p>Por segurança, jogadores e históricos não ficam mais disponíveis sem autenticação. Siga o arquivo <strong>CONFIGURAR_SUPABASE.md</strong> e adicione as duas chaves no GitHub.</p><div className="setup-code"><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code></div></section>
  </main>;
}

function Avatar({ name }) { return <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>; }
function Empty({ icon, title, text }) { return <div className="empty-state">{icon}<strong>{title}</strong><span>{text}</span></div>; }
function Mode({ active, onClick, icon, title, text }) { return <button type="button" className={active ? "mode active" : "mode"} onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div>{active && <Check size={18} />}</button>; }
function Summary({ icon, label, value }) { return <div><span>{icon}</span><p><small>{label}</small><strong>{value}</strong></p></div>; }
function TeamScore({ team, score }) { return <div className={`team-score ${team.color}`}>{team.color === "blue" && <span className="team-badge">{team.short}</span>}<div><small>{team.name}</small><strong>{score}</strong></div>{team.color === "orange" && <span className="team-badge">{team.short}</span>}</div>; }
function TeamCard({ team, onGoal, onSub }) { return <article className={`team-card ${team.color}`}><header><div><span className="team-dot" /><h2>{team.name}</h2></div><button className="button goal-button" onClick={onGoal}><Plus size={18} /> Gol</button></header><div className="roster-title"><span>Em jogo</span><small>{team.starters.length} jogadores</small></div><div className="roster-list">{team.starters.map((player) => <div className="roster-player" key={player.id}><Avatar name={player.name} /><strong>{player.name}</strong><span className="field-status">em jogo</span></div>)}</div><div className="bench-box"><div className="roster-title"><span>Banco</span><small>{team.bench.length} jogadores</small></div>{team.bench.length ? team.bench.map((player) => <div className="roster-player bench-player" key={player.id}><Avatar name={player.name} /><strong>{player.name}</strong></div>) : <p className="empty-bench">Nenhum reserva neste time.</p>}</div><button className="button secondary full" onClick={onSub} disabled={!team.bench.length}><ArrowDownUp size={18} /> Fazer substituição</button></article>; }
function Modal({ onClose, icon, color, title, text, children }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="icon-button modal-close" onClick={onClose}><X size={18} /></button><span className={`modal-icon ${color}`}>{icon}</span><h2>{title}</h2><p>{text}</p>{children}</div></div>; }
