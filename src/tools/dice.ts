// The d20: fair rolls, and the die's shape for the roller to draw. The
// number is always picked first; the roller only shows it landing.

// A whole number from 1 to `sides`, from the browser's crypto random, with
// rejection so every face is equally likely.
export function roll(sides = 20): number {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return (buf[0] % sides) + 1;
}

export type Vec = [number, number, number];

export interface Face {
  // Indexes into the die's vertices
  corners: [number, number, number];
  // Outward unit normal, which is also the direction of the face's center
  normal: Vec;
  // Unit vector in the face, from its center toward its first corner: the
  // way its number reads up
  up: Vec;
  number: number;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const len = (v: Vec) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// An icosahedron with unit circumradius. Its faces are numbered like a real
// d20, with opposite faces adding up to 21.
export function icosahedron(): { vertices: Vec[]; faces: Face[] } {
  const raw: Vec[] = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) raw.push([0, a, b], [a, b, 0], [b, 0, a]);
  const vertices = raw.map((v) => v.map((x) => x / len(v)) as Vec);
  // Corners of a face are one edge apart, the shortest distance between vertices.
  const edge = Math.min(...vertices.slice(1).map((v) => len([v[0] - vertices[0][0], v[1] - vertices[0][1], v[2] - vertices[0][2]])));
  const near = (i: number, j: number) =>
    Math.abs(len([vertices[i][0] - vertices[j][0], vertices[i][1] - vertices[j][1], vertices[i][2] - vertices[j][2]]) - edge) < 1e-6;
  const faces: Face[] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      for (let k = j + 1; k < 12; k++) {
        if (!near(i, j) || !near(j, k) || !near(i, k)) continue;
        const c: Vec = [0, 1, 2].map((n) => (vertices[i][n] + vertices[j][n] + vertices[k][n]) / 3) as Vec;
        const up: Vec = [0, 1, 2].map((n) => vertices[i][n] - c[n]) as Vec;
        faces.push({ corners: [i, j, k], normal: c.map((x) => x / len(c)) as Vec, up: up.map((x) => x / len(up)) as Vec, number: 0 });
      }
  let next = 1;
  for (const f of faces) {
    if (f.number) continue;
    const opposite = faces.find((g) => dot(g.normal, f.normal) < -0.999)!;
    f.number = next;
    opposite.number = 21 - next;
    next++;
  }
  return { vertices, faces };
}

// Rotations, as unit quaternions [w, x, y, z]
export type Quat = [number, number, number, number];

export function axisAngle(axis: Vec, angle: number): Quat {
  const l = len(axis) || 1;
  const s = Math.sin(angle / 2) / l;
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

export function mul(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function rotate(q: Quat, v: Vec): Vec {
  const [w, x, y, z] = q;
  // v + 2w(q×v) + 2q×(q×v)
  const t: Vec = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const to = d < 0 ? (b.map((x) => -x) as Quat) : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const q = a.map((x, i) => x + (to[i] - x) * t) as Quat;
    const l = Math.hypot(...q);
    return q.map((x) => x / l) as Quat;
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((x, i) => x * wa + to[i] * wb) as Quat;
}

// A rotation that turns `face` toward the viewer (+z), spun around the view so
// its number reads upright (or by `spin`, if given), and tipped back a little
// so the die still looks solid.
export function facing(face: Face, spin?: number): Quat {
  const n = face.normal;
  const z: Vec = [0, 0, 1];
  const axis: Vec = [n[1] * z[2] - n[2] * z[1], n[2] * z[0] - n[0] * z[2], n[0] * z[1] - n[1] * z[0]];
  const align = len(axis) < 1e-6 ? (dot(n, z) > 0 ? ([1, 0, 0, 0] as Quat) : axisAngle([1, 0, 0], Math.PI)) : axisAngle(axis, Math.acos(dot(n, z)));
  // Turned toward you, the face's up points this way on screen; spin it to +y
  const up = rotate(align, face.up);
  const upright = Math.PI / 2 - Math.atan2(up[1], up[0]);
  return mul(axisAngle([1, 0, 0], -0.2), mul(axisAngle(z, spin ?? upright), align));
}
