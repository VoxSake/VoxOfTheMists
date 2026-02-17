import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./hooks/useToast.jsx";
import "./styles.css";

const root = document.getElementById("root");
createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>
);

// Reveal UI after React has mounted (prevents FOUC)
requestAnimationFrame(() => root.classList.add("ready"));
