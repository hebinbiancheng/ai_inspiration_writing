import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./home.css";
import "./project.css";
import { App } from "./App";
import { bootDesktopChrome } from "./desktopChrome";

void bootDesktopChrome();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
