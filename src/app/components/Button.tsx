import type { ComponentProps } from "react";

// The button component. Every button in the Character Creator and Player
// Tools comes from it, styled by src/app/buttons.css, which the site copies
// as css/sf-buttons.css; the site draws the same classes from
// php/rpg/components/buttons.php (sf_button). See buttons.css for what each
// option looks like.

export type ButtonOptions = {
  // gray (the default), the creator's green, black, near-white, no fill,
  // red, or a section's own color
  tone?: "gray" | "primary" | "dark" | "light" | "ghost" | "danger" | "condition" | "item";
  // Bebas 38px tall (the default), Bebas 25px tall for a section's Add, or
  // Open Sans rounded all round for badges
  size?: "default" | "small" | "pill";
  // A circle for an icon: 24, 28, 32 or 36px
  round?: "xs" | "sm" | "md" | "lg";
  // No fill or padding (an icon or a value to click), or a text link
  kind?: "bare" | "link";
  // Glitches, for something that's waiting on the player
  ready?: boolean;
  // Faded but still works, like a next step before its step is done
  waiting?: boolean;
};

// The classes for a button with these options, for anything that draws one
// itself (a label, a link)
export function sfButton({ tone = "gray", size = "default", round, kind, ready, waiting }: ButtonOptions = {}, className = "") {
  return [
    "sf-btn",
    tone !== "gray" && `sf-btn--${tone}`,
    size !== "default" && `sf-btn--${size}`,
    round && `sf-btn--round sf-btn--${round}`,
    kind && `sf-btn--${kind}`,
    ready && "is-ready",
    waiting && "is-waiting",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({ tone, size, round, kind, ready, waiting, className, type = "button", ...props }: ButtonOptions & ComponentProps<"button">) {
  return <button type={type} className={sfButton({ tone, size, round, kind, ready, waiting }, className)} {...props} />;
}
