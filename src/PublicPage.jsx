import { useEffect, useState } from "react";
import { CalendarDays, Goal, LoaderCircle, MapPin, Medal, Trophy } from "lucide-react";
import { getPublicPage, HISTORY_PAGE_SIZE } from "./dataService";

// Lista fixa para impedir parâmetros de modalidade inesperados na consulta pública.
const SPORTS = ["Futebol", "Futebol Society", "Futebol de Salão", "Vôlei", "Basquete", "Handebol"];
const sportKind = (sport) =>
  ["Futebol", "Futebol Society", "Futebol de Salão"].includes(sport)
    ? "football"
    : sport === "Vôlei"
      ? "volleyball"
      : sport === "Basquete"
        ? "basketball"
        : "other";
const scoreLabel = (sport) =>
  sportKind(sport) === "basketball"
    ? "Cestas"
    : sportKind(sport) === "volleyball"
      ? "Pontos"
      : "Gols";

export default function PublicPage({ slug }) {
  // O filtro pode vir no link compartilhado, mas sempre é validado contra SPORTS.
  const initialSport =
    new URLSearchParams(window.location.search).get("esporte") || "Futebol de Salão";
  const [sport, setSport] = useState(
    SPORTS.includes(initialSport) ? initialSport : "Futebol de Salão",
  );
  const [content, setContent] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  // Recarrega apenas o conteúdo da modalidade, mantendo a página aberta.
  useEffect(() => {
    setStatus("loading");
    getPublicPage(slug, 0, sport)
      .then((value) => {
        setContent(value);
        setStatus(value ? "ready" : "missing");
      })
      .catch(() => setStatus("error"));
  }, [slug, sport]);

  // Paginação incremental dos resultados públicos.
  const loadMore = async () => {
    setLoadingMore(true);
    const next = await getPublicPage(slug, content.results.length, sport);
    setContent((current) => ({
      ...current,
      results: [...current.results, ...next.results],
      has_more: next.has_more,
    }));
    setLoadingMore(false);
  };

  // Estados próprios evitam mostrar uma página incompleta ou desativada.
  if (status === "loading")
    return (
      <main className="public-page public-loading">
        <LoaderCircle className="spin" />
        <p>Carregando o Mural da Resenha…</p>
      </main>
    );
  if (status !== "ready")
    return (
      <main className="public-page public-loading">
        <Goal size={38} />
        <h1>Mural indisponível</h1>
        <p>O link não existe ou o mural foi desativado.</p>
      </main>
    );
  const football = sportKind(sport) === "football";
  return (
    <main className="public-page">
      <header className="public-header">
        <span className="brand-mark">
          <Goal size={25} />
        </span>
        <div>
          <small>A TABELA OFICIAL DA ZOEIRA</small>
          <h1>Mural da Resenha</h1>
          <p>{content.page.title} · resultados e classificação para todo mundo conferir.</p>
        </div>
        <label className="public-sport-filter">
          <span>Modalidade</span>
          <select value={sport} onChange={(event) => setSport(event.target.value)}>
            {SPORTS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </header>
      <section className="public-grid">
        <article className="public-card public-ranking">
          <header>
            <Trophy size={21} />
            <div>
              <small>CLASSIFICAÇÃO · {sport.toUpperCase()}</small>
              <h2>Ranking da galera</h2>
            </div>
          </header>
          {content.ranking.length ? (
            <div className="public-table-wrap">
              <table className="public-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nome</th>
                    <th>{scoreLabel(sport)}</th>
                    {football && <th>Assist.</th>}
                    <th>Jogos</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {content.ranking.map((player, index) => {
                    const bottom =
                      content.ranking.length > 5 && index >= content.ranking.length - 3;
                    return (
                      <tr
                        className={`${index < 3 ? `podium podium-${index + 1}` : ""} ${bottom ? "bottom-rank" : ""}`}
                        key={player.id}
                      >
                        <td>{index < 3 ? <Medal size={16} /> : index + 1}</td>
                        <td>
                          <span className="avatar">{player.name.slice(0, 2).toUpperCase()}</span>
                          <strong>{player.name}</strong>
                        </td>
                        <td>{player.goals}</td>
                        {football && <td>{player.assists}</td>}
                        <td>{player.games}</td>
                        <td>
                          <b>{Number(player.evaluation).toFixed(1)}</b>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Nenhuma partida de {sport} registrada.</p>
          )}
        </article>
        <article className="public-card">
          <header>
            <CalendarDays size={21} />
            <div>
              <small>AGENDA</small>
              <h2>Próximos jogos</h2>
            </div>
          </header>
          {content.upcoming.length ? (
            content.upcoming.map((game) => (
              <div className="upcoming-public-row" key={game.id}>
                <span className="public-date">
                  <b>
                    {new Date(game.scheduled_at).toLocaleDateString("pt-BR", { day: "2-digit" })}
                  </b>
                  <small>
                    {new Date(game.scheduled_at).toLocaleDateString("pt-BR", { month: "short" })}
                  </small>
                </span>
                <div>
                  <strong>{game.title}</strong>
                  <small>
                    {game.sport} ·{" "}
                    {new Date(game.scheduled_at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                  {game.location && (
                    <em>
                      <MapPin size={13} /> {game.location}
                    </em>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p>Nenhum próximo jogo informado.</p>
          )}
        </article>
        <article className="public-card public-results">
          <header>
            <Goal size={21} />
            <div>
              <small>HISTÓRICO · {sport.toUpperCase()}</small>
              <h2>Resultados</h2>
            </div>
          </header>
          {content.results.length ? (
            <div>
              {content.results.map((game) => (
                <div className="public-result-row" key={game.id}>
                  <span>{new Date(game.finishedAt || game.date).toLocaleDateString("pt-BR")}</span>
                  <strong>
                    {game.teams?.[0]?.short || "T1"} {game.score?.[0] || 0} × {game.score?.[1] || 0}{" "}
                    {game.teams?.[1]?.short || "T2"}
                  </strong>
                  <small>Partida {game.roundNumber || "—"}</small>
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhuma partida encerrada nesta modalidade.</p>
          )}
          {content.has_more && (
            <button className="button secondary full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Carregando…" : `Carregar mais ${HISTORY_PAGE_SIZE}`}
            </button>
          )}
        </article>
      </section>
      <footer className="site-footer">
        <strong>Resenha</strong>
        <span>Criado e desenvolvido por Adriel Alves Quintava.</span>
        <small>Mural público em modo somente leitura.</small>
      </footer>
    </main>
  );
}
