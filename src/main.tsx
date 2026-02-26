/**
 * @module main
 * @description Entry point da aplicação. Monta o React 18 no DOM
 * via `createRoot` e carrega estilos globais (Tailwind CSS v4).
 */

  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(<App />);
  