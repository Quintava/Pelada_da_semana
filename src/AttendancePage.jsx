import { useEffect, useState } from "react";
import { Check, Goal, LoaderCircle, X } from "lucide-react";
import { getAttendance, respondAttendance } from "./dataService";

export default function AttendancePage({ token }) {
  const [content, setContent] = useState(null);
  const [message, setMessage] = useState("");
  const load = () => getAttendance(token).then(setContent).catch(() => setContent(false));
  useEffect(() => { load(); }, [token]);
  const respond = async (playerId, present) => { setMessage("Salvando presença…"); await respondAttendance(token, playerId, present); await load(); setMessage("Resposta registrada."); };
  if (content === null) return <main className="attendance-public"><LoaderCircle className="spin" /><p>Carregando lista…</p></main>;
  if (!content) return <main className="attendance-public"><h1>Lista indisponível</h1><p>O link expirou ou a confirmação foi encerrada.</p></main>;
  return <main className="attendance-public"><section className="attendance-public-card"><header><span className="brand-mark"><Goal size={24} /></span><div><small>{content.session.group_name}</small><h1>{content.session.title}</h1><p>{new Date(`${content.session.game_date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p></div></header><p className="attendance-instruction">Encontre o nome e confirme se participará do jogo.</p><div className="attendance-public-list">{content.players.map((player) => <div key={player.id}><span className="avatar">{player.name.slice(0, 2).toUpperCase()}</span><strong>{player.name}</strong><button className={player.responded && player.present ? "present active" : "present"} onClick={() => respond(player.id, true)}><Check size={16} /> Vou</button><button className={player.responded && !player.present ? "absent active" : "absent"} onClick={() => respond(player.id, false)}><X size={16} /> Não vou</button></div>)}</div>{message && <p className="attendance-message">{message}</p>}</section></main>;
}
