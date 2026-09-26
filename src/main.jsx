import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Evita uma tela totalmente branca caso alguma falha inesperada ocorra na renderização.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Falha ao iniciar o Resenha:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <section>
          <strong>Resenha</strong>
          <h1>Não foi possível abrir o aplicativo</h1>
          <p>Recarregue a página. Seus jogadores e históricos continuam protegidos.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </section>
      </main>
    );
  }
}

// Remove caches de versões antigas para evitar tela branca depois de uma atualização.
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => registrations.forEach((registration) => registration.unregister()));
if ("caches" in window)
  caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys.filter((key) => key.startsWith("resenha-")).map((key) => caches.delete(key)),
      ),
    );

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
