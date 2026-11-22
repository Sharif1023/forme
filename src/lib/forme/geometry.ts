/** Small path toolkit for the layered SVG models. All coordinates live in a 400×1000 canvas. */
export type P = readonly [number, number];
export const CX = 200;

const r = (n: number) => Math.round(n * 10) / 10;
const pt = (p: P) => `${r(p[0])},${r(p[1])}`;

/** Catmull-Rom spline through points, emitted as cubic segments (pen already at pts[0]). */
function spline(pts: readonly P[], tension = 1): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1: P = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: P = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/** Each run is smoothed on its own; runs meet at corners. */
export function path(runs: readonly (readonly P[])[], close = true): string {
  const first = runs[0]?.[0];
  if (!first) return "";
  let d = `M${pt(first)}`;
  for (const run of runs) d += spline(run);
  return close ? `${d}Z` : d;
}

export const mx = (p: P): P => [2 * CX - p[0], p[1]];
export const mirrorRuns = (runs: readonly (readonly P[])[]): P[][] => runs.map((run) => run.map(mx));

/** Left-half runs from the centre line (top) to the centre line (bottom), mirrored into a closed shape. */
export function symPath(runs: readonly (readonly P[])[]): string {
  const back = [...runs].reverse().map((run) => [...run].reverse().map(mx));
  return path([...runs, ...back]);
}

/** Open stroke through the left run, the centre and its mirror (e.g. waistbands, necklines). */
export function symStroke(run: readonly P[]): string {
  const back = [...run].reverse().map(mx);
  return path([[...run, ...back.slice(1)]], false);
}

/** Linear lookup of x on a y-ascending profile, clamped at the ends. */
export function xAt(profile: readonly P[], y: number): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y <= first[1]) return first[0];
  if (y >= last[1]) return last[0];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (y >= a[1] && y <= b[1]) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return last[0];
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** n+1 points from y0 to y1, x supplied by fn(y, t). */
export function sample(y0: number, y1: number, n: number, fn: (y: number, t: number) => number): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = lerp(y0, y1, t);
    out.push([fn(y, t), y]);
  }
  return out;
}

/** Mirror an absolute-coordinate path string (M/L/C/Q/S/T/Z only) around the centre line. */
export function mirrorD(d: string): string {
  let isX = true;
  return d.replace(/[MLCQSTZ]|-?\d*\.?\d+/gi, (tok) => {
    if (/^[A-Za-z]$/.test(tok)) {
      isX = true;
      return tok;
    }
    const n = parseFloat(tok);
    const out = isX ? r(2 * CX - n) : n;
    isX = !isX;
    return String(out);
  });
}

/* ---------- colour helpers for garment shading ---------- */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r1, g, b]: [number, number, number]): string {
  return `#${[r1, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}
export function mix(hex: string, target: [number, number, number], amt: number): string {
  const c = hexToRgb(hex);
  return rgbToHex([lerp(c[0], target[0], amt), lerp(c[1], target[1], amt), lerp(c[2], target[2], amt)]);
}
export const shade = (hex: string, amt: number) => mix(hex, [24, 18, 12], amt);
export const tint = (hex: string, amt: number) => mix(hex, [255, 250, 242], amt);
export function luminance(hex: string): number {
  const [a, b, c] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * a + 0.7152 * b + 0.0722 * c;
}
