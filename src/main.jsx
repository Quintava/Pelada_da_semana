import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Limpa o service worker da versão posterior para não manter uma tela antiga em cache.
if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister()));
if ("caches" in window) caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("resenha-")).map((key) => caches.delete(key))));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
