import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { GmApp } from "./App.js";
// The creator's styles and Player Tools', which the Game Master tools share
// (the sheet, its resource meters, popups), then their own. The site's CSS
// comes from game-master.php on the site, and from vite.config.ts in
// development.
import "../app/styles.css";
import "../tools/styles.css";
import "./styles.css";
import "../app/buttons.css";
import "../app/cards.css";
import "../app/stats.css";
import "../app/sheet.css";
import "../app/popup.css";

// Rendered before this script finishes, so game-master.php (which holds its
// first paint for this script) slides in showing the tools, not an empty page.
const root = createRoot(document.getElementById("root")!);
flushSync(() =>
  root.render(
    <StrictMode>
      <GmApp />
    </StrictMode>,
  ),
);
