"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ClipboardList,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Dumbbell,
  Eye,
  EyeOff,
  Globe2,
  Goal,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  Medal,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { supabase, supabaseConfigured } from "./supabase";
import {
  addUpcomingGame,
  deleteUpcomingGame,
  getPublicSettings,
  HISTORY_PAGE_SIZE,
  loadAllHistory,
  loadMoreHistory,
  loadWorkspace,
  saveWorkspace,
  setPublicEnabled,
} from "./dataService";

const PublicPage = lazy(() => import("./PublicPage"));

// Chaves usadas para preferências locais e migração das versões antigas.
const LEGACY_STORAGE_KEY = "pelada-da-semana-v4";
const USER_STORAGE_PREFIX = "pelada-da-semana-user";
const MIGRATION_OWNER_KEY = "pelada-da-semana-legacy-owner";
const THEME_KEY = "pelada-da-semana-theme";

// Identidade visual dos times. A ordem também define quais times entram primeiro em quadra.
const TEAM_META = [
  { id: "blue", name: "Time Azul", short: "AZL", color: "blue" },
  { id: "orange", name: "Time Laranja", short: "LRJ", color: "orange" },
  { id: "green", name: "Time Verde", short: "VRD", color: "green" },
  { id: "purple", name: "Time Roxo", short: "RXO", color: "purple" },
  { id: "red", name: "Time Vermelho", short: "VRM", color: "red" },
  { id: "yellow", name: "Time Amarelo", short: "AMR", color: "yellow" },
];

// Sugestões iniciais por esporte. Todos os valores continuam editáveis na interface.
const SPORT_PRESETS = {
  Futebol: { players: 11, duration: 20 },
  "Futebol Society": { players: 5, duration: 10 },
  "Futebol de Salão": { players: 5, duration: 10 },
  Vôlei: { players: 2, duration: 15 },
  Basquete: { players: 5, duration: 10 },
  Handebol: { players: 7, duration: 20 },
};

// Estrutura única dos dados da conta. É reutilizada no carregamento local e na nuvem.
const initialState = {
  profile: { displayName: "" },
  players: [],
  settings: {
    sport: "Futebol de Salão",
    duration: 10,
    startersPerTeam: 5,
    teamCount: 2,
    drawMode: "balanced",
    attendanceIds: [],
  },
  activeMatch: null,
  history: [],
  trainingPlans: [],
  trainingHistory: [],
  activeTraining: null,
};

// Utilitários gerais de data, relógio e identificação.
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const thisMonth = () => new Date().toLocaleDateString("sv-SE").slice(0, 7);
const monthKey = (date) => new Date(date).toLocaleDateString("sv-SE").slice(0, 7);
const formatTime = (seconds) => {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${clock}` : clock;
};
const minuteOf = (match) =>
  Math.max(1, Math.ceil((match.durationSeconds - match.remainingSeconds) / 60));
const PLAYER_PAGE_SIZE = 10;
const CAREER_VERSION = 2;
const TRAINING_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Normaliza nomes antigos e adapta os textos de pontuação para cada modalidade.
const canonicalSport = (sport) => (sport === "Futsal" ? "Futebol de Salão" : sport);
const sportKind = (sport) =>
  ["Futebol", "Futebol Society", "Futebol de Salão"].includes(canonicalSport(sport))
    ? "football"
    : canonicalSport(sport) === "Vôlei"
      ? "volleyball"
      : canonicalSport(sport) === "Basquete"
        ? "basketball"
        : "other";
const scoreWord = (sport, amount = 2) =>
  sportKind(sport) === "basketball"
    ? amount === 1
      ? "cesta"
      : "cestas"
    : sportKind(sport) === "volleyball"
      ? amount === 1
        ? "ponto"
        : "pontos"
      : amount === 1
        ? "gol"
        : "gols";
const scoreAction = (sport) =>
  sportKind(sport) === "basketball" ? "Cesta" : sportKind(sport) === "volleyball" ? "Ponto" : "Gol";
const exerciseSeconds = (exercise) => {
  if (exercise.mode !== "time") return 0;
  if (exercise.targetSeconds) return Number(exercise.targetSeconds);
  const multiplier = exercise.unit === "hours" ? 3600 : exercise.unit === "minutes" ? 60 : 1;
  return Math.max(1, Number(exercise.target) || 1) * multiplier;
};
const exerciseTargetLabel = (exercise) => {
  if (exercise.mode === "reps") return `${exercise.target} repetições`;
  const seconds = exerciseSeconds(exercise);
  if (exercise.unit === "hours")
    return `${exercise.target} ${Number(exercise.target) === 1 ? "hora" : "horas"}`;
  if (exercise.unit === "minutes")
    return `${exercise.target} ${Number(exercise.target) === 1 ? "minuto" : "minutos"}`;
  return `${seconds} ${seconds === 1 ? "segundo" : "segundos"}`;
};
const formatTrainingDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}min`;
  if (minutes) return `${minutes} min`;
  return `${seconds} s`;
};

// Converte a avaliação numérica de 0 a 10 para o nível visual de 1 a 5 estrelas.
function starsFromScore(score, matches = 1) {
  if (!matches) return 1;
  if (score >= 9) return 5;
  if (score >= 8) return 4;
  if (score >= 7) return 3;
  if (score >= 6) return 2;
  return 1;
}

// Calcula a nota da partida com produção, resultado e penalidades individuais.
function playerPerformance(match, playerId) {
  const points = pointsInMatch(match, playerId);
  const assists = (match.events || []).filter(
    (event) => event.type === "goal" && event.assistPlayerId === playerId,
  ).length;
  const ownGoals = (match.events || []).filter(
    (event) => event.type === "own_goal" && event.playerId === playerId,
  ).length;
  const missedPenalties = (match.events || []).filter(
    (event) => event.type === "missed_penalty" && event.playerId === playerId,
  ).length;
  const teamIndex = (match.teams || []).findIndex((team) =>
    [...(team.starters || []), ...(team.bench || [])].some((player) => player.id === playerId),
  );
  const own = Number(match.score?.[teamIndex] || 0);
  const rival = Number(match.score?.[teamIndex === 0 ? 1 : 0] || 0);
  const resultBonus = teamIndex < 0 ? 0 : own > rival ? 0.4 : own === rival ? 0.2 : -0.2;
  const kind = sportKind(match.sport);
  const pointWeight =
    kind === "football" ? 0.8 : kind === "volleyball" ? 0.35 : kind === "basketball" ? 0.25 : 0.5;
  const assistWeight = kind === "football" ? 0.5 : 0;
  const penalties = ownGoals * 0.5 + missedPenalties * 0.3;
  const score = Math.max(
    0,
    Math.min(
      10,
      Number(
        (6 + points * pointWeight + assists * assistWeight + resultBonus - penalties).toFixed(1),
      ),
    ),
  );
  return {
    points,
    assists,
    ownGoals,
    missedPenalties,
    penalties,
    score,
    stars: starsFromScore(score),
    resultBonus,
  };
}

// O acumulado fica no cadastro para não depender das páginas de histórico já carregadas.
function emptyCareer() {
  return {
    version: CAREER_VERSION,
    games: 0,
    points: 0,
    assists: 0,
    evaluationTotal: 0,
    evaluationAverage: 0,
    stars: 1,
    updatedAt: null,
  };
}

function normalizeCareer(career) {
  if (!career || career.version !== CAREER_VERSION) return null;
  const games = Math.max(0, Number(career.games) || 0);
  const evaluationTotal = Math.max(0, Number(career.evaluationTotal) || 0);
  const evaluationAverage = games ? evaluationTotal / games : 0;
  return {
    ...emptyCareer(),
    ...career,
    games,
    points: Math.max(0, Number(career.points) || 0),
    assists: Math.max(0, Number(career.assists) || 0),
    evaluationTotal,
    evaluationAverage,
    stars: starsFromScore(evaluationAverage, games),
  };
}

// Soma ou remove a contribuição de uma partida sem precisar reenviar todo o histórico.
function applyMatchToCareers(players, match, direction = 1) {
  if (!match) return players;
  return players.map((player) => {
    if (!playerWasInMatch(match, player.id)) return player;
    const current = normalizeCareer(player.career) || emptyCareer();
    const performance = playerPerformance(match, player.id);
    const games = Math.max(0, current.games + direction);
    const points = Math.max(0, current.points + performance.points * direction);
    const assists = Math.max(0, current.assists + performance.assists * direction);
    const evaluationTotal = Math.max(
      0,
      Number((current.evaluationTotal + performance.score * direction).toFixed(4)),
    );
    const evaluationAverage = games ? evaluationTotal / games : 0;
    return {
      ...player,
      career: {
        version: CAREER_VERSION,
        games,
        points,
        assists,
        evaluationTotal,
        evaluationAverage,
        stars: starsFromScore(evaluationAverage, games),
        updatedAt: new Date().toISOString(),
      },
    };
  });
}

// Migração única dos cadastros antigos usando todas as partidas existentes.
function rebuildPlayerCareers(players, history) {
  return (history || []).reduce(
    (currentPlayers, match) => applyMatchToCareers(currentPlayers, match, 1),
    players.map((player) => ({ ...player, career: emptyCareer() })),
  );
}

const ratingLabel = (rating) =>
  ["", "Em evolução", "Regular", "Destaque", "Craque", "Elite"][rating];

function playerWasInMatch(match, playerId) {
  if (Array.isArray(match.attendanceIds)) return match.attendanceIds.includes(playerId);
  return [...(match.teams || []), ...(match.reserveTeams || [])].some((team) =>
    [...(team.starters || []), ...(team.bench || [])].some((player) => player.id === playerId),
  );
}

function pointsInMatch(match, playerId) {
  return (match.events || []).filter(
    (event) => event.type === "goal" && event.playerId === playerId,
  ).length;
}

// Consolida presença, produção e avaliação geral de cada jogador.
function buildPlayerStats(players, history) {
  const lastMatch = history[0] || null;
  return new Map(
    players.map((player) => {
      const loadedMatches = history.filter((match) => playerWasInMatch(match, player.id));
      const performances = loadedMatches.map((match) => playerPerformance(match, player.id));
      const career = normalizeCareer(player.career);
      const matches = career?.games ?? loadedMatches.length;
      const totalPoints =
        career?.points ?? performances.reduce((sum, item) => sum + item.points, 0);
      const totalAssists =
        career?.assists ?? performances.reduce((sum, item) => sum + item.assists, 0);
      const average = matches ? totalPoints / matches : 0;
      const evaluation =
        career?.evaluationAverage ??
        (performances.length
          ? performances.reduce((sum, item) => sum + item.score, 0) / performances.length
          : 0);
      const lastPerformance =
        lastMatch && playerWasInMatch(lastMatch, player.id)
          ? playerPerformance(lastMatch, player.id)
          : null;
      const rating = career?.stars ?? starsFromScore(evaluation, matches);
      return [
        player.id,
        {
          matches,
          totalPoints,
          totalAssists,
          average,
          evaluation,
          lastPoints: lastPerformance?.points ?? null,
          lastRating: lastPerformance?.stars ?? null,
          rating,
          label: ratingLabel(rating),
        },
      ];
    }),
  );
}

// Mantém o cadastro e todas as referências históricas consistentes após uma edição de nome.
function renamePlayerInMatch(match, playerId, oldName, newName) {
  if (!match) return match;
  const teams = (match.teams || []).map((team) => ({
    ...team,
    starters: (team.starters || []).map((player) =>
      player.id === playerId ? { ...player, name: newName } : player,
    ),
    bench: (team.bench || []).map((player) =>
      player.id === playerId ? { ...player, name: newName } : player,
    ),
  }));
  const events = (match.events || []).map((event) => {
    if (["goal", "own_goal", "missed_penalty"].includes(event.type) && event.playerId === playerId)
      return { ...event, playerName: newName };
    if (event.type === "goal" && event.assistPlayerId === playerId)
      return { ...event, assistPlayerName: newName };
    if (event.type === "sub")
      return {
        ...event,
        playerOut: event.playerOut === oldName ? newName : event.playerOut,
        playerIn: event.playerIn === oldName ? newName : event.playerIn,
      };
    return event;
  });
  const reserveTeams = (match.reserveTeams || []).map((team) => ({
    ...team,
    starters: (team.starters || []).map((player) =>
      player.id === playerId ? { ...player, name: newName } : player,
    ),
    bench: (team.bench || []).map((player) =>
      player.id === playerId ? { ...player, name: newName } : player,
    ),
  }));
  return { ...match, teams, reserveTeams, events };
}

// Remove o jogador da escalação, da fila e dos lances, corrigindo também o placar.
function removePlayerFromMatch(match, playerId) {
  if (!match) return match;
  const removedGoals = [0, 0];
  const events = (match.events || [])
    .map((event) => {
      if (event.type === "goal" && event.playerId === playerId) {
        removedGoals[event.teamIndex] += 1;
        return null;
      }
      if (event.type === "own_goal" && event.playerId === playerId) {
        removedGoals[event.teamIndex === 0 ? 1 : 0] += 1;
        return null;
      }
      if (event.type === "missed_penalty" && event.playerId === playerId) return null;
      if (event.type === "goal" && event.assistPlayerId === playerId)
        return { ...event, assistPlayerId: null, assistPlayerName: null };
      return event;
    })
    .filter(Boolean);
  const teams = (match.teams || []).map((team) => ({
    ...team,
    starters: (team.starters || []).filter((player) => player.id !== playerId),
    bench: (team.bench || []).filter((player) => player.id !== playerId),
  }));
  const reserveTeams = (match.reserveTeams || []).map((team) => ({
    ...team,
    starters: (team.starters || []).filter((player) => player.id !== playerId),
    bench: (team.bench || []).filter((player) => player.id !== playerId),
  }));
  const score = (match.score || [0, 0]).map((value, index) =>
    Math.max(0, value - removedGoals[index]),
  );
  return { ...match, teams, reserveTeams, events, score };
}

// Aceita dados de versões anteriores e garante que todos os campos atuais existam.
function normalizeState(raw) {
  const saved = raw && typeof raw === "object" ? raw : {};
  const players = Array.isArray(saved.players)
    ? saved.players.map((player) => {
        const career = normalizeCareer(player.career);
        return career ? { ...player, career } : player;
      })
    : [];
  return {
    ...initialState,
    ...saved,
    profile: { displayName: String(saved.profile?.displayName || "").slice(0, 40) },
    settings: { ...initialState.settings, ...(saved.settings || {}) },
    players,
    history: Array.isArray(saved.history) ? saved.history : [],
    trainingPlans: Array.isArray(saved.trainingPlans) ? saved.trainingPlans : [],
    trainingHistory: Array.isArray(saved.trainingHistory) ? saved.trainingHistory : [],
  };
}

function readSaved(key) {
  if (typeof window === "undefined") return initialState;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved ? normalizeState(saved) : initialState;
  } catch {
    return initialState;
  }
}

const userStorageKey = (userId) => `${USER_STORAGE_PREFIX}:${userId}`;
const hasSavedContent = (saved) =>
  saved.players.length > 0 ||
  saved.history.length > 0 ||
  Boolean(saved.activeMatch) ||
  (saved.trainingPlans || []).length > 0 ||
  (saved.trainingHistory || []).length > 0 ||
  Boolean(saved.activeTraining);

// Sorteio Fisher-Yates para não favorecer a ordem original do cadastro.
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Distribui atletas entre 2 e 6 times. No modo equilibrado, usa a nota média acumulada.
function drawTeams(players, mode, startersPerTeam, teamCount = 2) {
  let ordered = shuffle(players);
  if (mode === "balanced")
    ordered = ordered.sort(
      (a, b) => b.balanceScore - a.balanceScore || b.evaluatedGames - a.evaluatedGames,
    );
  const teams = TEAM_META.slice(0, teamCount).map((meta) => ({ ...meta, starters: [], bench: [] }));
  ordered.forEach((player, index) => {
    let target = index % teams.length;
    if (mode === "balanced") {
      const counts = teams.map((team) => team.starters.length + team.bench.length);
      const totals = teams.map((team) =>
        [...team.starters, ...team.bench].reduce((sum, item) => sum + item.balanceScore, 0),
      );
      const smallestCount = Math.min(...counts);
      target = counts
        .map((count, teamIndex) => ({ teamIndex, count, total: totals[teamIndex] }))
        .filter((item) => item.count === smallestCount)
        .sort((a, b) => a.total - b.total)[0].teamIndex;
    }
    const list = teams[target].starters.length < startersPerTeam ? "starters" : "bench";
    teams[target][list].push(player);
  });
  return teams;
}

// Constrói os times conforme a escolha manual feita na tela de preparação.
function buildManualTeams(players, assignments, startersPerTeam, teamCount = 2) {
  const teams = TEAM_META.slice(0, teamCount).map((meta) => ({ ...meta, starters: [], bench: [] }));
  players.forEach((player) => {
    const target = assignments[player.id];
    if (!Number.isInteger(target) || target < 0 || target >= teamCount) return;
    const list = teams[target].starters.length < startersPerTeam ? "starters" : "bench";
    teams[target][list].push(player);
  });
  return teams;
}

export default function Home() {
  // Estado principal da conta e navegação.
  const [data, setData] = useState(initialState);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("setup");

  // Formulários e controles da preparação/partida.
  const [playerName, setPlayerName] = useState("");
  const [playerPage, setPlayerPage] = useState(1);
  const [goalTeam, setGoalTeam] = useState(null);
  const [goalScorer, setGoalScorer] = useState("");
  const [goalAssist, setGoalAssist] = useState("");
  const [incident, setIncident] = useState(null);
  const [incidentPlayer, setIncidentPlayer] = useState("");
  const [subTeam, setSubTeam] = useState(null);
  const [selectedOut, setSelectedOut] = useState("");
  const [selectedIn, setSelectedIn] = useState("");
  const [teamSwapSide, setTeamSwapSide] = useState(null);
  const [matchMessage, setMatchMessage] = useState("");

  // Filtros de estatísticas e preferências visuais.
  const [month, setMonth] = useState(thisMonth());
  const [statsSport, setStatsSport] = useState("Futebol de Salão");
  const [statsSection, setStatsSection] = useState("ranking");
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem(THEME_KEY) ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );

  // Autenticação, perfil e menus.
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const [manualAssignments, setManualAssignments] = useState({});

  // Evolução mensal e modo treino.
  const [evolutionPlayerId, setEvolutionPlayerId] = useState("");
  const [evolutionMonth, setEvolutionMonth] = useState(thisMonth());
  const [trainingName, setTrainingName] = useState("");
  const [trainingStatsMonth, setTrainingStatsMonth] = useState(thisMonth());
  const [trainingDays, setTrainingDays] = useState([]);
  const [trainingExercises, setTrainingExercises] = useState([]);
  const [exerciseDraft, setExerciseDraft] = useState({
    name: "",
    mode: "time",
    target: 30,
    unit: "seconds",
  });

  // Login, recuperação de senha e status de sincronização.
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(supabaseConfigured ? "offline" : "local");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Configuração do Mural da Resenha.
  const [publicConfig, setPublicConfig] = useState({ page: null, games: [] });
  const [publicDraft, setPublicDraft] = useState({
    title: "Pelada da semana",
    sport: "Futebol de Salão",
    scheduled_at: "",
    location: "",
  });

  // Referências que não precisam causar uma nova renderização.
  const nameInput = useRef(null);
  const importInput = useRef(null);
  const profileMenuRef = useRef(null);
  const appMenuRef = useRef(null);
  const dataRef = useRef(initialState);
  const dirtyRef = useRef(false);
  const syncingRef = useRef(false);
  const finishingRef = useRef(false);
  const authSubmittingRef = useRef(false);
  const cloudLoadedUser = useRef(null);

  // Atalhos do estado precisam existir antes dos cálculos derivados abaixo.
  const match = data.activeMatch;
  const activeTraining = data.activeTraining;

  // Dados derivados usados por mais de uma tela.
  const playerStats = useMemo(
    () => buildPlayerStats(data.players, data.history),
    [data.players, data.history],
  );
  const managedPlayers = useMemo(() => {
    const players = new Map(
      data.players.map((player) => [
        player.id,
        { ...player, registered: true, totalPoints: 0, totalAssists: 0 },
      ]),
    );
    data.history.forEach((game) =>
      (game.events || [])
        .filter((event) => event.type === "goal")
        .forEach((event) => {
          const current = players.get(event.playerId) || {
            id: event.playerId,
            name: event.playerName,
            registered: false,
            totalPoints: 0,
            totalAssists: 0,
          };
          players.set(event.playerId, { ...current, totalPoints: current.totalPoints + 1 });
          if (event.assistPlayerId) {
            const assistant = players.get(event.assistPlayerId) || {
              id: event.assistPlayerId,
              name: event.assistPlayerName,
              registered: false,
              totalPoints: 0,
              totalAssists: 0,
            };
            players.set(event.assistPlayerId, {
              ...assistant,
              totalAssists: assistant.totalAssists + 1,
            });
          }
        }),
    );
    return [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.players, data.history]);
  const playerPageCount = Math.max(1, Math.ceil(data.players.length / PLAYER_PAGE_SIZE));
  const visiblePlayers = useMemo(
    () => data.players.slice((playerPage - 1) * PLAYER_PAGE_SIZE, playerPage * PLAYER_PAGE_SIZE),
    [data.players, playerPage],
  );
  const lastMatchLeaders = useMemo(() => {
    const match = data.history[0];
    if (!match) return [];
    const totals = new Map();
    (match.events || [])
      .filter((event) => event.type === "goal")
      .forEach((event) =>
        totals.set(event.playerId, {
          id: event.playerId,
          name: event.playerName,
          points: (totals.get(event.playerId)?.points || 0) + 1,
        }),
      );
    return [...totals.values()]
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [data.history]);
  const displayName =
    data.profile?.displayName?.trim() ||
    session?.user?.user_metadata?.display_name ||
    session?.user?.email?.split("@")[0] ||
    "Usuário";
  const attendanceConfigured = Array.isArray(data.settings.attendanceIds);
  const presentPlayers = useMemo(
    () =>
      data.players.filter(
        (player) => !attendanceConfigured || data.settings.attendanceIds.includes(player.id),
      ),
    [data.players, data.settings.attendanceIds, attendanceConfigured],
  );
  const evolutionPlayer =
    managedPlayers.find((player) => player.id === evolutionPlayerId) || managedPlayers[0] || null;
  const evolutionGames = useMemo(() => {
    if (!evolutionPlayer) return [];
    return data.history
      .filter(
        (game) =>
          monthKey(game.finishedAt || game.date) === evolutionMonth &&
          playerWasInMatch(game, evolutionPlayer.id),
      )
      .map((game) => {
        const points = pointsInMatch(game, evolutionPlayer.id);
        const assists = (game.events || []).filter(
          (event) => event.type === "goal" && event.assistPlayerId === evolutionPlayer.id,
        ).length;
        const performance = playerPerformance(game, evolutionPlayer.id);
        return { game, points, assists, rating: performance.stars, evaluation: performance.score };
      });
  }, [data.history, evolutionMonth, evolutionPlayer]);
  const evolutionPoints = evolutionGames.reduce((sum, item) => sum + item.points, 0);
  const evolutionAssists = evolutionGames.reduce((sum, item) => sum + item.assists, 0);
  const evolutionAverage = evolutionGames.length ? evolutionPoints / evolutionGames.length : 0;
  const trainingMonthSessions = useMemo(
    () =>
      (data.trainingHistory || []).filter(
        (training) => monthKey(training.finishedAt) === trainingStatsMonth,
      ),
    [data.trainingHistory, trainingStatsMonth],
  );
  const trainingCompletedExercises = trainingMonthSessions
    .flatMap((training) => training.exercises || [])
    .filter((exercise) => exercise.completed || exercise.completedAt);
  const trainingTimeSeconds = trainingCompletedExercises
    .filter((exercise) => exercise.mode === "time")
    .reduce((sum, exercise) => sum + exerciseSeconds(exercise), 0);
  const trainingRepetitions = trainingCompletedExercises
    .filter((exercise) => exercise.mode === "reps")
    .reduce((sum, exercise) => sum + (Number(exercise.target) || 0), 0);
  const trainingPlanRanking = useMemo(() => {
    const totals = new Map();
    trainingMonthSessions.forEach((training) =>
      totals.set(training.name, (totals.get(training.name) || 0) + 1),
    );
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [trainingMonthSessions]);
  const completedTrainingExercises =
    activeTraining?.exercises.filter((exercise) => exercise.completed).length || 0;
  const activeTrainingProgress = activeTraining?.exercises.length
    ? (completedTrainingExercises / activeTraining.exercises.length) * 100
    : 0;
  const publicPageUrl = publicConfig.page
    ? `${window.location.origin}${import.meta.env.BASE_URL}?publico=${publicConfig.page.slug}` +
      `&esporte=${encodeURIComponent(statsSport)}`
    : "";

  // Fecha menus flutuantes ao clicar fora ou pressionar Esc.
  useEffect(() => {
    const closeMenu = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target))
        setProfileMenuOpen(false);
      if (appMenuRef.current && !appMenuRef.current.contains(event.target)) setAppMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setAppMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  // Mantém as seleções e a paginação válidas quando os jogadores mudam.
  useEffect(() => {
    if (!evolutionPlayerId && managedPlayers[0]) setEvolutionPlayerId(managedPlayers[0].id);
    else if (evolutionPlayerId && !managedPlayers.some((player) => player.id === evolutionPlayerId))
      setEvolutionPlayerId(managedPlayers[0]?.id || "");
  }, [evolutionPlayerId, managedPlayers]);

  useEffect(() => {
    if (playerPage > playerPageCount) setPlayerPage(playerPageCount);
  }, [playerPage, playerPageCount]);

  // Salva uma cópia local imediatamente; a nuvem é atualizada em segundo plano.
  useEffect(() => {
    if (ready && session?.user) {
      localStorage.setItem(userStorageKey(session.user.id), JSON.stringify(data));
      dataRef.current = data;
      dirtyRef.current = true;
    }
  }, [data, ready, session?.user?.id]);

  // Aplica e guarda o tema escolhido.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setStatsSport(canonicalSport(data.settings.sport));
  }, [data.settings.sport]);

  // Observa login, logout e links de recuperação de senha do Supabase.
  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthReady(true);
      return undefined;
    }
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setAuthMessage("");
      }
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Carrega primeiro a cópia local e migra dados das versões antigas apenas uma vez.
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
    if (saved.players.some((player) => !normalizeCareer(player.career))) {
      saved = { ...saved, players: rebuildPlayerCareers(saved.players, saved.history) };
    }
    setData(saved);
    dataRef.current = saved;
    setView(saved.activeMatch ? "match" : "setup");
    setReady(true);
  }, [authReady, session?.user?.id]);

  // Atualiza o estado local com os dados protegidos e paginados da nuvem.
  useEffect(() => {
    if (!ready || !session?.user || !supabaseConfigured) {
      cloudLoadedUser.current = null;
      return undefined;
    }
    let cancelled = false;
    const loadCloud = async () => {
      setSyncStatus("loading");
      try {
        const loaded = await loadWorkspace(session.user.id, initialState);
        if (cancelled) return;
        let cloudData = normalizeState(loaded.state);
        if (cloudData.players.some((player) => !normalizeCareer(player.career))) {
          const completeHistory = await loadAllHistory(session.user.id);
          cloudData = {
            ...cloudData,
            players: rebuildPlayerCareers(cloudData.players, completeHistory),
          };
          await saveWorkspace(session.user.id, cloudData);
        }
        setData(cloudData);
        dataRef.current = cloudData;
        if (cloudData.activeMatch) setView("match");
        setHistoryHasMore(loaded.hasMore);
        dirtyRef.current = false;
        cloudLoadedUser.current = session.user.id;
        setSyncStatus("synced");
      } catch (error) {
        if (cancelled) return;
        setSyncStatus("error");
        setAuthMessage(
          `Não foi possível carregar a nuvem. Execute o novo schema.sql: ${error.message}`,
        );
      }
    };
    loadCloud();
    return () => {
      cancelled = true;
    };
  }, [ready, session?.user?.id]);

  // O serviço compara impressões digitais para enviar somente o que mudou.
  const syncNow = useCallback(async () => {
    if (
      !supabaseConfigured ||
      !session?.user ||
      syncingRef.current ||
      cloudLoadedUser.current !== session.user.id
    )
      return;
    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      await saveWorkspace(session.user.id, dataRef.current);
      dirtyRef.current = false;
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      setAuthMessage(`Falha ao sincronizar: ${error.message}`);
    }
    syncingRef.current = false;
  }, [session?.user?.id]);

  // Sincroniza periodicamente sem fazer requisições quando não há alterações.
  useEffect(() => {
    if (!session?.user || !supabaseConfigured) return undefined;
    const interval = window.setInterval(() => {
      if (dirtyRef.current) syncNow();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [session?.user?.id, syncNow]);

  // Cronômetro regressivo da partida.
  useEffect(() => {
    if (!data.activeMatch?.running || data.activeMatch.remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setData((current) => {
        if (!current.activeMatch?.running) return current;
        const next = Math.max(0, current.activeMatch.remainingSeconds - 1);
        return {
          ...current,
          activeMatch: { ...current.activeMatch, remainingSeconds: next, running: next > 0 },
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data.activeMatch?.running]);

  // Cronômetro independente do exercício ativo no modo treino.
  useEffect(() => {
    if (!data.activeTraining?.runningExerciseId) return;
    const timer = window.setInterval(() => {
      setData((current) => {
        const training = current.activeTraining;
        if (!training?.runningExerciseId) return current;
        let finished = false;
        const exercises = training.exercises.map((exercise) => {
          if (exercise.id !== training.runningExerciseId) return exercise;
          const remainingSeconds = Math.max(
            0,
            (exercise.remainingSeconds ?? exerciseSeconds(exercise)) - 1,
          );
          if (remainingSeconds === 0) finished = true;
          return { ...exercise, remainingSeconds };
        });
        return {
          ...current,
          activeTraining: {
            ...training,
            exercises,
            runningExerciseId: finished ? null : training.runningExerciseId,
          },
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data.activeTraining?.runningExerciseId]);

  // Cadastro e preparação da resenha.
  const addPlayer = useCallback(
    (rawName = playerName) => {
      const name = String(rawName).trim().slice(0, 60);
      if (!name) return { ok: false, error: "Informe o nome do jogador." };
      if (data.players.some((player) => player.name.toLowerCase() === name.toLowerCase()))
        return { ok: false, error: "Este jogador já está na lista." };
      const player = { id: uid(), name, career: emptyCareer() };
      setData((current) => ({
        ...current,
        players: [...current.players, player],
        settings: {
          ...current.settings,
          attendanceIds: Array.isArray(current.settings.attendanceIds)
            ? [...current.settings.attendanceIds, player.id]
            : current.settings.attendanceIds,
        },
      }));
      setPlayerPage(Math.ceil((data.players.length + 1) / PLAYER_PAGE_SIZE));
      setPlayerName("");
      nameInput.current?.focus();
      return { ok: true, player };
    },
    [data.players, playerName],
  );

  const startMatch = useCallback(() => {
    setSetupMessage("");
    if (presentPlayers.length < 2) {
      setSetupMessage("Marque pelo menos 2 jogadores presentes.");
      return { ok: false, error: "Marque pelo menos 2 jogadores presentes." };
    }
    const durationSeconds = data.settings.duration * 60;
    const teamCount = Math.max(2, Math.min(TEAM_META.length, Number(data.settings.teamCount) || 2));
    const ratedPlayers = presentPlayers.map((player) => ({
      ...player,
      rating: playerStats.get(player.id)?.rating || 1,
      balanceScore: playerStats.get(player.id)?.matches ? playerStats.get(player.id).evaluation : 6,
      evaluatedGames: playerStats.get(player.id)?.matches || 0,
    }));
    if (ratedPlayers.length < teamCount) {
      setSetupMessage(`Marque pelo menos ${teamCount} jogadores para formar ${teamCount} times.`);
      return { ok: false, error: "Jogadores insuficientes." };
    }
    if (
      data.settings.drawMode === "manual" &&
      ratedPlayers.some(
        (player) =>
          !Number.isInteger(manualAssignments[player.id]) ||
          manualAssignments[player.id] < 0 ||
          manualAssignments[player.id] >= teamCount,
      )
    ) {
      setSetupMessage("Escolha o time de todos os jogadores presentes.");
      return { ok: false, error: "Escolha um time para todos os jogadores presentes." };
    }
    if (
      data.settings.drawMode === "manual" &&
      !Array.from({ length: teamCount }, (_, teamIndex) => teamIndex).every((teamIndex) =>
        ratedPlayers.some((player) => manualAssignments[player.id] === teamIndex),
      )
    ) {
      setSetupMessage("A divisão manual precisa ter pelo menos um jogador em cada time.");
      return { ok: false, error: "Escolha pelo menos um jogador para cada time." };
    }
    const allTeams =
      data.settings.drawMode === "manual"
        ? buildManualTeams(
            ratedPlayers,
            manualAssignments,
            data.settings.startersPerTeam,
            teamCount,
          )
        : drawTeams(ratedPlayers, data.settings.drawMode, data.settings.startersPerTeam, teamCount);
    const match = {
      id: uid(),
      sessionId: uid(),
      roundNumber: 1,
      date: new Date().toISOString(),
      sport: data.settings.sport,
      durationSeconds,
      remainingSeconds: durationSeconds,
      running: false,
      attendanceIds: ratedPlayers.map((player) => player.id),
      teams: allTeams.slice(0, 2),
      reserveTeams: allTeams.slice(2),
      score: [0, 0],
      events: [],
    };
    setData((current) => ({ ...current, activeMatch: match }));
    setMatchMessage(
      allTeams.length > 2
        ? `${allTeams.length} times prontos. Os times de fora ficam na fila da resenha.`
        : "Escalação salva para as próximas partidas desta resenha.",
    );
    setView("match");
    return { ok: true, matchId: match.id };
  }, [data.settings, manualAssignments, playerStats, presentPlayers]);

  // Cada pontuação vira um evento individual, inclusive para a sincronização incremental.
  const registerGoal = useCallback((teamIndex, playerId, assistPlayerId = "") => {
    let result = { ok: false, error: "Jogador não encontrado." };
    setData((current) => {
      const match = current.activeMatch;
      const player = match?.teams[teamIndex]?.starters.find((item) => item.id === playerId);
      const assistPlayer = match?.teams[teamIndex]?.starters.find(
        (item) => item.id === assistPlayerId,
      );
      if (!match || !player) return current;
      const score = [...match.score];
      score[teamIndex] += 1;
      const event = {
        id: uid(),
        type: "goal",
        teamIndex,
        playerId,
        playerName: player.name,
        assistPlayerId: assistPlayer?.id || null,
        assistPlayerName: assistPlayer?.name || null,
        minute: minuteOf(match),
      };
      result = { ok: true, player: player.name, score };
      return { ...current, activeMatch: { ...match, score, events: [event, ...match.events] } };
    });
    setGoalTeam(null);
    setGoalScorer("");
    setGoalAssist("");
    return result;
  }, []);

  // Registra penalidades individuais; o gol contra também altera o placar adversário.
  const registerIncident = useCallback((type, teamIndex, playerId) => {
    setData((current) => {
      const match = current.activeMatch;
      const player = match?.teams[teamIndex]?.starters.find((item) => item.id === playerId);
      if (!match || !player || !["own_goal", "missed_penalty"].includes(type)) return current;
      const score = [...match.score];
      if (type === "own_goal") score[teamIndex === 0 ? 1 : 0] += 1;
      const event = {
        id: uid(),
        type,
        teamIndex,
        playerId: player.id,
        playerName: player.name,
        minute: minuteOf(match),
      };
      return { ...current, activeMatch: { ...match, score, events: [event, ...match.events] } };
    });
    setIncident(null);
    setIncidentPlayer("");
  }, []);

  // Integrações opcionais do ambiente não interferem no uso normal pelo navegador.
  useEffect(() => {
    const context = typeof document === "undefined" ? null : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool) => {
      try {
        Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
      } catch {}
    };
    register({
      name: "add_player",
      title: "Adicionar jogador",
      description: "Adiciona um jogador à lista do Resenha.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ name }) => addPlayer(name),
    });
    register({
      name: "start_match",
      title: "Sortear times e iniciar jogo",
      description: "Sorteia os dois times e abre a partida.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: () => startMatch(),
    });
    register({
      name: "record_goal",
      title: "Registrar gol",
      description: "Registra um gol de um titular na partida atual.",
      inputSchema: {
        type: "object",
        properties: { teamIndex: { type: "number", enum: [0, 1] }, playerId: { type: "string" } },
        required: ["teamIndex", "playerId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: ({ teamIndex, playerId }) => registerGoal(teamIndex, playerId),
    });
    return () => lifecycle.abort();
  }, [addPlayer, registerGoal, startMatch]);

  // Configuração, presença, cronômetro e substituições individuais.
  const updateSettings = (field, value) =>
    setData((current) => ({ ...current, settings: { ...current.settings, [field]: value } }));
  const changeSport = (sport) => {
    const preset = SPORT_PRESETS[sport];
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        sport,
        startersPerTeam: preset.players,
        duration: preset.duration,
      },
    }));
    setStatsSport(sport);
  };
  const toggleAttendance = (playerId) =>
    setData((current) => {
      const currentIds = Array.isArray(current.settings.attendanceIds)
        ? current.settings.attendanceIds
        : current.players.map((player) => player.id);
      const attendanceIds = currentIds.includes(playerId)
        ? currentIds.filter((id) => id !== playerId)
        : [...currentIds, playerId];
      return { ...current, settings: { ...current.settings, attendanceIds } };
    });
  const setAllAttendance = (present) =>
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        attendanceIds: present ? current.players.map((player) => player.id) : [],
      },
    }));
  const toggleTimer = () =>
    setData((current) =>
      !current.activeMatch || current.activeMatch.remainingSeconds === 0
        ? current
        : {
            ...current,
            activeMatch: { ...current.activeMatch, running: !current.activeMatch.running },
          },
    );
  const resetTimer = () =>
    setData((current) => ({
      ...current,
      activeMatch: current.activeMatch
        ? {
            ...current.activeMatch,
            remainingSeconds: current.activeMatch.durationSeconds,
            running: false,
          }
        : null,
    }));

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
      const teams = match.teams.map((team, index) =>
        index !== subTeam
          ? team
          : {
              ...team,
              starters: team.starters.map((player) =>
                player.id === selectedOut ? incoming : player,
              ),
              bench: team.bench.map((player) => (player.id === selectedIn ? out : player)),
            },
      );
      const event = {
        id: uid(),
        type: "sub",
        teamIndex: subTeam,
        playerOut: out.name,
        playerIn: incoming.name,
        minute: minuteOf(match),
      };
      return { ...current, activeMatch: { ...match, teams, events: [event, ...match.events] } };
    });
    setSubTeam(null);
  };

  const undoMatchEvent = (eventId) =>
    setData((current) => {
      const match = current.activeMatch;
      const event = match?.events.find((item) => item.id === eventId);
      if (!match || !event) return current;
      const score = [...match.score];
      if (event.type === "goal") score[event.teamIndex] = Math.max(0, score[event.teamIndex] - 1);
      if (event.type === "own_goal") {
        const benefitedTeam = event.teamIndex === 0 ? 1 : 0;
        score[benefitedTeam] = Math.max(0, score[benefitedTeam] - 1);
      }
      return {
        ...current,
        activeMatch: {
          ...match,
          score,
          events: match.events.filter((item) => item.id !== eventId),
        },
      };
    });

  // Salva a rodada e abre a próxima sem apagar escalação, banco ou times de fora.
  const finishMatch = () => {
    if (!data.activeMatch || finishingRef.current) return;
    finishingRef.current = true;
    const finished = { ...data.activeMatch, running: false, finishedAt: new Date().toISOString() };
    const nextMatch = {
      ...data.activeMatch,
      id: uid(),
      roundNumber: (data.activeMatch.roundNumber || 1) + 1,
      date: new Date().toISOString(),
      remainingSeconds: data.activeMatch.durationSeconds,
      running: false,
      score: [0, 0],
      events: [],
    };
    setData((current) => ({
      ...current,
      players: applyMatchToCareers(current.players, finished, 1),
      history: [finished, ...current.history],
      activeMatch: nextMatch,
    }));
    setMatchMessage(
      `Partida ${finished.roundNumber || 1} salva. A mesma escalação está pronta para a próxima.`,
    );
    setView("match");
    window.setTimeout(() => {
      finishingRef.current = false;
    }, 600);
  };

  // O time substituído retorna para a fila na posição do time que entrou.
  const swapFullTeam = (reserveId) => {
    setData((current) => {
      const match = current.activeMatch;
      if (!match || teamSwapSide === null) return current;
      const reserveIndex = (match.reserveTeams || []).findIndex((team) => team.id === reserveId);
      if (reserveIndex < 0) return current;
      const teams = [...match.teams];
      const reserveTeams = [...match.reserveTeams];
      const outgoing = teams[teamSwapSide];
      teams[teamSwapSide] = reserveTeams[reserveIndex];
      reserveTeams[reserveIndex] = outgoing;
      return { ...current, activeMatch: { ...match, teams, reserveTeams } };
    });
    setMatchMessage("Time completo trocado. A fila de times de fora foi atualizada.");
    setTeamSwapSide(null);
  };

  // Encerra toda a resenha; salvar uma partida isolada não passa por esta função.
  const endSession = () => {
    if (
      !window.confirm(
        "Encerrar a resenha de hoje? A partida atual ainda sem placar não será salva.",
      )
    )
      return;
    setData((current) => ({ ...current, activeMatch: null }));
    setMatchMessage("");
    setView("setup");
  };

  const cancelMatch = () => {
    if (!window.confirm("Descartar a partida atual e encerrar esta resenha?")) return;
    setData((current) => ({ ...current, activeMatch: null }));
    setMatchMessage("");
    setView("setup");
  };

  // Criação, execução e histórico dos treinos pessoais.
  const addTrainingExercise = () => {
    const name = exerciseDraft.name.trim();
    const target = Math.max(1, Number(exerciseDraft.target) || 1);
    if (!name) return;
    setTrainingExercises((current) => [
      ...current,
      {
        id: uid(),
        name,
        mode: exerciseDraft.mode,
        target,
        unit: exerciseDraft.mode === "time" ? exerciseDraft.unit : null,
      },
    ]);
    setExerciseDraft({
      name: "",
      mode: exerciseDraft.mode,
      target: exerciseDraft.mode === "time" ? 30 : 10,
      unit: exerciseDraft.unit,
    });
  };

  const saveTrainingPlan = (event) => {
    event.preventDefault();
    const name = trainingName.trim();
    if (!name || trainingExercises.length === 0) {
      setSettingsMessage("Dê um nome ao treino e adicione pelo menos um exercício.");
      return;
    }
    const plan = {
      id: uid(),
      name,
      days: trainingDays,
      exercises: trainingExercises,
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, trainingPlans: [...(current.trainingPlans || []), plan] }));
    setTrainingName("");
    setTrainingDays([]);
    setTrainingExercises([]);
    setSettingsMessage("Treino salvo no cronograma.");
  };

  const startTraining = (plan) => {
    const exercises = plan.exercises.map((exercise) => ({
      ...exercise,
      completed: false,
      remainingSeconds: exerciseSeconds(exercise),
    }));
    setData((current) => ({
      ...current,
      activeTraining: {
        id: uid(),
        planId: plan.id,
        name: plan.name,
        exercises,
        runningExerciseId: null,
        startedAt: new Date().toISOString(),
      },
    }));
    setView("training");
  };

  const toggleTrainingExerciseDone = (exerciseId) =>
    setData((current) => {
      if (!current.activeTraining) return current;
      const exercises = current.activeTraining.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              completed: !exercise.completed,
              completedAt: !exercise.completed ? new Date().toISOString() : null,
            }
          : exercise,
      );
      return {
        ...current,
        activeTraining: {
          ...current.activeTraining,
          exercises,
          runningExerciseId:
            current.activeTraining.runningExerciseId === exerciseId
              ? null
              : current.activeTraining.runningExerciseId,
        },
      };
    });
  const toggleTrainingTimer = (exerciseId) =>
    setData((current) => {
      const training = current.activeTraining;
      const exercise = training?.exercises.find((item) => item.id === exerciseId);
      if (!training || !exercise || exercise.completed || (exercise.remainingSeconds ?? 0) <= 0)
        return current;
      return {
        ...current,
        activeTraining: {
          ...training,
          runningExerciseId: training.runningExerciseId === exerciseId ? null : exerciseId,
        },
      };
    });
  const resetTrainingTimer = (exerciseId) =>
    setData((current) => {
      if (!current.activeTraining) return current;
      const exercises = current.activeTraining.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, remainingSeconds: exerciseSeconds(exercise) }
          : exercise,
      );
      return {
        ...current,
        activeTraining: {
          ...current.activeTraining,
          exercises,
          runningExerciseId:
            current.activeTraining.runningExerciseId === exerciseId
              ? null
              : current.activeTraining.runningExerciseId,
        },
      };
    });
  const finishTraining = () =>
    setData((current) => {
      const training = current.activeTraining;
      if (!training) return current;
      const finished = {
        id: training.id,
        planId: training.planId,
        name: training.name,
        startedAt: training.startedAt,
        finishedAt: new Date().toISOString(),
        exercises: training.exercises,
      };
      return {
        ...current,
        activeTraining: null,
        trainingHistory: [finished, ...(current.trainingHistory || [])],
      };
    });
  const cancelTraining = () => {
    if (!window.confirm("Encerrar este treino sem registrar os exercícios restantes?")) return;
    setData((current) => ({ ...current, activeTraining: null }));
  };
  const deleteTrainingPlan = (planId) => {
    if (!window.confirm("Excluir este treino do cronograma? O histórico realizado será mantido."))
      return;
    setData((current) => ({
      ...current,
      trainingPlans: (current.trainingPlans || []).filter((plan) => plan.id !== planId),
    }));
  };

  // Rankings mensais sempre respeitam a modalidade escolhida.
  const monthMatches = useMemo(
    () =>
      data.history.filter(
        (match) =>
          monthKey(match.finishedAt || match.date) === month &&
          canonicalSport(match.sport) === canonicalSport(statsSport),
      ),
    [data.history, month, statsSport],
  );
  const rankingData = useMemo(() => {
    const players = new Map();
    monthMatches.forEach((match) => {
      const roster = [
        ...new Map(
          [...(match.teams || []), ...(match.reserveTeams || [])]
            .flatMap((team) => [...(team.starters || []), ...(team.bench || [])])
            .map((player) => [player.id, player]),
        ).values(),
      ];
      roster.forEach((player) => {
        const item = players.get(player.id) || {
          id: player.id,
          name: player.name,
          goals: 0,
          assists: 0,
          games: 0,
          evaluationTotal: 0,
        };
        const performance = playerPerformance(match, player.id);
        item.games += 1;
        item.goals += performance.points;
        item.assists += performance.assists;
        item.evaluationTotal += performance.score;
        players.set(player.id, item);
      });
    });
    return [...players.values()].map((player) => ({
      ...player,
      total: player.goals + player.assists,
      evaluation: player.games ? Number((player.evaluationTotal / player.games).toFixed(1)) : 0,
    }));
  }, [monthMatches]);
  const generalRanking = useMemo(
    () =>
      [...rankingData].sort(
        (a, b) =>
          b.evaluation - a.evaluation ||
          b.total - a.total ||
          b.goals - a.goals ||
          a.name.localeCompare(b.name),
      ),
    [rankingData],
  );
  const goalsRanking = useMemo(
    () =>
      [...rankingData]
        .filter((player) => player.goals > 0)
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    [rankingData],
  );
  const assistsRanking = useMemo(
    () =>
      [...rankingData]
        .filter((player) => player.assists > 0)
        .sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name)),
    [rankingData],
  );

  // Autenticação e recuperação de acesso.
  const submitAuth = async (event) => {
    event.preventDefault();
    if (!supabaseConfigured || authSubmittingRef.current) return;
    authSubmittingRef.current = true;
    setAuthBusy(true);
    setAuthMessage("");
    const credentials = { email: authEmail.trim(), password: authPassword };
    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({
            ...credentials,
            options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
          })
        : await supabase.auth.signInWithPassword(credentials);
    setAuthBusy(false);
    authSubmittingRef.current = false;
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

  const sendPasswordReset = async () => {
    const email = authEmail.trim();
    if (!email) {
      setAuthMessage("Digite seu e-mail para receber o link de recuperação.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
    });
    setAuthBusy(false);
    setAuthMessage(
      error
        ? error.message
        : "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.",
    );
  };

  const submitRecoveryPassword = async (event) => {
    event.preventDefault();
    if (recoveryPassword.length < 6) {
      setAuthMessage("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setAuthMessage("As senhas digitadas não são iguais.");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
    if (!error) await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      setAuthMessage(error.message);
      return;
    }
    setPasswordRecovery(false);
    setRecoveryPassword("");
    setRecoveryConfirm("");
    setAuthMessage("Senha alterada com sucesso. Entre novamente com a nova senha.");
  };

  // Perfil e administração dos registros esportivos.
  const openProfile = () => {
    setProfileName(displayName);
    setProfileMessage("");
    setProfileMenuOpen(false);
    setProfileOpen(true);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextName = profileName.trim();
    if (!nextName) {
      setProfileMessage("Informe o nome que deve aparecer no aplicativo.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { display_name: nextName } });
    setAuthBusy(false);
    if (error) {
      setProfileMessage(error.message);
      return;
    }
    setData((current) => ({ ...current, profile: { displayName: nextName } }));
    setProfileMessage("Perfil atualizado com sucesso.");
  };

  const savePlayerName = () => {
    const nextName = editingPlayer?.name?.trim().slice(0, 60);
    const original = managedPlayers.find((player) => player.id === editingPlayer?.id);
    if (!original || !nextName) return;
    if (
      managedPlayers.some(
        (player) =>
          player.id !== original.id && player.name.toLowerCase() === nextName.toLowerCase(),
      )
    ) {
      setSettingsMessage("Já existe um jogador com esse nome.");
      return;
    }
    setData((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === original.id ? { ...player, name: nextName } : player,
      ),
      activeMatch: renamePlayerInMatch(current.activeMatch, original.id, original.name, nextName),
      history: current.history.map((game) =>
        renamePlayerInMatch(game, original.id, original.name, nextName),
      ),
    }));
    setEditingPlayer(null);
    setSettingsMessage(`${original.name} foi alterado para ${nextName}.`);
  };

  const deletePlayerEverywhere = (player) => {
    if (
      !window.confirm(
        `Excluir ${player.name} do cadastro e remover suas pontuações do histórico? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setData((current) => ({
      ...current,
      players: current.players.filter((item) => item.id !== player.id),
      settings: {
        ...current.settings,
        attendanceIds: Array.isArray(current.settings.attendanceIds)
          ? current.settings.attendanceIds.filter((id) => id !== player.id)
          : current.settings.attendanceIds,
      },
      activeMatch: removePlayerFromMatch(current.activeMatch, player.id),
      history: current.history.map((game) => removePlayerFromMatch(game, player.id)),
    }));
    setSettingsMessage(`${player.name} e suas pontuações foram excluídos.`);
  };

  const openMatchEditor = (game) => {
    setEditingMatch({
      id: game.id,
      date: new Date(game.finishedAt || game.date).toLocaleDateString("sv-SE"),
      sport: game.sport,
      score0: game.score?.[0] || 0,
      score1: game.score?.[1] || 0,
    });
    setSettingsMessage("");
  };

  const saveMatchEdit = (event) => {
    event.preventDefault();
    if (!editingMatch) return;
    const nextDate = new Date(`${editingMatch.date}T12:00:00`).toISOString();
    setData((current) => {
      const previousMatch = current.history.find((game) => game.id === editingMatch.id);
      if (!previousMatch) return current;
      const updatedMatch = {
        ...previousMatch,
        sport: editingMatch.sport,
        date: nextDate,
        finishedAt: nextDate,
        score: [
          Math.max(0, Number(editingMatch.score0) || 0),
          Math.max(0, Number(editingMatch.score1) || 0),
        ],
      };
      const withoutPreviousEvaluation = applyMatchToCareers(current.players, previousMatch, -1);
      return {
        ...current,
        players: applyMatchToCareers(withoutPreviousEvaluation, updatedMatch, 1),
        history: current.history.map((game) => (game.id === editingMatch.id ? updatedMatch : game)),
      };
    });
    setEditingMatch(null);
    setSettingsMessage(
      "Partida atualizada. A artilharia continua baseada nos autores registrados na súmula.",
    );
  };

  const deleteMatch = (game) => {
    const date = new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR");
    if (
      !window.confirm(
        `Excluir a partida de ${date}? As pontuações desse jogo também sairão do ranking.`,
      )
    )
      return;
    setData((current) => ({
      ...current,
      players: applyMatchToCareers(current.players, game, -1),
      history: current.history.filter((item) => item.id !== game.id),
    }));
    setSettingsMessage("Partida e pontuações removidas do histórico.");
  };

  // Segurança da conta e encerramento da sessão autenticada.
  const changeLoggedPassword = async (event) => {
    event.preventDefault();
    if (!currentPassword) {
      setSettingsMessage("Informe a senha atual.");
      return;
    }
    if (newPassword.length < 6) {
      setSettingsMessage("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setSettingsMessage("As senhas digitadas não são iguais.");
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    setAuthBusy(false);
    if (error) {
      setSettingsMessage(
        error.message.toLowerCase().includes("current")
          ? "A senha atual está incorreta."
          : "Não foi possível alterar a senha. Tente novamente.",
      );
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setSettingsMessage("Senha alterada com sucesso.");
  };

  const signOut = async () => {
    if (dirtyRef.current) await syncNow();
    await supabase.auth.signOut();
    setProfileMenuOpen(false);
    setProfileOpen(false);
    setData(initialState);
    dataRef.current = initialState;
    dirtyRef.current = false;
    cloudLoadedUser.current = null;
    setReady(false);
    setSyncStatus("offline");
    setAuthMessage("");
    setView("setup");
  };

  // Paginação do histórico e administração do Mural público.
  const fetchMoreHistory = async () => {
    if (!session?.user || historyLoading || !historyHasMore) return;
    setHistoryLoading(true);
    try {
      const page = await loadMoreHistory(session.user.id, dataRef.current.history.length);
      setData((current) => ({
        ...current,
        history: [
          ...current.history,
          ...page.history.filter((game) => !current.history.some((item) => item.id === game.id)),
        ],
      }));
      setHistoryHasMore(page.hasMore);
    } catch (error) {
      setSettingsMessage(`Não foi possível carregar partidas antigas: ${error.message}`);
    }
    setHistoryLoading(false);
  };

  const refreshPublicConfig = useCallback(async () => {
    if (!session?.user) return;
    try {
      setPublicConfig(await getPublicSettings(session.user.id, `${displayName} · Resenha`));
    } catch (error) {
      setSettingsMessage(`Não foi possível carregar a página pública: ${error.message}`);
    }
  }, [displayName, session?.user?.id]);

  useEffect(() => {
    if ((view === "mural" || view === "stats") && ready) refreshPublicConfig();
  }, [ready, refreshPublicConfig, view]);

  const togglePublicPage = async () => {
    const enabled = !publicConfig.page?.enabled;
    await setPublicEnabled(session.user.id, enabled);
    setPublicConfig((current) => ({ ...current, page: { ...current.page, enabled } }));
    setSettingsMessage(
      enabled
        ? "Página pública ativada. O link permite somente leitura."
        : "Página pública desativada.",
    );
  };

  const saveUpcomingGame = async (event) => {
    event.preventDefault();
    if (!publicDraft.title.trim() || !publicDraft.scheduled_at) return;
    try {
      await addUpcomingGame(session.user.id, {
        title: publicDraft.title.trim(),
        sport: publicDraft.sport,
        scheduled_at: new Date(publicDraft.scheduled_at).toISOString(),
        location: publicDraft.location.trim(),
      });
      setPublicDraft((current) => ({ ...current, scheduled_at: "", location: "" }));
      await refreshPublicConfig();
      setSettingsMessage("Próximo jogo adicionado à página pública.");
    } catch (error) {
      setSettingsMessage(`Não foi possível adicionar o jogo: ${error.message}`);
    }
  };

  const removeUpcomingGame = async (id) => {
    await deleteUpcomingGame(session.user.id, id);
    await refreshPublicConfig();
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicPageUrl);
      setSettingsMessage("Link público copiado.");
    } catch {
      setSettingsMessage(`Copie este endereço: ${publicPageUrl}`);
    }
  };

  const openPublicRanking = () => {
    if (!publicConfig.page?.enabled) {
      setSettingsMessage("Ative o Mural da Resenha para compartilhar o ranking.");
      setView("mural");
      return;
    }
    window.open(publicPageUrl, "_blank", "noopener,noreferrer");
  };

  // O backup é completo; a importação valida estrutura e limites antes de substituir os dados.
  const exportBackup = async () => {
    let backup = dataRef.current;
    try {
      backup = { ...backup, history: await loadAllHistory(session.user.id) };
    } catch {}
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resenha-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Arquivo muito grande");
      const imported = JSON.parse(await file.text());
      const validPlayer = (player) =>
        player &&
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        player.name.trim().length > 0 &&
        player.name.length <= 60;
      const validMatch = (game) =>
        game &&
        typeof game.id === "string" &&
        Array.isArray(game.score) &&
        game.score.length === 2 &&
        Array.isArray(game.teams) &&
        game.teams.length === 2 &&
        game.teams.every((team) => Array.isArray(team?.starters) && Array.isArray(team?.bench)) &&
        Array.isArray(game.events);
      if (
        !Array.isArray(imported.players) ||
        !imported.players.every(validPlayer) ||
        !Array.isArray(imported.history) ||
        !imported.history.every(validMatch) ||
        !imported.settings ||
        typeof imported.settings !== "object"
      )
        throw new Error("Arquivo incompatível");
      if (
        imported.players.length > 500 ||
        imported.history.length > 2000 ||
        (imported.trainingPlans || []).length > 200
      )
        throw new Error("Limites excedidos");
      if (!window.confirm("Substituir os dados atuais pelos dados deste backup?")) return;
      const nextData = {
        ...initialState,
        ...imported,
        profile: { displayName: String(imported.profile?.displayName || "").slice(0, 40) },
        players: imported.players.map((player) => ({
          ...player,
          name: player.name.trim().slice(0, 60),
        })),
        settings: { ...initialState.settings, ...imported.settings },
        activeMatch:
          imported.activeMatch && validMatch(imported.activeMatch) ? imported.activeMatch : null,
        trainingPlans: Array.isArray(imported.trainingPlans) ? imported.trainingPlans : [],
        trainingHistory: Array.isArray(imported.trainingHistory) ? imported.trainingHistory : [],
        activeTraining: null,
      };
      setData(nextData);
      dataRef.current = nextData;
      dirtyRef.current = true;
      setAuthMessage("Backup importado com sucesso.");
    } catch {
      setAuthMessage("O arquivo selecionado não é um backup válido deste aplicativo.");
    }
  };

  const syncLabel = {
    local: "Configuração pendente",
    offline: "Conectando...",
    loading: "Carregando...",
    syncing: "Salvando...",
    synced: "Nuvem sincronizada",
    error: "Erro na nuvem",
  }[syncStatus];
  const publicSlug = new URLSearchParams(window.location.search).get("publico");

  // Portas de entrada da aplicação: configuração, mural, login e recuperação.
  if (!supabaseConfigured) return <AuthSetupRequired theme={theme} setTheme={setTheme} />;
  if (publicSlug)
    return (
      <Suspense fallback={<main className="app-shell loading">Carregando página pública…</main>}>
        <PublicPage slug={publicSlug} />
      </Suspense>
    );
  if (!authReady) return <main className="app-shell loading">Verificando acesso…</main>;
  if (passwordRecovery)
    return (
      <PasswordRecoveryScreen
        password={recoveryPassword}
        setPassword={setRecoveryPassword}
        confirm={recoveryConfirm}
        setConfirm={setRecoveryConfirm}
        message={authMessage}
        busy={authBusy}
        onSubmit={submitRecoveryPassword}
        onBack={() => {
          supabase.auth.signOut();
          setPasswordRecovery(false);
          setAuthMessage("");
        }}
        theme={theme}
        setTheme={setTheme}
      />
    );
  if (!session)
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        message={authMessage}
        busy={authBusy}
        onSubmit={submitAuth}
        onForgot={sendPasswordReset}
        theme={theme}
        setTheme={setTheme}
      />
    );
  if (!ready) return <main className="app-shell loading">Preparando o Resenha…</main>;
  const currentRankingKind = sportKind(statsSport);
  const primaryRanking = currentRankingKind === "football" ? generalRanking : goalsRanking;
  const totalScores = goalsRanking.reduce((sum, player) => sum + player.goals, 0);

  // Interface autenticada principal.
  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("setup")} aria-label="Ir para o início">
          <span className="brand-mark">
            <Goal size={24} />
          </span>
          <span>
            <strong>Resenha</strong>
            <small>Onde o jogo termina e a resenha começa.</small>
          </span>
        </button>
        <div className="topbar-actions">
          <div className="app-menu-area" ref={appMenuRef}>
            <button
              className="menu-trigger"
              onClick={() => setAppMenuOpen((current) => !current)}
              aria-expanded={appMenuOpen}
              aria-haspopup="menu"
            >
              <Menu size={20} />
              <span>Menu</span>
            </button>
            {appMenuOpen && (
              <nav className="app-menu-dropdown" aria-label="Menu principal">
                <button
                  className={view === "setup" ? "active" : ""}
                  onClick={() => {
                    setView("setup");
                    setAppMenuOpen(false);
                  }}
                >
                  <Users size={18} />
                  <span>
                    <strong>Preparar jogo</strong>
                    <small>Presença e divisão dos times</small>
                  </span>
                </button>
                <button
                  className={view === "match" ? "active" : ""}
                  disabled={!match}
                  onClick={() => {
                    setView("match");
                    setAppMenuOpen(false);
                  }}
                >
                  <Activity size={18} />
                  <span>
                    <strong>Partida</strong>
                    <small>Rodadas, placar e times de fora</small>
                  </span>
                </button>
                <button
                  className={view === "stats" ? "active" : ""}
                  onClick={() => {
                    setView("stats");
                    setAppMenuOpen(false);
                  }}
                >
                  <BarChart3 size={18} />
                  <span>
                    <strong>Estatísticas</strong>
                    <small>Classificação por modalidade</small>
                  </span>
                </button>
                <button
                  className={view === "mural" ? "active" : ""}
                  onClick={() => {
                    setSettingsMessage("");
                    setView("mural");
                    setAppMenuOpen(false);
                  }}
                >
                  <Globe2 size={18} />
                  <span>
                    <strong>Mural da Resenha</strong>
                    <small>Ranking público e agenda</small>
                  </span>
                </button>
                <button
                  className={view === "evolution" ? "active" : ""}
                  onClick={() => {
                    setView("evolution");
                    setAppMenuOpen(false);
                  }}
                >
                  <TrendingUp size={18} />
                  <span>
                    <strong>Evolução</strong>
                    <small>Desempenho de cada jogador</small>
                  </span>
                </button>
                <button
                  className={view === "training" ? "active" : ""}
                  onClick={() => {
                    setSettingsMessage("");
                    setView("training");
                    setAppMenuOpen(false);
                  }}
                >
                  <Dumbbell size={18} />
                  <span>
                    <strong>Modo treino</strong>
                    <small>Cronograma e preparação física</small>
                  </span>
                </button>
                <button
                  className={view === "training-stats" ? "active" : ""}
                  onClick={() => {
                    setView("training-stats");
                    setAppMenuOpen(false);
                  }}
                >
                  <ClipboardList size={18} />
                  <span>
                    <strong>Estatísticas de treino</strong>
                    <small>Evolução da preparação pessoal</small>
                  </span>
                </button>
              </nav>
            )}
          </div>
          <button
            className="icon-button theme-button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <div className="profile-area" ref={profileMenuRef}>
            <button
              className="profile-trigger"
              onClick={() => setProfileMenuOpen((current) => !current)}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
            >
              <ProfileAvatar name={displayName} />
              <span>
                <strong>{displayName}</strong>
                <small>{session.user.email}</small>
              </span>
              <ChevronDown size={16} />
            </button>
            {profileMenuOpen && (
              <div className="profile-dropdown" role="menu">
                <button onClick={openProfile} role="menuitem">
                  <UserRound size={17} />
                  <span>
                    <strong>Meu perfil</strong>
                    <small>Nome e inicial</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setSettingsMessage("");
                    setView("settings");
                  }}
                  role="menuitem"
                >
                  <Settings size={17} />
                  <span>
                    <strong>Configurações</strong>
                    <small>Jogadores e partidas</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setSettingsMessage("");
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                    setView("password");
                  }}
                  role="menuitem"
                >
                  <KeyRound size={17} />
                  <span>
                    <strong>Trocar senha</strong>
                    <small>Validar senha atual</small>
                  </span>
                </button>
                <button className="logout-item" onClick={signOut} role="menuitem">
                  <LogOut size={17} />
                  <span>
                    <strong>Sair</strong>
                    <small>Encerrar acesso</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="page-wrap">
        {view === "setup" && (
          <section className="view-grid setup-grid">
            <div className="main-column">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">PASSO 1</span>
                  <h1>Quem vai jogar hoje?</h1>
                </div>
                <span className="count-pill">{data.players.length} cadastrados</span>
              </div>
              <form
                className="add-player"
                onSubmit={(event) => {
                  event.preventDefault();
                  addPlayer();
                }}
              >
                <div className="field grow">
                  <label htmlFor="player-name">Nome do jogador</label>
                  <input
                    ref={nameInput}
                    id="player-name"
                    maxLength="60"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="Ex.: João"
                    autoComplete="off"
                  />
                </div>
                <button className="button primary add-button" type="submit">
                  <UserPlus size={19} /> Adicionar
                </button>
              </form>
              <div className="attendance-toolbar">
                <div>
                  <Check size={18} />
                  <span>
                    <strong>Presença de hoje</strong>
                    <small>
                      {presentPlayers.length} de {data.players.length} confirmados
                    </small>
                  </span>
                </div>
                <div>
                  <button type="button" onClick={() => setAllAttendance(true)}>
                    Todos
                  </button>
                  <button type="button" onClick={() => setAllAttendance(false)}>
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="player-list">
                {data.players.length === 0 ? (
                  <Empty
                    icon={<Users size={28} />}
                    title="A lista ainda está vazia"
                    text="Adicione os amigos que vão participar do jogo."
                  />
                ) : (
                  visiblePlayers.map((player, index) => {
                    const stats = playerStats.get(player.id);
                    const present = presentPlayers.some((item) => item.id === player.id);
                    return (
                      <article
                        className={`player-row ${present ? "is-present" : "is-absent"}`}
                        key={player.id}
                      >
                        <Avatar name={player.name} />
                        <div className="player-info">
                          <strong>{player.name}</strong>
                          <span>
                            Jogador #
                            {String((playerPage - 1) * PLAYER_PAGE_SIZE + index + 1).padStart(
                              2,
                              "0",
                            )}{" "}
                            · {stats.matches} {stats.matches === 1 ? "presença" : "presenças"} ·{" "}
                            {stats.totalPoints} {scoreWord(data.settings.sport, stats.totalPoints)}
                          </span>
                        </div>
                        <div className="player-rating">
                          <Stars
                            rating={stats.rating}
                            label={`Nível geral: ${stats.rating} de 5`}
                          />
                          <small>
                            {stats.label} · média geral{" "}
                            {stats.matches ? stats.evaluation.toFixed(1) : "—"}
                          </small>
                          {stats.lastRating !== null && <em>Último jogo: {stats.lastRating}★</em>}
                        </div>
                        <button
                          className={`presence-button ${present ? "present" : ""}`}
                          type="button"
                          onClick={() => toggleAttendance(player.id)}
                          aria-pressed={present}
                        >
                          {present ? (
                            <>
                              <Check size={15} /> Presente
                            </>
                          ) : (
                            "Ausente"
                          )}
                        </button>
                      </article>
                    );
                  })
                )}
              </div>
              {data.players.length > PLAYER_PAGE_SIZE && (
                <Pagination
                  page={playerPage}
                  pageCount={playerPageCount}
                  onChange={setPlayerPage}
                />
              )}
            </div>
            <aside className="config-card">
              <div className="section-heading compact">
                <div>
                  <span className="eyebrow">PASSO 2</span>
                  <h2>Configurar partida</h2>
                </div>
                <Sparkles size={21} />
              </div>
              <div className="field">
                <label htmlFor="sport">Esporte</label>
                <select
                  id="sport"
                  value={canonicalSport(data.settings.sport)}
                  onChange={(event) => changeSport(event.target.value)}
                >
                  {Object.keys(SPORT_PRESETS).map((sport) => (
                    <option key={sport}>{sport}</option>
                  ))}
                </select>
              </div>
              <div className="three-fields">
                <div className="field">
                  <label htmlFor="duration">Tempo de jogo</label>
                  <div className="input-suffix">
                    <input
                      id="duration"
                      type="number"
                      min="1"
                      max="120"
                      value={data.settings.duration}
                      onChange={(event) =>
                        updateSettings("duration", Math.max(1, Number(event.target.value)))
                      }
                    />
                    <span>min</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="starters">Em jogo por time</label>
                  <input
                    id="starters"
                    type="number"
                    min="1"
                    max="11"
                    value={data.settings.startersPerTeam}
                    onChange={(event) =>
                      updateSettings("startersPerTeam", Math.max(1, Number(event.target.value)))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="team-count">Total de times</label>
                  <select
                    id="team-count"
                    value={data.settings.teamCount || 2}
                    onChange={(event) => updateSettings("teamCount", Number(event.target.value))}
                  >
                    {TEAM_META.map((team, index) => (
                      <option key={team.id} value={index + 1} disabled={index === 0}>
                        {index + 1} {index === 0 ? "time" : "times"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <fieldset className="mode-group">
                <legend>Divisão dos times</legend>
                <Mode
                  active={data.settings.drawMode === "balanced"}
                  onClick={() => updateSettings("drawMode", "balanced")}
                  icon={<Shield size={19} />}
                  title="Equilibrado"
                  text="Usa o desempenho geral"
                />
                <Mode
                  active={data.settings.drawMode === "random"}
                  onClick={() => updateSettings("drawMode", "random")}
                  icon={<Sparkles size={19} />}
                  title="Aleatório"
                  text="Sem considerar nível"
                />
                <Mode
                  active={data.settings.drawMode === "manual"}
                  onClick={() => updateSettings("drawMode", "manual")}
                  icon={<Users size={19} />}
                  title="Manual"
                  text="Escolha cada time"
                />
              </fieldset>
              {data.settings.drawMode === "manual" && (
                <div className="manual-teams">
                  <header>
                    <strong>Divisão manual</strong>
                    <small>Defina o time dos presentes</small>
                  </header>
                  {presentPlayers.map((player) => (
                    <div className="manual-player" key={player.id}>
                      <span>{player.name}</span>
                      <div>
                        {TEAM_META.slice(0, data.settings.teamCount || 2).map((team, teamIndex) => (
                          <button
                            type="button"
                            key={team.id}
                            className={`${team.color} ${manualAssignments[player.id] === teamIndex ? "active" : ""}`}
                            onClick={() =>
                              setManualAssignments((current) => ({
                                ...current,
                                [player.id]: teamIndex,
                              }))
                            }
                          >
                            {team.short}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="config-summary">
                <Clock3 size={18} />
                <span>
                  <strong>{data.settings.duration} minutos</strong> ·{" "}
                  {data.settings.startersPerTeam} em jogo · {data.settings.teamCount || 2} times
                </span>
              </div>
              <button
                className="button primary large full"
                onClick={startMatch}
                disabled={presentPlayers.length < 2}
              >
                {data.settings.drawMode === "manual"
                  ? "Confirmar times e abrir jogo"
                  : "Sortear times e abrir jogo"}{" "}
                <ChevronRight size={20} />
              </button>
              {(presentPlayers.length < 2 || setupMessage) && (
                <p className="helper error-helper">
                  {setupMessage || "Marque pelo menos 2 jogadores presentes."}
                </p>
              )}
              <section className="last-leaders">
                <header>
                  <span>
                    <Trophy size={18} />
                  </span>
                  <div>
                    <strong>Destaques do último jogo</strong>
                    <small>
                      {data.history[0]
                        ? new Date(
                            data.history[0].finishedAt || data.history[0].date,
                          ).toLocaleDateString("pt-BR")
                        : "Aguardando a primeira partida"}
                    </small>
                  </div>
                </header>
                {lastMatchLeaders.length ? (
                  <div>
                    {lastMatchLeaders.map((leader, index) => (
                      <div className="last-leader-row" key={leader.id}>
                        <b>{index + 1}</b>
                        <Avatar name={leader.name} />
                        <span>{leader.name}</span>
                        <strong>
                          {leader.points} {scoreWord(data.history[0]?.sport, leader.points)}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Encerre uma partida com pontuação para ver o pódio aqui.</p>
                )}
              </section>
            </aside>
          </section>
        )}

        {view === "match" && match && (
          <section className="match-view">
            <div className="session-bar">
              <div>
                <span className="eyebrow">RESENHA EM ANDAMENTO</span>
                <strong>Partida {match.roundNumber || 1}</strong>
                <small>
                  {matchMessage || "A escalação continuará salva quando esta partida terminar."}
                </small>
              </div>
              <button className="button secondary" type="button" onClick={endSession}>
                <X size={17} /> Encerrar resenha
              </button>
            </div>
            <section className="match-score-hero" aria-label="Placar da partida">
              <div className="scoreboard">
                <TeamScore team={match.teams[0]} score={match.score[0]} />
                <div className="timer-panel">
                  <span className={match.running ? "live-label" : "live-label paused"}>
                    {match.running
                      ? "EM JOGO"
                      : match.remainingSeconds === 0
                        ? "FIM DO TEMPO"
                        : "PAUSADO"}
                  </span>
                  <strong className={match.remainingSeconds <= 60 ? "ending" : ""}>
                    {formatTime(match.remainingSeconds)}
                  </strong>
                  <div className="timer-actions">
                    <button className="button timer-button" onClick={toggleTimer}>
                      {match.running ? <CirclePause size={19} /> : <CirclePlay size={19} />}
                      {match.running ? "Pausar" : "Iniciar"}
                    </button>
                    <button
                      className="icon-button"
                      onClick={resetTimer}
                      aria-label="Reiniciar cronômetro"
                    >
                      <RotateCcw size={18} />
                    </button>
                  </div>
                </div>
                <TeamScore team={match.teams[1]} score={match.score[1]} />
              </div>
              <MatchScorers match={match} />
            </section>
            {(match.reserveTeams || []).length > 0 && (
              <section className="reserve-teams">
                <header>
                  <div>
                    <span className="eyebrow">FILA DA RESENHA</span>
                    <h2>Times de fora</h2>
                  </div>
                  <small>
                    {match.events.length || match.running
                      ? "Salve a partida atual antes de trocar um time completo."
                      : "Troque um lado inteiro sem refazer a escalação."}
                  </small>
                </header>
                <div>
                  {match.reserveTeams.map((team) => (
                    <article className={`reserve-team ${team.color}`} key={team.id}>
                      <span className="team-dot" />
                      <div>
                        <strong>{team.name}</strong>
                        <small>
                          {team.starters.length + team.bench.length} jogadores ·{" "}
                          {team.starters.map((player) => player.name).join(", ")}
                        </small>
                      </div>
                      <div>
                        <button
                          className="button secondary"
                          disabled={Boolean(match.events.length || match.running)}
                          onClick={() => setTeamSwapSide(0)}
                        >
                          Entra no lado esquerdo
                        </button>
                        <button
                          className="button secondary"
                          disabled={Boolean(match.events.length || match.running)}
                          onClick={() => setTeamSwapSide(1)}
                        >
                          Entra no lado direito
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <div className="match-grid">
              {match.teams.map((team, teamIndex) => (
                <TeamCard
                  key={team.name}
                  team={team}
                  scoreLabel={scoreAction(match.sport)}
                  onGoal={() => {
                    setGoalTeam(teamIndex);
                    setGoalScorer("");
                    setGoalAssist("");
                  }}
                  onOwnGoal={() => {
                    setIncident({ type: "own_goal", teamIndex });
                    setIncidentPlayer("");
                  }}
                  onMissedPenalty={() => {
                    setIncident({ type: "missed_penalty", teamIndex });
                    setIncidentPlayer("");
                  }}
                  showFootballActions={sportKind(match.sport) === "football"}
                  onSub={() => openSubstitution(teamIndex)}
                />
              ))}
              <aside className="events-card">
                <header>
                  <div>
                    <span className="eyebrow">SÚMULA</span>
                    <h2>Lances do jogo</h2>
                  </div>
                  <span className="event-count">{match.events.length}</span>
                </header>
                <div className="events-list">
                  {match.events.length === 0 ? (
                    <div className="empty-events">
                      <Activity size={25} />
                      <span>As pontuações e trocas aparecerão aqui.</span>
                    </div>
                  ) : (
                    match.events.map((event) => (
                      <MatchEventRow
                        event={event}
                        match={match}
                        onUndo={() => undoMatchEvent(event.id)}
                        key={event.id}
                      />
                    ))
                  )}
                </div>
                <div className="finish-actions">
                  <button className="button primary full" onClick={finishMatch}>
                    <Check size={18} /> Salvar partida e continuar
                  </button>
                  <small>A escalação e os times de fora serão mantidos.</small>
                  <button className="text-button danger-text" onClick={cancelMatch}>
                    Descartar partida e encerrar
                  </button>
                </div>
              </aside>
            </div>
          </section>
        )}

        {view === "stats" && (
          <section className="stats-view">
            <div className="section-heading stats-heading">
              <div>
                <span className="eyebrow">ESTATÍSTICAS DA RESENHA</span>
                <h1>Classificação de {statsSport}</h1>
                <p className="section-description">
                  Cada modalidade tem sua própria tabela e seus próprios números.
                </p>
              </div>
              <div className="stats-filters">
                <select value={statsSport} onChange={(event) => setStatsSport(event.target.value)}>
                  {Object.keys(SPORT_PRESETS).map((sport) => (
                    <option key={sport}>{sport}</option>
                  ))}
                </select>
                <label className="month-picker">
                  <CalendarDays size={18} />
                  <input
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <nav className="stats-sections" aria-label="Tipos de estatística">
              <button
                className={statsSection === "ranking" ? "active" : ""}
                onClick={() => setStatsSection("ranking")}
              >
                <Trophy size={18} /> Classificação
              </button>
              <button
                className={statsSection === "scorers" ? "active" : ""}
                onClick={() => setStatsSection("scorers")}
              >
                <Goal size={18} />{" "}
                {currentRankingKind === "football" ? "Gols e assistências" : "Pontuadores"}
              </button>
              <button
                className={statsSection === "results" ? "active" : ""}
                onClick={() => setStatsSection("results")}
              >
                <CalendarDays size={18} /> Resultados
              </button>
            </nav>
            {statsSection === "ranking" && (
              <>
                <div className="summary-strip">
                  <Summary
                    icon={<Trophy size={20} />}
                    label="Líder geral"
                    value={primaryRanking[0]?.name || "—"}
                  />
                  <Summary
                    icon={<Goal size={20} />}
                    label={`${scoreAction(statsSport)}s no mês`}
                    value={totalScores}
                  />
                  <Summary
                    icon={<CalendarDays size={20} />}
                    label="Jogos realizados"
                    value={monthMatches.length}
                  />
                </div>
                <article className="ranking-table-card">
                  <header>
                    <div>
                      <span className="eyebrow">TABELA OFICIAL DA ZOEIRA</span>
                      <h2>Ranking geral</h2>
                    </div>
                    <button className="button secondary" onClick={openPublicRanking}>
                      <Globe2 size={17} /> Abrir no Mural
                    </button>
                  </header>
                  <p className="rating-explanation">
                    <Shield size={16} /> Avaliação começa em 6,0 por presença e soma desempenho:{" "}
                    {currentRankingKind === "football"
                      ? "+0,8 por gol, +0,5 por assistência"
                      : currentRankingKind === "volleyball"
                        ? "+0,35 por ponto"
                        : currentRankingKind === "basketball"
                          ? "+0,25 por cesta"
                          : "+0,5 por ponto"}
                    , além de +0,4 por vitória, +0,2 por empate, -0,2 por derrota, -0,5 por gol
                    contra e -0,3 por pênalti perdido.
                  </p>
                  <PerformanceTable ranking={generalRanking} sport={statsSport} />
                </article>
              </>
            )}
            {statsSection === "scorers" && (
              <div
                className={`ranking-panels ${currentRankingKind === "football" ? "three" : "single"}`}
              >
                {currentRankingKind === "football" ? (
                  <>
                    <RankingPanel
                      title="Participações"
                      eyebrow="GOLS + ASSISTÊNCIAS"
                      ranking={[...rankingData].sort(
                        (a, b) => b.total - a.total || b.goals - a.goals,
                      )}
                      valueKey="total"
                      valueLabel="participações"
                    />
                    <RankingPanel
                      title="Assistências"
                      eyebrow="GARÇONS DO MÊS"
                      ranking={assistsRanking}
                      valueKey="assists"
                      valueLabel="assistências"
                    />
                    <RankingPanel
                      title="Gols"
                      eyebrow="ARTILHARIA"
                      ranking={goalsRanking}
                      valueKey="goals"
                      valueLabel="gols"
                    />
                  </>
                ) : (
                  <RankingPanel
                    title={
                      currentRankingKind === "basketball"
                        ? "Cestinhas do mês"
                        : currentRankingKind === "volleyball"
                          ? "Pontuadores do mês"
                          : "Artilheiros do mês"
                    }
                    eyebrow="RANKING"
                    ranking={goalsRanking}
                    valueKey="goals"
                    valueLabel={
                      currentRankingKind === "basketball"
                        ? "cestas"
                        : currentRankingKind === "volleyball"
                          ? "pontos"
                          : "gols"
                    }
                  />
                )}
              </div>
            )}
            {statsSection === "results" && (
              <article className="history-card stats-history">
                <header>
                  <div>
                    <span className="eyebrow">HISTÓRICO</span>
                    <h2>Jogos de {statsSport} no mês</h2>
                  </div>
                </header>
                {monthMatches.length === 0 ? (
                  <Empty
                    icon={<CalendarDays size={28} />}
                    title="Nenhum jogo nesta seleção"
                    text="Altere o mês ou carregue partidas anteriores."
                  />
                ) : (
                  <div className="history-list">
                    {monthMatches.map((game) => (
                      <div className="history-row" key={game.id}>
                        <div className="history-date">
                          <strong>
                            {new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </strong>
                          <small>
                            {canonicalSport(game.sport)} ·{" "}
                            {
                              (
                                game.attendanceIds ||
                                game.teams.flatMap((team) => [...team.starters, ...team.bench])
                              ).length
                            }{" "}
                            presentes
                          </small>
                        </div>
                        <div className="history-score">
                          <span>{game.teams[0].short}</span>
                          <strong>
                            {game.score[0]} <i>×</i> {game.score[1]}
                          </strong>
                          <span>{game.teams[1].short}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {historyHasMore && (
                  <button
                    className="button secondary history-load-more"
                    onClick={fetchMoreHistory}
                    disabled={historyLoading}
                  >
                    <RefreshCw size={17} />{" "}
                    {historyLoading ? "Carregando…" : `Carregar mais ${HISTORY_PAGE_SIZE} partidas`}
                  </button>
                )}
              </article>
            )}
          </section>
        )}

        {view === "evolution" && (
          <section className="evolution-view">
            <div className="evolution-hero">
              <div>
                <span className="eyebrow">DESEMPENHO INDIVIDUAL</span>
                <h1>Evolução mensal</h1>
                <p>
                  Escolha o atleta e o período para visualizar presença, produção e nível em cada
                  partida.
                </p>
              </div>
              <div className="evolution-selector-card">
                <ProfileAvatar name={evolutionPlayer?.name || "Atleta"} large />
                <label>
                  <span>
                    <UserRound size={15} /> Atleta
                  </span>
                  <select
                    value={evolutionPlayer?.id || ""}
                    onChange={(event) => setEvolutionPlayerId(event.target.value)}
                    disabled={!managedPlayers.length}
                  >
                    {managedPlayers.length ? (
                      managedPlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))
                    ) : (
                      <option>Nenhum jogador</option>
                    )}
                  </select>
                </label>
                <label>
                  <span>
                    <CalendarDays size={15} /> Período
                  </span>
                  <input
                    type="month"
                    value={evolutionMonth}
                    onChange={(event) => setEvolutionMonth(event.target.value)}
                  />
                </label>
              </div>
            </div>
            {!evolutionPlayer ? (
              <article className="settings-card">
                <Empty
                  icon={<TrendingUp size={30} />}
                  title="Nenhum jogador disponível"
                  text="Cadastre jogadores e encerre partidas para acompanhar a evolução."
                />
              </article>
            ) : (
              <>
                <div className="summary-strip evolution-summary">
                  <Summary
                    icon={<CalendarDays size={20} />}
                    label="Presenças no mês"
                    value={evolutionGames.length}
                  />
                  <Summary icon={<Goal size={20} />} label="Pontuações" value={evolutionPoints} />
                  <Summary
                    icon={<Sparkles size={20} />}
                    label="Assistências"
                    value={evolutionAssists}
                  />
                  <Summary
                    icon={<TrendingUp size={20} />}
                    label="Média por partida"
                    value={evolutionAverage.toFixed(1)}
                  />
                </div>
                <div className="evolution-grid">
                  <article className="evolution-profile-card">
                    <ProfileAvatar name={evolutionPlayer.name} large />
                    <div>
                      <span className="eyebrow">NÍVEL GERAL</span>
                      <h2>{evolutionPlayer.name}</h2>
                      <Stars
                        rating={playerStats.get(evolutionPlayer.id)?.rating || 1}
                        label="Nível geral do jogador"
                      />
                      <p>
                        {playerStats.get(evolutionPlayer.id)?.label || ratingLabel(1)} · avaliação{" "}
                        {playerStats.get(evolutionPlayer.id)?.evaluation?.toFixed(1) || "—"}
                      </p>
                    </div>
                  </article>
                  <article className="evolution-chart-card">
                    <header>
                      <div>
                        <span className="eyebrow">POR PARTIDA</span>
                        <h2>Produção no mês</h2>
                      </div>
                    </header>
                    {evolutionGames.length === 0 ? (
                      <Empty
                        icon={<BarChart3 size={28} />}
                        title="Sem partidas neste mês"
                        text="As presenças e o desempenho aparecerão depois de uma partida salva."
                      />
                    ) : (
                      <div className="evolution-game-list">
                        {evolutionGames.map(({ game, points, assists, rating, evaluation }) => (
                          <div className="evolution-game-row" key={game.id}>
                            <div>
                              <strong>
                                {new Date(game.finishedAt || game.date).toLocaleDateString(
                                  "pt-BR",
                                  { day: "2-digit", month: "short" },
                                )}
                              </strong>
                              <small>
                                {canonicalSport(game.sport)} · nota {evaluation.toFixed(1)}
                              </small>
                            </div>
                            <div className="performance-bars">
                              <span style={{ "--bar": `${Math.min(100, points * 20)}%` }}>
                                <i />
                                {points} {scoreWord(game.sport, points)}
                              </span>
                              {sportKind(game.sport) === "football" && (
                                <span
                                  className="assist-bar"
                                  style={{ "--bar": `${Math.min(100, assists * 25)}%` }}
                                >
                                  <i />
                                  {assists} assist.
                                </span>
                              )}
                            </div>
                            <Stars rating={rating} label={`Nível da partida: ${rating} estrelas`} />
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>
        )}

        {view === "training" && (
          <section className="training-view">
            <div className="section-heading settings-heading">
              <div>
                <span className="eyebrow">PREPARAÇÃO FÍSICA</span>
                <h1>Modo treino</h1>
                <p>
                  Monte rotinas por tempo ou repetições, organize os dias e registre o que foi
                  concluído.
                </p>
              </div>
              <Dumbbell size={29} />
            </div>
            {settingsMessage && (
              <p className="settings-message" role="status">
                {settingsMessage}
              </p>
            )}
            {activeTraining ? (
              <article className="active-training-card training-checklist-card">
                <header>
                  <div>
                    <span className="live-label">TREINO EM ANDAMENTO</span>
                    <h2>{activeTraining.name}</h2>
                    <p>
                      {completedTrainingExercises} de {activeTraining.exercises.length} exercícios
                      concluídos
                    </p>
                  </div>
                  <button className="text-button danger-text" onClick={cancelTraining}>
                    Cancelar treino
                  </button>
                </header>
                <div className="training-exercise-checklist">
                  {activeTraining.exercises.map((exercise, index) => {
                    const running = activeTraining.runningExerciseId === exercise.id;
                    const remaining = exercise.remainingSeconds ?? exerciseSeconds(exercise);
                    return (
                      <article
                        className={
                          exercise.completed
                            ? "training-exercise-row completed"
                            : "training-exercise-row"
                        }
                        key={exercise.id}
                      >
                        <label className="exercise-checkbox">
                          <input
                            type="checkbox"
                            checked={Boolean(exercise.completed)}
                            onChange={() => toggleTrainingExerciseDone(exercise.id)}
                          />
                          <span>
                            <Check size={15} />
                          </span>
                        </label>
                        <div className="exercise-main">
                          <small>EXERCÍCIO {index + 1}</small>
                          <strong>{exercise.name}</strong>
                          <em>{exerciseTargetLabel(exercise)}</em>
                        </div>
                        {exercise.mode === "time" ? (
                          <>
                            <b className={remaining === 0 ? "timer-finished" : ""}>
                              {formatTime(remaining)}
                            </b>
                            <div className="exercise-timer-controls">
                              <button
                                className="icon-button"
                                onClick={() => toggleTrainingTimer(exercise.id)}
                                disabled={exercise.completed || remaining === 0}
                                aria-label={running ? "Pausar cronômetro" : "Iniciar cronômetro"}
                              >
                                {running ? <CirclePause size={18} /> : <CirclePlay size={18} />}
                              </button>
                              <button
                                className="icon-button"
                                onClick={() => resetTrainingTimer(exercise.id)}
                                disabled={exercise.completed}
                                aria-label="Reiniciar cronômetro"
                              >
                                <RotateCcw size={17} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <b className="reps-value">
                            {exercise.target}
                            <small> rep.</small>
                          </b>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="training-progress">
                  <i
                    style={{
                      width: `${activeTrainingProgress}%`,
                    }}
                  />
                </div>
                <button
                  className="button primary large full"
                  onClick={finishTraining}
                  disabled={!activeTraining.exercises.some((exercise) => exercise.completed)}
                >
                  <Check size={18} /> Finalizar e registrar treino
                </button>
              </article>
            ) : (
              <div className="training-layout">
                <article className="settings-card training-builder">
                  <header>
                    <span>
                      <Plus size={20} />
                    </span>
                    <div>
                      <h2>Criar treino</h2>
                      <p>Adicione exercícios e escolha os dias planejados.</p>
                    </div>
                  </header>
                  <form onSubmit={saveTrainingPlan}>
                    <div className="field">
                      <label htmlFor="training-name">Nome do treino</label>
                      <input
                        id="training-name"
                        value={trainingName}
                        onChange={(event) => setTrainingName(event.target.value)}
                        placeholder="Ex.: Condicionamento de terça"
                      />
                    </div>
                    <fieldset className="day-picker">
                      <legend>Dias do cronograma</legend>
                      {TRAINING_DAYS.map((day) => (
                        <button
                          type="button"
                          key={day}
                          className={trainingDays.includes(day) ? "active" : ""}
                          onClick={() =>
                            setTrainingDays((current) =>
                              current.includes(day)
                                ? current.filter((item) => item !== day)
                                : [...current, day],
                            )
                          }
                        >
                          {day}
                        </button>
                      ))}
                    </fieldset>
                    <div className="exercise-composer">
                      <div className="field grow">
                        <label htmlFor="exercise-name">Exercício</label>
                        <input
                          id="exercise-name"
                          value={exerciseDraft.name}
                          onChange={(event) =>
                            setExerciseDraft({ ...exerciseDraft, name: event.target.value })
                          }
                          placeholder="Ex.: Agachamento"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="exercise-mode">Controle</label>
                        <select
                          id="exercise-mode"
                          value={exerciseDraft.mode}
                          onChange={(event) =>
                            setExerciseDraft({
                              ...exerciseDraft,
                              mode: event.target.value,
                              target: event.target.value === "time" ? 30 : 10,
                            })
                          }
                        >
                          <option value="time">Tempo</option>
                          <option value="reps">Repetições</option>
                        </select>
                      </div>
                      <div className="field target-field">
                        <label htmlFor="exercise-target">Quantidade</label>
                        <input
                          id="exercise-target"
                          type="number"
                          min="1"
                          value={exerciseDraft.target}
                          onChange={(event) =>
                            setExerciseDraft({ ...exerciseDraft, target: event.target.value })
                          }
                        />
                      </div>
                      {exerciseDraft.mode === "time" && (
                        <div className="field unit-field">
                          <label htmlFor="exercise-unit">Unidade</label>
                          <select
                            id="exercise-unit"
                            value={exerciseDraft.unit}
                            onChange={(event) =>
                              setExerciseDraft({ ...exerciseDraft, unit: event.target.value })
                            }
                          >
                            <option value="seconds">Segundos</option>
                            <option value="minutes">Minutos</option>
                            <option value="hours">Horas</option>
                          </select>
                        </div>
                      )}
                      <button
                        className="icon-button add-exercise"
                        type="button"
                        onClick={addTrainingExercise}
                        aria-label="Adicionar exercício"
                      >
                        <Plus size={19} />
                      </button>
                    </div>
                    {trainingExercises.length > 0 && (
                      <div className="draft-exercises">
                        {trainingExercises.map((exercise, index) => (
                          <div key={exercise.id}>
                            <b>{index + 1}</b>
                            <span>
                              <strong>{exercise.name}</strong>
                              <small>{exerciseTargetLabel(exercise)}</small>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setTrainingExercises((current) =>
                                  current.filter((item) => item.id !== exercise.id),
                                )
                              }
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      className="button primary large full"
                      disabled={!trainingName.trim() || !trainingExercises.length}
                    >
                      <Save size={18} /> Salvar no cronograma
                    </button>
                  </form>
                </article>
                <div className="training-side">
                  <article className="settings-card">
                    <header>
                      <span>
                        <ClipboardList size={20} />
                      </span>
                      <div>
                        <h2>Meus treinos</h2>
                        <p>Escolha uma rotina para começar.</p>
                      </div>
                      <b>{(data.trainingPlans || []).length}</b>
                    </header>
                    {(data.trainingPlans || []).length === 0 ? (
                      <Empty
                        icon={<Dumbbell size={28} />}
                        title="Nenhum treino criado"
                        text="Monte sua primeira rotina ao lado."
                      />
                    ) : (
                      <div className="training-plan-list">
                        {data.trainingPlans.map((plan) => (
                          <div className="training-plan" key={plan.id}>
                            <div>
                              <strong>{plan.name}</strong>
                              <small>
                                {plan.exercises.length} exercícios ·{" "}
                                {plan.days?.length ? plan.days.join(", ") : "sem dias definidos"}
                              </small>
                            </div>
                            <button className="button primary" onClick={() => startTraining(plan)}>
                              <CirclePlay size={16} /> Iniciar
                            </button>
                            <button
                              className="icon-button danger"
                              onClick={() => deleteTrainingPlan(plan.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                  <article className="settings-card training-history-card">
                    <header>
                      <span>
                        <Check size={20} />
                      </span>
                      <div>
                        <h2>Atividades concluídas</h2>
                        <p>Registro dos treinos realizados.</p>
                      </div>
                    </header>
                    {(data.trainingHistory || []).length === 0 ? (
                      <p className="training-empty-text">Nenhum treino concluído ainda.</p>
                    ) : (
                      <div className="training-history">
                        {data.trainingHistory.slice(0, 8).map((training) => (
                          <div key={training.id}>
                            <Check size={15} />
                            <span>
                              <strong>{training.name}</strong>
                              <small>
                                {new Date(training.finishedAt).toLocaleDateString("pt-BR")} ·{" "}
                                {
                                  (training.exercises || []).filter(
                                    (exercise) => exercise.completed || exercise.completedAt,
                                  ).length
                                }{" "}
                                concluídos
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "training-stats" && (
          <section className="training-stats-view">
            <div className="section-heading stats-heading training-stats-heading">
              <div>
                <span className="eyebrow">EVOLUÇÃO PESSOAL</span>
                <h1>Estatísticas de treino</h1>
                <p className="section-description">
                  Acompanhe a frequência, o volume e os exercícios concluídos.
                </p>
              </div>
              <label className="month-picker">
                <CalendarDays size={18} />
                <input
                  type="month"
                  value={trainingStatsMonth}
                  onChange={(event) => setTrainingStatsMonth(event.target.value)}
                />
              </label>
            </div>
            <div className="summary-strip evolution-summary">
              <Summary
                icon={<Dumbbell size={20} />}
                label="Treinos realizados"
                value={trainingMonthSessions.length}
              />
              <Summary
                icon={<Check size={20} />}
                label="Exercícios concluídos"
                value={trainingCompletedExercises.length}
              />
              <Summary
                icon={<Clock3 size={20} />}
                label="Tempo planejado"
                value={formatTrainingDuration(trainingTimeSeconds)}
              />
              <Summary
                icon={<Activity size={20} />}
                label="Repetições"
                value={trainingRepetitions}
              />
            </div>
            <div className="training-stats-grid">
              <article className="settings-card">
                <header>
                  <span>
                    <TrendingUp size={20} />
                  </span>
                  <div>
                    <h2>Frequência por treino</h2>
                    <p>Quantas vezes cada rotina foi registrada no mês.</p>
                  </div>
                </header>
                {trainingPlanRanking.length === 0 ? (
                  <Empty
                    icon={<BarChart3 size={28} />}
                    title="Sem treinos neste mês"
                    text="Finalize um treino para começar o acompanhamento."
                  />
                ) : (
                  <div className="training-frequency-list">
                    {trainingPlanRanking.map(([name, total], index) => (
                      <div key={name}>
                        <b>{index + 1}</b>
                        <span>
                          <strong>{name}</strong>
                          <i>
                            <em
                              style={{
                                width: `${Math.max(8, (total / trainingPlanRanking[0][1]) * 100)}%`,
                              }}
                            />
                          </i>
                        </span>
                        <strong>{total}x</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>
              <article className="settings-card">
                <header>
                  <span>
                    <ClipboardList size={20} />
                  </span>
                  <div>
                    <h2>Sessões do mês</h2>
                    <p>Detalhes dos treinos registrados.</p>
                  </div>
                </header>
                {trainingMonthSessions.length === 0 ? (
                  <p className="training-empty-text">Nenhuma sessão encontrada.</p>
                ) : (
                  <div className="training-session-list">
                    {trainingMonthSessions.map((training) => {
                      const completed = (training.exercises || []).filter(
                        (exercise) => exercise.completed || exercise.completedAt,
                      );
                      return (
                        <div key={training.id}>
                          <span className="match-date-badge">
                            {new Date(training.finishedAt).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                          <div>
                            <strong>{training.name}</strong>
                            <small>
                              {completed.length} de {(training.exercises || []).length} exercícios
                              concluídos
                            </small>
                          </div>
                          <b>
                            {completed.length === (training.exercises || []).length
                              ? "Completo"
                              : "Parcial"}
                          </b>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>
          </section>
        )}

        {view === "mural" && (
          <section className="mural-view">
            <div className="mural-hero">
              <div>
                <span className="eyebrow">A TABELA OFICIAL DA ZOEIRA</span>
                <h1>Mural da Resenha</h1>
                <p>
                  Um placar público para a galera conferir rankings, próximos jogos e resultados —
                  sem poder alterar nada.
                </p>
              </div>
              <Globe2 size={46} />
            </div>
            {settingsMessage && (
              <p className="settings-message" role="status">
                {settingsMessage}
              </p>
            )}
            <article className="settings-card public-settings-card">
              <header>
                <span>
                  <Globe2 size={20} />
                </span>
                <div>
                  <h2>Compartilhar o Mural</h2>
                  <p>O link é público, mas continua estritamente em modo de leitura.</p>
                </div>
                {publicConfig.page && (
                  <b className={`public-status ${publicConfig.page.enabled ? "enabled" : ""}`}>
                    {publicConfig.page.enabled ? "No ar" : "Desativado"}
                  </b>
                )}
              </header>
              {publicConfig.page && (
                <>
                  <div className="public-link-row">
                    <code>{publicPageUrl}</code>
                    <button className="button secondary" onClick={copyPublicLink}>
                      <Copy size={16} /> Copiar link
                    </button>
                    <button
                      className={`button ${publicConfig.page.enabled ? "secondary" : "primary"}`}
                      onClick={togglePublicPage}
                    >
                      {publicConfig.page.enabled ? "Tirar do ar" : "Colocar no ar"}
                    </button>
                  </div>
                  <form className="upcoming-form" onSubmit={saveUpcomingGame}>
                    <div className="field">
                      <label htmlFor="public-game-title">Nome do próximo jogo</label>
                      <input
                        id="public-game-title"
                        maxLength="80"
                        value={publicDraft.title}
                        onChange={(event) =>
                          setPublicDraft({ ...publicDraft, title: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="public-game-sport">Esporte</label>
                      <select
                        id="public-game-sport"
                        value={publicDraft.sport}
                        onChange={(event) =>
                          setPublicDraft({ ...publicDraft, sport: event.target.value })
                        }
                      >
                        {Object.keys(SPORT_PRESETS).map((sport) => (
                          <option key={sport}>{sport}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="public-game-date">Data e horário</label>
                      <input
                        id="public-game-date"
                        type="datetime-local"
                        required
                        value={publicDraft.scheduled_at}
                        onChange={(event) =>
                          setPublicDraft({ ...publicDraft, scheduled_at: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="public-game-location">Local opcional</label>
                      <input
                        id="public-game-location"
                        maxLength="120"
                        value={publicDraft.location}
                        onChange={(event) =>
                          setPublicDraft({ ...publicDraft, location: event.target.value })
                        }
                        placeholder="Ex.: Quadra do bairro"
                      />
                    </div>
                    <button className="button primary">
                      <Plus size={17} /> Adicionar à agenda
                    </button>
                  </form>
                  <div className="upcoming-manage-list">
                    {publicConfig.games.map((game) => (
                      <div key={game.id}>
                        <CalendarDays size={17} />
                        <span>
                          <strong>{game.title}</strong>
                          <small>
                            {new Date(game.scheduled_at).toLocaleString("pt-BR")} · {game.sport}
                            {game.location ? ` · ${game.location}` : ""}
                          </small>
                        </span>
                        <button
                          className="icon-button danger"
                          onClick={() => removeUpcomingGame(game.id)}
                          aria-label={`Excluir ${game.title}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </article>
          </section>
        )}

        {view === "password" && (
          <section className="password-page">
            <button className="recovery-back" type="button" onClick={() => setView("setup")}>
              <ArrowLeft size={17} /> Voltar
            </button>
            <article className="settings-card password-change-card">
              <span className="auth-lock">
                <KeyRound size={23} />
              </span>
              <h1>Trocar senha</h1>
              <p>Confirme a senha atual e informe a nova senha duas vezes.</p>
              {settingsMessage && (
                <p className="settings-message" role="status">
                  {settingsMessage}
                </p>
              )}
              <form onSubmit={changeLoggedPassword}>
                <div className="field">
                  <label htmlFor="current-password">Senha atual</label>
                  <input
                    id="current-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-logged-password">Nova senha</label>
                  <input
                    id="new-logged-password"
                    type="password"
                    minLength="6"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="confirm-logged-password">Repita a nova senha</label>
                  <input
                    id="confirm-logged-password"
                    type="password"
                    minLength="6"
                    required
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                  />
                </div>
                <button className="button primary large full" disabled={authBusy}>
                  <Save size={18} /> {authBusy ? "Validando..." : "Confirmar troca de senha"}
                </button>
              </form>
            </article>
          </section>
        )}

        {view === "settings" && (
          <section className="settings-view">
            <div className="section-heading settings-heading">
              <div>
                <span className="eyebrow">ADMINISTRAÇÃO</span>
                <h1>Configurações</h1>
                <p>Gerencie a conta, os jogadores do ranking e o histórico de partidas.</p>
              </div>
              <Settings size={28} />
            </div>
            {settingsMessage && (
              <p className="settings-message" role="status">
                {settingsMessage}
              </p>
            )}
            <article className="settings-card account-settings compact-account">
              <header>
                <span>
                  <UserRound size={20} />
                </span>
                <div>
                  <h2>Perfil da conta</h2>
                  <p>Nome exibido no aplicativo.</p>
                </div>
              </header>
              <div className="settings-profile">
                <ProfileAvatar name={displayName} large />
                <div>
                  <strong>{displayName}</strong>
                  <small>{session.user.email}</small>
                </div>
                <button className="button secondary" onClick={openProfile}>
                  <Pencil size={17} /> Editar perfil
                </button>
              </div>
            </article>
            <article className="settings-card cloud-settings-card">
              <header>
                <span>
                  <Cloud size={20} />
                </span>
                <div>
                  <h2>Sincronização e backup</h2>
                  <p>Controle a cópia protegida da conta e faça backups quando precisar.</p>
                </div>
                <b className={`sync-badge ${syncStatus}`}>{syncLabel}</b>
              </header>
              <div className="account-line">
                <span>
                  <Cloud size={20} />
                  <span>
                    <small>Conta conectada</small>
                    <strong>{session.user.email}</strong>
                  </span>
                </span>
              </div>
              {authMessage && (
                <p className="cloud-message" role="status">
                  {authMessage}
                </p>
              )}
              <div className="cloud-settings-actions">
                <button
                  className="button secondary"
                  onClick={syncNow}
                  disabled={syncStatus === "syncing" || syncStatus === "loading"}
                >
                  <RefreshCw size={18} /> Sincronizar agora
                </button>
                <button className="button secondary" onClick={exportBackup}>
                  <Download size={17} /> Exportar backup
                </button>
                <button className="button secondary" onClick={() => importInput.current?.click()}>
                  <Upload size={17} /> Importar backup
                </button>
                <input
                  ref={importInput}
                  type="file"
                  accept="application/json,.json"
                  onChange={importBackup}
                  hidden
                />
              </div>
              <small className="security-note">
                <Shield size={15} /> Cada usuário acessa somente os próprios dados. Backups
                importados são validados e limitados a 2 MB.
              </small>
            </article>
            <article className="settings-card manage-card">
              <header>
                <span>
                  <Users size={20} />
                </span>
                <div>
                  <h2>Jogadores e ranking</h2>
                  <p>
                    Alterar um nome atualiza o cadastro, as escalações e a artilharia. Excluir
                    também remove as pontuações do histórico.
                  </p>
                </div>
                <b>{managedPlayers.length}</b>
              </header>
              {managedPlayers.length === 0 ? (
                <Empty
                  icon={<Users size={27} />}
                  title="Nenhum jogador cadastrado"
                  text="Os jogadores adicionados aparecerão aqui."
                />
              ) : (
                <div className="manage-list">
                  {managedPlayers.map((player) => (
                    <div className="manage-row" key={player.id}>
                      <Avatar name={player.name} />
                      {editingPlayer?.id === player.id ? (
                        <input
                          autoFocus
                          maxLength="60"
                          value={editingPlayer.name}
                          onChange={(event) =>
                            setEditingPlayer({ ...editingPlayer, name: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") savePlayerName();
                            if (event.key === "Escape") setEditingPlayer(null);
                          }}
                          aria-label={`Novo nome de ${player.name}`}
                        />
                      ) : (
                        <div>
                          <strong>{player.name}</strong>
                          <small>
                            {player.totalPoints} pontos · {player.totalAssists} assistências
                            {player.registered
                              ? ` · nível ${playerStats.get(player.id)?.rating || 1}★`
                              : " · somente no ranking"}
                          </small>
                        </div>
                      )}
                      <div className="manage-actions">
                        {editingPlayer?.id === player.id ? (
                          <>
                            <button
                              className="icon-button save-action"
                              onClick={savePlayerName}
                              aria-label="Salvar nome"
                            >
                              <Check size={17} />
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => setEditingPlayer(null)}
                              aria-label="Cancelar edição"
                            >
                              <X size={17} />
                            </button>
                          </>
                        ) : (
                          <button
                            className="icon-button"
                            onClick={() => {
                              setEditingPlayer({ id: player.id, name: player.name });
                              setSettingsMessage("");
                            }}
                            aria-label={`Editar ${player.name}`}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        <button
                          className="icon-button danger"
                          onClick={() => deletePlayerEverywhere(player)}
                          aria-label={`Excluir ${player.name}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <article className="settings-card manage-card">
              <header>
                <span>
                  <CalendarDays size={20} />
                </span>
                <div>
                  <h2>Histórico de partidas</h2>
                  <p>Edite informações do jogo ou exclua uma partida e suas pontuações.</p>
                </div>
                <b>{data.history.length}</b>
              </header>
              {data.history.length === 0 ? (
                <Empty
                  icon={<CalendarDays size={27} />}
                  title="Nenhuma partida salva"
                  text="As partidas encerradas aparecerão aqui."
                />
              ) : (
                <div className="manage-list match-manage-list">
                  {data.history.map((game) => (
                    <div className="manage-row match-manage-row" key={game.id}>
                      <span className="match-date-badge">
                        {new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <div>
                        <strong>{game.sport}</strong>
                        <small>
                          {game.teams?.[0]?.short || "Time 1"} {game.score?.[0] || 0} ×{" "}
                          {game.score?.[1] || 0} {game.teams?.[1]?.short || "Time 2"} ·{" "}
                          {(game.events || []).filter((event) => event.type === "goal").length}{" "}
                          pontuações registradas
                        </small>
                      </div>
                      <div className="manage-actions">
                        <button
                          className="icon-button"
                          onClick={() => openMatchEditor(game)}
                          aria-label="Editar partida"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => deleteMatch(game)}
                          aria-label="Excluir partida"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
            {historyHasMore && (
              <button
                className="button secondary settings-load-more"
                onClick={fetchMoreHistory}
                disabled={historyLoading}
              >
                <RefreshCw size={17} />{" "}
                {historyLoading
                  ? "Carregando partidas…"
                  : `Carregar mais ${HISTORY_PAGE_SIZE} partidas antigas`}
              </button>
            )}
            <button className="button logout-button" onClick={signOut}>
              <LogOut size={18} /> Sair da conta
            </button>
          </section>
        )}
      </div>

      <footer className="site-footer">
        <strong>Resenha</strong>
        <span>Criado e desenvolvido por Adriel Alves Quintava.</span>
        <small>Projeto em evolução contínua · versão de testes.</small>
      </footer>

      {goalTeam !== null && match && (
        <Modal
          onClose={() => {
            setGoalTeam(null);
            setGoalScorer("");
            setGoalAssist("");
          }}
          icon={<Goal size={25} />}
          color={match.teams[goalTeam].color}
          title={`Registrar ${scoreAction(match.sport).toLowerCase()}`}
          text={`Informe quem marcou e, se houver, quem deu a assistência pelo ${match.teams[goalTeam].name}.`}
        >
          <div className="goal-fields">
            <div className="field">
              <label htmlFor="goal-scorer">Autor</label>
              <select
                id="goal-scorer"
                value={goalScorer}
                onChange={(event) => {
                  setGoalScorer(event.target.value);
                  if (event.target.value === goalAssist) setGoalAssist("");
                }}
              >
                <option value="">Selecione o jogador</option>
                {match.teams[goalTeam].starters.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            {sportKind(match.sport) === "football" && (
              <div className="field">
                <label htmlFor="goal-assist">Assistência (opcional)</label>
                <select
                  id="goal-assist"
                  value={goalAssist}
                  onChange={(event) => setGoalAssist(event.target.value)}
                >
                  <option value="">Sem assistência</option>
                  {match.teams[goalTeam].starters
                    .filter((player) => player.id !== goalScorer)
                    .map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <button
              className="button primary large full"
              disabled={!goalScorer}
              onClick={() =>
                registerGoal(
                  goalTeam,
                  goalScorer,
                  sportKind(match.sport) === "football" ? goalAssist : "",
                )
              }
            >
              <Goal size={18} /> Confirmar {scoreAction(match.sport).toLowerCase()}
            </button>
          </div>
        </Modal>
      )}
      {incident && match && (
        <Modal
          onClose={() => {
            setIncident(null);
            setIncidentPlayer("");
          }}
          icon={incident.type === "own_goal" ? <Goal size={25} /> : <X size={25} />}
          color={match.teams[incident.teamIndex].color}
          title={
            incident.type === "own_goal" ? "Registrar gol contra" : "Registrar pênalti perdido"
          }
          text={
            incident.type === "own_goal"
              ? "Selecione o jogador responsável. O gol será somado ao time adversário e descontará 0,5 da avaliação."
              : "Selecione quem perdeu o pênalti. O placar não será alterado e a avaliação terá desconto de 0,3."
          }
        >
          <div className="goal-fields">
            <div className="field">
              <label htmlFor="incident-player">Jogador</label>
              <select
                id="incident-player"
                value={incidentPlayer}
                onChange={(event) => setIncidentPlayer(event.target.value)}
              >
                <option value="">Selecione o jogador</option>
                {match.teams[incident.teamIndex].starters.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="button primary large full"
              disabled={!incidentPlayer}
              onClick={() => registerIncident(incident.type, incident.teamIndex, incidentPlayer)}
            >
              {incident.type === "own_goal" ? <Goal size={18} /> : <X size={18} />}
              Confirmar {incident.type === "own_goal" ? "gol contra" : "pênalti perdido"}
            </button>
          </div>
        </Modal>
      )}
      {subTeam !== null && match && (
        <Modal
          onClose={() => setSubTeam(null)}
          icon={<ArrowDownUp size={25} />}
          color={match.teams[subTeam].color}
          title="Fazer substituição"
          text={`Escolha quem sai e quem entra no ${match.teams[subTeam].name}.`}
        >
          <div className="sub-fields">
            <div className="field">
              <label htmlFor="player-out">Sai de quadra</label>
              <select
                id="player-out"
                value={selectedOut}
                onChange={(event) => setSelectedOut(event.target.value)}
              >
                {match.teams[subTeam].starters.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <ArrowDownUp size={21} />
            <div className="field">
              <label htmlFor="player-in">Entra no jogo</label>
              <select
                id="player-in"
                value={selectedIn}
                onChange={(event) => setSelectedIn(event.target.value)}
              >
                {match.teams[subTeam].bench.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="button primary large full" onClick={confirmSubstitution}>
            Confirmar troca
          </button>
        </Modal>
      )}
      {teamSwapSide !== null && match && (
        <Modal
          onClose={() => setTeamSwapSide(null)}
          icon={<Users size={25} />}
          color="green"
          title="Trocar o time completo"
          text={`Escolha o time de fora que vai substituir ${match.teams[teamSwapSide].name}. O time que sair volta para a fila.`}
        >
          <div className="reserve-choice-list">
            {(match.reserveTeams || []).map((team) => (
              <button
                type="button"
                key={team.id}
                className={`reserve-choice ${team.color}`}
                onClick={() => swapFullTeam(team.id)}
              >
                <span className="team-dot" />
                <div>
                  <strong>{team.name}</strong>
                  <small>{team.starters.length + team.bench.length} jogadores</small>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {profileOpen && (
        <Modal
          onClose={() => setProfileOpen(false)}
          icon={<UserRound size={25} />}
          color="green"
          title="Meu perfil"
          text="Personalize o nome exibido no Resenha. A inicial é criada automaticamente."
        >
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="profile-initial-preview">
              <ProfileAvatar name={profileName || displayName} large />
              <span>
                <strong>Inicial do perfil</strong>
                <small>Gerada automaticamente a partir do nome.</small>
              </span>
            </div>
            <div className="field">
              <label htmlFor="profile-name">Nome exibido</label>
              <input
                id="profile-name"
                maxLength="40"
                required
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Como deseja aparecer"
              />
            </div>
            {profileMessage && (
              <p className="cloud-message" role="status">
                {profileMessage}
              </p>
            )}
            <button className="button primary large full" disabled={authBusy}>
              <Save size={18} /> {authBusy ? "Salvando..." : "Salvar perfil"}
            </button>
          </form>
        </Modal>
      )}
      {editingMatch && (
        <Modal
          onClose={() => setEditingMatch(null)}
          icon={<CalendarDays size={25} />}
          color="green"
          title="Editar partida"
          text="A edição do placar corrige o resultado. O ranking continua sendo calculado pelos autores registrados na súmula."
        >
          <form className="edit-match-form" onSubmit={saveMatchEdit}>
            <div className="two-fields">
              <div className="field">
                <label htmlFor="edit-match-date">Data</label>
                <input
                  id="edit-match-date"
                  type="date"
                  required
                  value={editingMatch.date}
                  onChange={(event) =>
                    setEditingMatch({ ...editingMatch, date: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="edit-match-sport">Esporte</label>
                <select
                  id="edit-match-sport"
                  value={canonicalSport(editingMatch.sport)}
                  onChange={(event) =>
                    setEditingMatch({ ...editingMatch, sport: event.target.value })
                  }
                >
                  {Object.keys(SPORT_PRESETS).map((sport) => (
                    <option key={sport}>{sport}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="edit-score-fields">
              <div className="field">
                <label htmlFor="edit-score-one">Time 1</label>
                <input
                  id="edit-score-one"
                  type="number"
                  min="0"
                  value={editingMatch.score0}
                  onChange={(event) =>
                    setEditingMatch({ ...editingMatch, score0: event.target.value })
                  }
                />
              </div>
              <b>×</b>
              <div className="field">
                <label htmlFor="edit-score-two">Time 2</label>
                <input
                  id="edit-score-two"
                  type="number"
                  min="0"
                  value={editingMatch.score1}
                  onChange={(event) =>
                    setEditingMatch({ ...editingMatch, score1: event.target.value })
                  }
                />
              </div>
            </div>
            <button className="button primary large full">
              <Save size={18} /> Salvar alterações
            </button>
          </form>
        </Modal>
      )}
    </main>
  );
}

// Componentes visuais reutilizados pelas telas principais e pelos modais.
function ThemeToggle({ theme, setTheme, className = "" }) {
  return (
    <button
      className={`icon-button theme-button ${className}`}
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

function AuthScreen({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  message,
  busy,
  onSubmit,
  onForgot,
  theme,
  setTheme,
}) {
  return (
    <main className="auth-page">
      <ThemeToggle theme={theme} setTheme={setTheme} className="auth-theme" />
      <section className="auth-hero">
        <div className="auth-brand">
          <span className="brand-mark">
            <Goal size={27} />
          </span>
          <span>
            <strong>Resenha</strong>
            <small>Organização completa do jogo</small>
          </span>
        </div>
        <div className="auth-copy">
          <h1>Organize o jogo. Viva a resenha.</h1>
          <p>Times equilibrados, placar ao vivo e desempenho em um só lugar.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="auth-lock">
            <LockKeyhole size={23} />
          </span>
          <h2>{mode === "signup" ? "Criar uma conta" : "Entrar no aplicativo"}</h2>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "signin" ? "active" : ""}
              onClick={() => setMode("signin")}
            >
              Entrar
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              Criar conta
            </button>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="login-email">E-mail</label>
              <div className="auth-input">
                <Mail size={18} />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nome@email.com"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="login-password">Senha</label>
              <div className="auth-input">
                <LockKeyhole size={18} />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  minLength="6"
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {mode === "signin" && (
              <button className="forgot-button" type="button" onClick={onForgot} disabled={busy}>
                Esqueci minha senha
              </button>
            )}
            {message && (
              <p className="auth-message" role="status">
                {message}
              </p>
            )}
            <button className="button primary large full" type="submit" disabled={busy}>
              {busy ? "Aguarde..." : mode === "signup" ? "Criar minha conta" : "Entrar"}
              <ChevronRight size={19} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function PasswordRecoveryScreen({
  password,
  setPassword,
  confirm,
  setConfirm,
  message,
  busy,
  onSubmit,
  onBack,
  theme,
  setTheme,
}) {
  return (
    <main className="auth-page recovery-page">
      <ThemeToggle theme={theme} setTheme={setTheme} className="auth-theme" />
      <section className="auth-hero">
        <div className="auth-brand">
          <span className="brand-mark">
            <Goal size={27} />
          </span>
          <span>
            <strong>Resenha</strong>
            <small>Recuperação de acesso</small>
          </span>
        </div>
        <div className="auth-copy">
          <h1>Crie uma nova senha.</h1>
          <p>Escolha uma senha segura para voltar ao seu grupo.</p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <button className="recovery-back" type="button" onClick={onBack}>
            <ArrowLeft size={17} /> Voltar ao login
          </button>
          <span className="auth-lock">
            <LockKeyhole size={23} />
          </span>
          <h2>Redefinir senha</h2>
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="new-password">Nova senha</label>
              <div className="auth-input">
                <LockKeyhole size={18} />
                <input
                  id="new-password"
                  type="password"
                  minLength="6"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirmar nova senha</label>
              <div className="auth-input">
                <LockKeyhole size={18} />
                <input
                  id="confirm-password"
                  type="password"
                  minLength="6"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Digite novamente"
                />
              </div>
            </div>
            {message && (
              <p className="auth-message" role="status">
                {message}
              </p>
            )}
            <button className="button primary large full" disabled={busy}>
              {busy ? "Salvando..." : "Salvar nova senha"}
              <ChevronRight size={19} />
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function AuthSetupRequired({ theme, setTheme }) {
  return (
    <main className="auth-page setup-required-page">
      <ThemeToggle theme={theme} setTheme={setTheme} className="auth-theme" />
      <section className="setup-required-card">
        <span className="auth-lock">
          <CloudOff size={25} />
        </span>
        <span className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</span>
        <h1>Ative o banco de dados para liberar o login</h1>
        <p>
          Por segurança, jogadores e históricos não ficam mais disponíveis sem autenticação. Siga o
          arquivo <strong>CONFIGURAR_SUPABASE.md</strong> e adicione as duas chaves no GitHub.
        </p>
        <div className="setup-code">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
        </div>
      </section>
    </main>
  );
}

function Avatar({ name }) {
  return <span className="avatar">{name.slice(0, 2).toUpperCase()}</span>;
}
function ProfileAvatar({ name, large = false }) {
  return (
    <span className={`profile-avatar ${large ? "large" : ""}`}>
      {String(name || "Usuário")
        .trim()
        .charAt(0)
        .toUpperCase() || "U"}
    </span>
  );
}
function Stars({ rating, label }) {
  return (
    <span className="rating-stars" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <i key={star} className={star <= rating ? "filled" : ""}>
          ★
        </i>
      ))}
    </span>
  );
}
function Pagination({ page, pageCount, onChange }) {
  return (
    <nav className="pagination" aria-label="Páginas de jogadores">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Página anterior"
      >
        <ChevronLeft size={18} />
      </button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
        <button
          type="button"
          key={number}
          className={number === page ? "active" : ""}
          onClick={() => onChange(number)}
          aria-current={number === page ? "page" : undefined}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        aria-label="Próxima página"
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}
function Empty({ icon, title, text }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
function Mode({ active, onClick, icon, title, text }) {
  return (
    <button type="button" className={active ? "mode active" : "mode"} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      {active && <Check size={18} />}
    </button>
  );
}
function RankingPanel({ title, eyebrow, ranking, valueKey, valueLabel }) {
  return (
    <article className="ranking-card">
      <header>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Medal size={23} />
      </header>
      {ranking.length === 0 ? (
        <Empty
          icon={<Trophy size={27} />}
          title="Sem pontuações"
          text="Os resultados aparecerão depois de uma partida salva."
        />
      ) : (
        <div className="ranking-list">
          {ranking.map((player, index) => (
            <div className={`ranking-row rank-${index + 1}`} key={player.id}>
              <span className="rank-number">{index + 1}</span>
              <Avatar name={player.name} />
              <strong>{player.name}</strong>
              <div className="goal-total">
                <b>{player[valueKey]}</b>
                <small>{valueLabel}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
function PerformanceTable({ ranking, sport }) {
  if (!ranking.length)
    return (
      <Empty
        icon={<Trophy size={27} />}
        title="Sem partidas neste período"
        text="Salve uma partida para montar a classificação."
      />
    );
  const football = sportKind(sport) === "football";
  return (
    <div className="performance-table-wrap">
      <table className="performance-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>{scoreAction(sport)}s</th>
            {football && <th>Assist.</th>}
            <th>Jogos</th>
            <th>Avaliação</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((player, index) => {
            const bottom =
              ranking.length > 5 && index >= ranking.length - Math.min(3, ranking.length);
            return (
              <tr
                key={player.id}
                className={`${index < 3 ? `podium podium-${index + 1}` : ""} ${bottom ? "bottom-rank" : ""}`}
              >
                <td>
                  <b>{index + 1}</b>
                </td>
                <td>
                  <span className="table-player">
                    <Avatar name={player.name} />
                    <strong>{player.name}</strong>
                  </span>
                </td>
                <td>{player.goals}</td>
                {football && <td>{player.assists}</td>}
                <td>{player.games}</td>
                <td>
                  <strong className="evaluation-badge">{player.evaluation.toFixed(1)}</strong>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Summary({ icon, label, value }) {
  return (
    <div>
      <span>{icon}</span>
      <p>
        <small>{label}</small>
        <strong>{value}</strong>
      </p>
    </div>
  );
}

function MatchEventRow({ event, match, onUndo }) {
  const isGoal = event.type === "goal";
  const isOwnGoal = event.type === "own_goal";
  const isMissedPenalty = event.type === "missed_penalty";
  const isSubstitution = event.type === "sub";
  const canUndo = isGoal || isOwnGoal || isMissedPenalty;
  const team = match.teams[event.teamIndex];
  const benefitedTeam = isOwnGoal ? match.teams[event.teamIndex === 0 ? 1 : 0] : team;

  return (
    <div className={`event-row ${event.type}`}>
      <span className="event-minute">{event.minute}&apos;</span>
      <span className={`event-icon ${team?.color || "green"}`}>
        {isSubstitution ? (
          <ArrowDownUp size={17} />
        ) : isMissedPenalty ? (
          <X size={17} />
        ) : (
          <Goal size={17} />
        )}
      </span>
      <div>
        {isGoal && (
          <>
            <strong>
              {scoreAction(match.sport)} de {event.playerName}
            </strong>
            <small>
              {event.assistPlayerName ? `Assistência de ${event.assistPlayerName} · ` : ""}
              {team?.name || "Time"}
            </small>
          </>
        )}
        {isOwnGoal && (
          <>
            <strong>Gol contra de {event.playerName}</strong>
            <small>-0,5 na avaliação · gol para {benefitedTeam?.name || "o adversário"}</small>
          </>
        )}
        {isMissedPenalty && (
          <>
            <strong>Pênalti perdido por {event.playerName}</strong>
            <small>-0,3 na avaliação · {team?.name || "Time"}</small>
          </>
        )}
        {isSubstitution && (
          <>
            <strong>Entrou {event.playerIn}</strong>
            <small>Saiu {event.playerOut}</small>
          </>
        )}
      </div>
      {canUndo && (
        <button
          className="undo-score-button"
          type="button"
          onClick={onUndo}
          aria-label={`Anular lance de ${event.playerName}`}
        >
          <RotateCcw size={14} /> Anular
        </button>
      )}
    </div>
  );
}

// Faixa sob o placar inspirada em transmissões, com autor e minuto de cada pontuação.
function MatchScorers({ match }) {
  const scoringEvents = [...(match.events || [])]
    .filter((event) => ["goal", "own_goal"].includes(event.type))
    .reverse();
  const action = scoreAction(match.sport);

  return (
    <div className="match-scorers">
      <header>
        <Goal size={16} />
        <strong>{action}s da partida</strong>
      </header>
      <div className="match-scorers-sides">
        {match.teams.map((team, teamIndex) => {
          const teamEvents = scoringEvents.filter((event) =>
            event.type === "own_goal"
              ? (event.teamIndex === 0 ? 1 : 0) === teamIndex
              : event.teamIndex === teamIndex,
          );
          return (
            <section className={`match-scorers-team ${team.color}`} key={team.id || team.name}>
              <small>{team.name}</small>
              {teamEvents.length ? (
                <div className="scorer-list">
                  {teamEvents.map((event) => (
                    <div className="scorer-line" key={event.id}>
                      <span className="scorer-ball" aria-hidden="true">
                        <Goal size={14} />
                      </span>
                      <span>
                        <strong>
                          {event.playerName}
                          {event.type === "own_goal" ? " (contra)" : ""}
                        </strong>
                        {event.assistPlayerName && <small>Assist. {event.assistPlayerName}</small>}
                      </span>
                      <b>{event.minute}&apos;</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nenhuma pontuação</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TeamScore({ team, score }) {
  return (
    <div className={`team-score ${team.color}`}>
      <span className="team-badge">{team.short}</span>
      <div>
        <small>{team.name}</small>
        <strong>{score}</strong>
      </div>
    </div>
  );
}
function TeamCard({
  team,
  scoreLabel,
  onGoal,
  onOwnGoal,
  onMissedPenalty,
  showFootballActions,
  onSub,
}) {
  return (
    <article className={`team-card ${team.color}`}>
      <header>
        <div>
          <span className="team-dot" />
          <h2>{team.name}</h2>
        </div>
        <button className="button goal-button" onClick={onGoal}>
          <Plus size={18} /> {scoreLabel}
        </button>
      </header>
      <div className="roster-title">
        <span>Em jogo</span>
        <small>{team.starters.length} jogadores</small>
      </div>
      <div className="roster-list">
        {team.starters.map((player) => (
          <div className="roster-player" key={player.id}>
            <Avatar name={player.name} />
            <strong>{player.name}</strong>
            <span className="field-status">em jogo</span>
          </div>
        ))}
      </div>
      <div className="bench-box">
        <div className="roster-title">
          <span>Banco</span>
          <small>{team.bench.length} jogadores</small>
        </div>
        {team.bench.length ? (
          team.bench.map((player) => (
            <div className="roster-player bench-player" key={player.id}>
              <Avatar name={player.name} />
              <strong>{player.name}</strong>
            </div>
          ))
        ) : (
          <p className="empty-bench">Nenhum reserva neste time.</p>
        )}
      </div>
      {showFootballActions && (
        <div className="match-incident-actions">
          <button className="button secondary" type="button" onClick={onOwnGoal}>
            <Goal size={16} /> Gol contra
          </button>
          <button className="button secondary" type="button" onClick={onMissedPenalty}>
            <X size={16} /> Pênalti perdido
          </button>
        </div>
      )}
      <button className="button secondary full" onClick={onSub} disabled={!team.bench.length}>
        <ArrowDownUp size={18} /> Fazer substituição
      </button>
    </article>
  );
}
function Modal({ onClose, icon, color, title, text, children }) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="icon-button modal-close" onClick={onClose}>
          <X size={18} />
        </button>
        <span className={`modal-icon ${color}`}>{icon}</span>
        <h2>{title}</h2>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}
