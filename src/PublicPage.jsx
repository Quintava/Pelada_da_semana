import { useEffect, useState } from "react";
import { CalendarDays, Goal, LoaderCircle, MapPin, Trophy } from "lucide-react";
import { getPublicPage, HISTORY_PAGE_SIZE } from "./dataService";

export default function PublicPage({ slug }) {
  const [content, setContent] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { getPublicPage(slug).then((value) => { setContent(value); setStatus(value ? "ready" : "missing"); }).catch(() => setStatus("error")); }, [slug]);
  const loadMore = async () => { setLoadingMore(true); const next = await getPublicPage(slug, content.results.length); setContent((current) => ({ ...current, results: [...current.results, ...next.results], has_more: next.has_more })); setLoadingMore(false); };
  if (status === "loading") return <main className="public-page public-loading"><LoaderCircle className="spin" /><p>Carregando a resenha…</p></main>;
  if (status !== "ready") return <main className="public-page public-loading"><Goal size={38} /><h1>Página indisponível</h1><p>O link não existe ou a página pública foi desativada.</p></main>;
  return <main className="public-page">
    <header className="public-header"><span className="brand-mark"><Goal size={25} /></span><div><small>PÁGINA PÚBLICA · SOMENTE LEITURA</small><h1>{content.page.title}</h1><p>Ranking, agenda e resultados sem acesso à administração.</p></div></header>
    <section className="public-grid">
      <article className="public-card public-ranking"><header><Trophy size={21} /><div><small>CLASSIFICAÇÃO GERAL</small><h2>Ranking</h2></div></header>{content.ranking.length ? content.ranking.slice(0, 15).map((player, index) => <div className="public-ranking-row" key={player.id}><b>{index + 1}</b><span className="avatar">{player.name.slice(0, 2).toUpperCase()}</span><strong>{player.name}</strong><span>{player.goals} G · {player.assists} A</span></div>) : <p>Nenhuma pontuação registrada.</p>}</article>
      <article className="public-card"><header><CalendarDays size={21} /><div><small>AGENDA</small><h2>Próximos jogos</h2></div></header>{content.upcoming.length ? content.upcoming.map((game) => <div className="upcoming-public-row" key={game.id}><span className="public-date"><b>{new Date(game.scheduled_at).toLocaleDateString("pt-BR", { day: "2-digit" })}</b><small>{new Date(game.scheduled_at).toLocaleDateString("pt-BR", { month: "short" })}</small></span><div><strong>{game.title}</strong><small>{game.sport} · {new Date(game.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>{game.location && <em><MapPin size={13} /> {game.location}</em>}</div></div>) : <p>Nenhum próximo jogo informado.</p>}</article>
      <article className="public-card public-results"><header><Goal size={21} /><div><small>HISTÓRICO</small><h2>Resultados</h2></div></header>{content.results.length ? <div>{content.results.map((game) => <div className="public-result-row" key={game.id}><span>{new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR")}</span><strong>{game.teams?.[0]?.short || "T1"} {game.score?.[0] || 0} × {game.score?.[1] || 0} {game.teams?.[1]?.short || "T2"}</strong><small>{game.sport}</small></div>)}</div> : <p>Nenhuma partida encerrada.</p>}{content.has_more && <button className="button secondary full" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Carregando…" : `Carregar mais ${HISTORY_PAGE_SIZE}`}</button>}</article>
    </section>
    <footer className="site-footer"><strong>Resenha</strong><span>Criado e desenvolvido por Adriel Alves Quintava.</span><small>Consulta pública · nenhuma alteração é permitida nesta página.</small></footer>
  </main>;
}
