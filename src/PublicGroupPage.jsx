import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Goal, Trophy, Users } from "lucide-react";
import { loadPublicGroup } from "./dataService";

export default function PublicGroupPage({ slug }) {
  const [content, setContent] = useState(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => { loadPublicGroup(slug).then((data) => { setContent(data); setStatus(data ? "ready" : "missing"); }).catch(() => setStatus("error")); }, [slug]);
  const ranking = useMemo(() => {
    const totals = new Map((content?.players || []).map((player) => [player.id, { ...player, goals: 0, assists: 0, total: 0 }]));
    (content?.history || []).forEach((match) => (match.events || []).filter((event) => event.type === "goal").forEach((event) => {
      const player = totals.get(event.playerId) || { id: event.playerId, name: event.playerName, goals: 0, assists: 0, total: 0 };
      player.goals += 1; player.total += 1; totals.set(player.id, player);
      if (event.assistPlayerId) { const assist = totals.get(event.assistPlayerId) || { id: event.assistPlayerId, name: event.assistPlayerName, goals: 0, assists: 0, total: 0 }; assist.assists += 1; assist.total += 1; totals.set(assist.id, assist); }
    }));
    return [...totals.values()].sort((a, b) => b.total - a.total || b.goals - a.goals).slice(0, 10);
  }, [content]);
  if (status === "loading") return <main className="public-page"><p>Carregando a resenha…</p></main>;
  if (status !== "ready") return <main className="public-page"><section className="public-card"><h1>Grupo indisponível</h1><p>O link não existe ou a página pública foi desativada.</p><a href="./"><ArrowLeft size={17} /> Voltar ao Resenha</a></section></main>;
  return <main className="public-page"><header className="public-header"><span className="brand-mark"><Goal size={24} /></span><div><small>PÁGINA PÚBLICA</small><h1>{content.group.name}</h1></div><a href="./">Entrar</a></header><section className="public-summary"><div><Users /><span><strong>{content.players.length}</strong><small>jogadores</small></span></div><div><CalendarDays /><span><strong>{content.history.length}</strong><small>partidas recentes</small></span></div><div><Trophy /><span><strong>{ranking[0]?.name || "—"}</strong><small>líder geral</small></span></div></section><div className="public-grid"><article className="public-card"><header><Trophy size={21} /><div><small>CLASSIFICAÇÃO</small><h2>Ranking geral</h2></div></header>{ranking.length ? ranking.map((player, index) => <div className="public-ranking-row" key={player.id}><b>{index + 1}</b><span className="avatar">{player.name.slice(0, 2).toUpperCase()}</span><strong>{player.name}</strong><span>{player.goals} G · {player.assists} A</span></div>) : <p>Ainda não há pontuações registradas.</p>}</article><article className="public-card"><header><CalendarDays size={21} /><div><small>ÚLTIMOS JOGOS</small><h2>Resultados</h2></div></header>{content.history.length ? content.history.slice(0, 10).map((game) => <div className="public-match-row" key={game.id}><span>{new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR")}</span><strong>{game.teams?.[0]?.short || "T1"} {game.score?.[0] || 0} × {game.score?.[1] || 0} {game.teams?.[1]?.short || "T2"}</strong><small>{game.sport}</small></div>) : <p>Nenhuma partida encerrada.</p>}</article></div><footer className="site-footer"><strong>Resenha</strong><span>Criado e desenvolvido por Adriel Alves Quintava.</span><small>Projeto em evolução contínua · versão de testes.</small></footer></main>;
}
