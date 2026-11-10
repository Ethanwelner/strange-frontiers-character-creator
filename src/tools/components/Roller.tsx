import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { axisAngle, facing, icosahedron, mul, roll, rotate, slerp, type Quat, type Vec } from "../dice.js";
import { Button } from "../../app/components/Button.js";

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

// A number drawn flat on its face, through `ctx`'s current transform: one
// unit is one of the die's pixels in the face's own plane, x reading right
// and y down, with the number centered on the origin. Its blocks are filled
// as one shape each, so the slanted edges between them don't show seams.
// Its backing is `pad` pixels around it.
function drawNumber(ctx: CanvasRenderingContext2D, n: number, fg: string, bg: string, pad: number, alpha: number) {
  const text = String(n);
  const w = text.length * 4 - 1;
  const left = -w / 2;
  const top = -2.5;
  ctx.fillStyle = bg;
  ctx.fillRect(left - pad, top - pad, w + pad * 2, 5 + pad * 2);
  // The digits at `alpha`, over their solid backing
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fg;
  ctx.beginPath();
  [...text].forEach((d, i) => {
    const bits = DIGITS[Number(d)];
    for (let p = 0; p < 15; p++) if (bits[p] === "1") ctx.rect(left + i * 4 + (p % 3), top + Math.floor(p / 3), 1, 1);
  });
  ctx.fill();
  ctx.globalAlpha = 1;
}

// While it rests, the die tips slowly and slightly in 3D: around the
// horizontal and vertical axes, by up to these angles (radians, about 4° and
// 6°), over these loops (ms), which don't divide into each other. It eases in
// over WOBBLE_IN after each roll.
const WOBBLE = [
  { axis: [1, 0, 0] as Vec, angle: 0.07, ms: 11000 },
  { axis: [0, 1, 0] as Vec, angle: 0.1, ms: 15300 },
];
const WOBBLE_IN = 1500;

function wobble(base: Quat, now: number, strength: number): Quat {
  return WOBBLE.reduce((q, w) => mul(axisAngle(w.axis, w.angle * strength * Math.sin((now / w.ms) * Math.PI * 2)), q), base);
}

// The site's green, read once
let green: string | undefined;

// The die at rotation `q`, at `size` times its resting size (a roll's bounce
// shrinks it, so it never outgrows its area and gets clipped): its faces on
// the small `canvas`, its numbers on the full-resolution `nums` over it. The
// landed face's number, when there is one, is lit: dark on a green block.
function draw(canvas: HTMLCanvasElement, nums: HTMLCanvasElement, q: Quat, size: number, landed?: number) {
  const ctx = canvas.getContext("2d");
  const numCtx = nums.getContext("2d");
  if (!ctx || !numCtx) return;
  green ??= getComputedStyle(canvas).getPropertyValue("--frontiers-green").trim() || "#2dfc64";
  const dark = "#181a1b";
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  // Room above and below for it to float (styles.css)
  const r = h * 0.38 * size;
  const cx = w / 2;
  const cy = h / 2;
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
  // Numbers on the faces turned toward you, lying in their faces: each is
  // drawn through its face's up and right directions as the die turns them,
  // so it tilts and narrows with its triangle. (The die has no perspective,
  // so that's exact.) Every face turned toward you shows its number, however
  // tilted. The current face (the one rolled, or before any roll the one
  // most toward you) is at full size and strength; the rest are a little
  // smaller and at 0.4, so they don't compete with it.
  numCtx.setTransform(1, 0, 0, 1, 0, 0);
  numCtx.clearRect(0, 0, nums.width, nums.height);
  const sx = nums.width / w;
  const sy = nums.height / h;
  const current = landed ?? front.at(-1)?.f.number;
  for (const { f, n } of front) {
    const lit = f.number === landed;
    const [x, y] = at([n[0] * FACE_DEPTH, n[1] * FACE_DEPTH, 0]);
    const up = rotate(q, f.up);
    // Right, as you'd read the face from outside: up × normal
    const right: Vec = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
    // One die pixel along right, and one down the face, in the numbers canvas
    numCtx.setTransform(right[0] * sx * size, -right[1] * sy * size, -up[0] * sx * size, up[1] * sy * size, x * sx, y * sy);
    const main = f.number === current;
    if (!main) numCtx.scale(0.8, 0.8);
    drawNumber(numCtx, f.number, lit ? dark : green, lit ? green : dark, lit ? 2 : 1, main ? 1 : 0.4);
  }
  numCtx.setTransform(1, 0, 0, 1, 0, 0);
}

// A floating green d20. Clicking it rolls; `show` makes it roll to a
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
  const nums = useRef<HTMLCanvasElement>(null);
  const q = useRef<Quat>(facing(DIE.faces.find((f) => f.number === 20)!));
  // The rotation as last drawn, wobble and all, which a roll starts from
  const shown = useRef<Quat>(q.current);
  const frame = useRef(0);
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  const restingSince = useRef(performance.now());
  const [landed, setLanded] = useState<number>();
  const landedRef = useRef<number>(undefined);

  // At rest, a slow 3D wobble around the face it shows (none with reduced motion)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    const tick = (now: number) => {
      const el = canvas.current;
      if (el && nums.current && !rollingRef.current) {
        shown.current = wobble(q.current, now, Math.min(1, (now - restingSince.current) / WOBBLE_IN));
        draw(el, nums.current, shown.current, 1, landedRef.current);
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const redraw = useCallback(() => {
    if (canvas.current && nums.current) draw(canvas.current, nums.current, q.current, 1, landedRef.current);
  }, []);

  // The die's canvas keeps one canvas pixel per PIXEL screen pixels as its
  // box resizes; the numbers' canvas, one per device pixel.
  useEffect(() => {
    const el = canvas.current;
    const numEl = nums.current;
    if (!el || !numEl) return;
    const fit = () => {
      el.width = Math.max(1, Math.round(el.clientWidth / PIXEL));
      el.height = Math.max(1, Math.round(el.clientHeight / PIXEL));
      numEl.width = Math.max(1, Math.round(numEl.clientWidth * devicePixelRatio));
      numEl.height = Math.max(1, Math.round(numEl.clientHeight * devicePixelRatio));
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
      const numEl = nums.current;
      const face = DIE.faces.find((f) => f.number === value);
      if (!el || !numEl || !face) return;
      cancelAnimationFrame(frame.current);
      const from = shown.current;
      const to = facing(face);
      const land = () => {
        q.current = to;
        shown.current = to;
        landedRef.current = value;
        setLanded(value);
        setRolling(false);
        rollingRef.current = false;
        restingSince.current = performance.now();
        redraw();
        done?.();
      };
      landedRef.current = undefined;
      setRolling(true);
      rollingRef.current = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return land();
      // Tumble around a random axis, slowing down, while easing into the face it lands on
      const axis: Vec = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      const turns = (3 + Math.random() * 2) * Math.PI * 2;
      const start = performance.now();
      const step = (now: number) => {
        const u = Math.min(1, (now - start) / ROLL_MS);
        const spun = mul(axisAngle(axis, turns * (1 - (1 - u) ** 3)), from);
        q.current = slerp(spun, to, smooth(0.35, 1, u));
        // Bouncing: shrinking as it's tossed and coming back as it lands, fading out
        const bounce = Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u) ** 2 * 0.35;
        draw(el, numEl, q.current, 1 - bounce);
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
      <Button
        kind="bare"
        className="tools-roller-screen"
        disabled={disabled || rolling}
        aria-label="Roll the d20"
        onClick={() => {
          const value = roll(20);
          rollTo(value, () => onRolled(value));
        }}
      >
        {/* The die and, over it, its numbers; they float together */}
        <span className="tools-roller-die" aria-hidden="true">
          <canvas ref={canvas} />
          <canvas ref={nums} className="tools-roller-numbers" />
        </span>
        <span className="tools-roller-caption" aria-live="polite">
          {rolling ? "Rolling…" : landed ? `Rolled ${landed}` : ""}
        </span>
      </Button>
      {children}
    </section>
  );
}
