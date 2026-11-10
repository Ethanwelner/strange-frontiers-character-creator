import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button.js";

// The popup: the page dimmed behind it, the panel holding its content, and
// the round X on the panel's top right corner. Escape, the backdrop and the
// X shut it, and focus goes back to whatever opened it. One component, so
// every popup opens, looks and closes the same way.
//
// The site draws the same markup from php/rpg/components/popup.php
// (sf_popup_shell, filled by showLoreModal in php/javascript-loads.php),
// styled by the same stylesheet: src/app/popup.css here, css/sf-popup.css
// (a copy) there.
//
// Options, under the same names on both sides:
//
//   tone   "dark" (the creator's panel gray, a light X; every popup in the
//          creator and Player Tools) or "light" (the site's white panel, a
//          dark X, on its light pages)
//   size   "narrow" (480px: a question, a portrait, a small form), the
//          default (720px: lore, a list) or "wide" (1100px: a picker of
//          cards)
//   card   a card on its own, like a Knowledge or a Kind: the card is the
//          popup's edge, with no panel around it, and a smaller light X
//   title  a title over the content, clear of the X
//
// `className` is for what's inside: a popup's own content styles hang off it.

export type PopupTone = "light" | "dark";
export type PopupSize = "narrow" | "default" | "wide";

export function popupClass({ tone = "dark", size = "default", card = false }: { tone?: PopupTone; size?: PopupSize; card?: boolean }, className = "") {
  return ["sf-popup", "is-open", `sf-popup--${tone}`, size !== "default" && `sf-popup--${size}`, card && "sf-popup--card", className].filter(Boolean).join(" ");
}

export function Popup({
  label,
  onClose,
  children,
  tone = "dark",
  size = "default",
  card = false,
  title,
  className = "",
}: {
  // The popup's name for screen readers
  label: string;
  onClose: () => void;
  children: ReactNode;
  tone?: PopupTone;
  size?: PopupSize;
  card?: boolean;
  title?: ReactNode;
  className?: string;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const shut = useRef(onClose);
  shut.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    document.documentElement.classList.add("sf-popup-open");
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") shut.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("sf-popup-open");
      opener?.focus();
    };
  }, []);
  return (
    <div className={popupClass({ tone, size, card }, className)} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sf-popup-panel">
        <Button ref={close} round="lg" tone={tone === "dark" ? "light" : "dark"} className="sf-popup-close" aria-label="Close" onClick={onClose}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M2 2l16 16M18 2L2 18" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </Button>
        {/* The content scrolls inside the panel, so the X stays on its corner */}
        <div className="sf-popup-scroll">
          {title && <h3 className="sf-popup-title">{title}</h3>}
          {children}
        </div>
      </div>
    </div>
  );
}
