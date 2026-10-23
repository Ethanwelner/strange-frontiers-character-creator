import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// Only the creator's own styles: the Strange Frontiers site's CSS comes from
// creator.php on the site, and from vite.config.ts in development.
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
