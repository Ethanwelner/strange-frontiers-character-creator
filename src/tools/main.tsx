import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ToolsApp } from "./App.js";
// The creator's styles, which Game Tools shares, then its own. The site's CSS
// comes from game-tools.php on the site, and from vite.config.ts in development.
import "../app/styles.css";
import "./styles.css";
// The buttons' and cards' styles, shared with the site (src/app/buttons.css,
// src/app/cards.css)
import "../app/buttons.css";
import "../app/cards.css";
// The hand-drawn edge on Condition cards
import "../app/card-edges.js";

// Rendered before this script finishes, so game-tools.php (which holds its
// first paint for this script) slides in showing the tools, not an empty page.
const root = createRoot(document.getElementById("root")!);
flushSync(() =>
  root.render(
    <StrictMode>
      <ToolsApp />
    </StrictMode>,
  ),
);
