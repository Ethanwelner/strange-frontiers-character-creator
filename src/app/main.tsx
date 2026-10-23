import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
// Only the creator's own styles: the Strange Frontiers site's CSS comes from
// creator.php on the site, and from vite.config.ts in development.
import "./styles.css";

// Rendered before this script finishes, so creator.php (which holds its first
// paint for this script) slides in showing the builder, not an empty page.
const root = createRoot(document.getElementById("root")!);
flushSync(() =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
