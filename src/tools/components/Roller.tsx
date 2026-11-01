import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { axisAngle, facing, icosahedron, mul, roll, rotate, slerp, type Quat, type Vec } from "../dice.js";

// Screen pixels per canvas pixel: the die is drawn small and scaled up blocky.
const PIXEL = 3;
const ROLL_MS = 1600;
// A face's center sits this far out from the middle of the die (inradius / circumradius).
const FACE_DEPTH = 0.7947;
const DIE = icosahedron();

// Digits 3 pixels wide and 5 tall, a row per string
const DIGITS = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001111001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001010010",
  "111101111101111",
  "111101111001111",
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function drawNumber(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, fg: string, bg: string, pad: number) {
  const text = String(n);
  const w = text.length * 4 - 1;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - 2.5);
  ctx.fillStyle = bg;
  ctx.fillRect(left - pad, top - pad, w + pad * 2, 5 + pad * 2);
  ctx.fillStyle = fg;
  [...text].forEach((d, i) => {
    const bits = DIGITS[Number(d)];
    for (let p = 0; p < 15; p++) if (bits[p] === "1") ctx.fillRect(left + i * 4 + (p % 3), top + Math.floor(p / 3), 1, 1);
  });
}

// The die at rotation `q`, `lift` canvas pixels up from the middle. The
// landed face's number, when there is one, is lit: dark on a green block.
function draw(canvas: HTMLCanvasElement, q: Quat, lift: number, landed?: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const green = getComputedStyle(canvas).getPropertyValue("--frontiers-green").trim() || "#2dfc64";
  const dark = "#1a1a1a";
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const r = h * 0.45;
  const cx = w / 2;
  const cy = h / 2 - lift;
  const at = (v: Vec) => [cx + v[0] * r, cy - v[1] * r] as const;
  const points = DIE.vertices.map((v) => at(rotate(q, v)));
  const front = DIE.faces
    .map((f) => ({ f, n: rotate(q, f.normal) }))
    .filter(({ n }) => n[2] > 0)
    .sort((a, b) => a.n[2] - b.n[2]);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = green;
  for (const { f } of front) {
    ctx.beginPath();
    f.corners.forEach((c, i) => (i ? ctx.lineTo(...points[c]) : ctx.moveTo(...points[c])));
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.stroke();
  }
  // Numbers on the faces turned toward you, flat to the screen
  for (const { f, n } of front) {
    const lit = f.number === landed;
    if (n[2] < 0.5 && !lit) continue;
    const [x, y] = at([n[0] * FACE_DEPTH, n[1] * FACE_DEPTH, 0]);
    drawNumber(ctx, f.number, x, y, lit ? dark : green, lit ? green : dark, lit ? 2 : 1);
  }
}

// A d20 on a little green CRT. Clicking it rolls; `show` makes it roll to a
// number picked somewhere else (the assistant's rolls). The number is picked
// before the die moves, and the die lands showing it.
// `children` ride along on the die's layer, like the chat's Clear badge.
export function Roller({
  show,
  disabled,
  onRolled,
  children,
}: {
  show?: { value: number; key: number };
  disabled?: boolean;
  onRolled: (value: number) => void;
  children?: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const q = useRef<Quat>(
    facing(
      DIE.faces.find((f) => f.number === 20)!,
      0.4,
    ),
  );
  const frame = useRef(0);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState<number>();
  const landedRef = useRef<number>(undefined);

  const redraw = useCallback(() => {
    if (canvas.current) draw(canvas.current, q.current, 0, landedRef.current);
  }, []);

  // The canvas keeps one canvas pixel per PIXEL screen pixels as its box resizes.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      el.width = Math.max(1, Math.round(el.clientWidth / PIXEL));
      el.height = Math.max(1, Math.round(el.clientHeight / PIXEL));
      redraw();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [redraw]);

  const rollTo = useCallback(
    (value: number, done?: () => void) => {
      const el = canvas.current;
      const face = DIE.faces.find((f) => f.number === value);
      if (!el || !face) return;
      cancelAnimationFrame(frame.current);
      const from = q.current;
      const to = facing(face);
      const land = () => {
        q.current = to;
        landedRef.current = value;
        setLanded(value);
        setRolling(false);
        redraw();
        done?.();
      };
      landedRef.current = undefined;
      setRolling(true);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return land();
      // Tumble around a random axis, slowing down, while easing into the face it lands on
      const axis: Vec = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      const turns = (3 + Math.random() * 2) * Math.PI * 2;
      const start = performance.now();
      const step = (now: number) => {
        const u = Math.min(1, (now - start) / ROLL_MS);
        const spun = mul(axisAngle(axis, turns * (1 - (1 - u) ** 3)), from);
        q.current = slerp(spun, to, smooth(0.35, 1, u));
        const bounce = Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u) ** 2 * el.height * 0.3;
        draw(el, q.current, bounce);
        if (u < 1) frame.current = requestAnimationFrame(step);
        else land();
      };
      frame.current = requestAnimationFrame(step);
    },
    [redraw],
  );

  useEffect(() => {
    if (show) rollTo(show.value);
  }, [show, rollTo]);

  return (
    <section className="tools-roller" aria-label="Dice">
      <button
        type="button"
        className="tools-roller-screen"
        disabled={disabled || rolling}
        aria-label="Roll the d20"
        onClick={() => {
          const value = roll(20);
          rollTo(value, () => onRolled(value));
        }}
      >
        <canvas ref={canvas} aria-hidden="true" />
        <span className="tools-roller-caption" aria-live="polite">
          {rolling ? "Rolling…" : landed ? `d20: ${landed}` : "Click to roll"}
        </span>
      </button>
      {children}
    </section>
  );
}
