import type { Complex, Vec3 } from "./types";
export const add = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const scale = (a: Vec3, s: number): Vec3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
];
export const dot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(...a);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));
export const clamp = (x: number, a = -1, b = 1) => Math.max(a, Math.min(b, x));
export const reflect = (d: Vec3, n: Vec3): Vec3 =>
  normalize(sub(d, scale(normalize(n), 2 * dot(d, normalize(n)))));
/** Rodrigues rotation, right-handed, active rotations. */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const n = normalize(axis),
    c = Math.cos(angle),
    s = Math.sin(angle);
  return add(
    add(scale(v, c), scale(cross(n, v), s)),
    scale(n, dot(n, v) * (1 - c)),
  );
}
/** Mount yaw is about the fixed local vertical; pitch then acts about the yawed local horizontal. */
export function mountRotate(
  v: Vec3,
  normal: Vec3,
  pitch: number,
  yaw: number,
  roll = 0,
): Vec3 {
  const vertical: Vec3 =
    Math.abs(dot(normal, [0, 1, 0])) > 0.98 ? [0, 0, 1] : [0, 1, 0];
  const horizontal = normalize(cross(vertical, normal));
  let result = rotate(v, vertical, yaw);
  result = rotate(result, rotate(horizontal, vertical, yaw), pitch);
  return rotate(
    result,
    normalize(mountRotateBase(normal, vertical, horizontal, pitch, yaw)),
    roll,
  );
}
function mountRotateBase(
  v: Vec3,
  vertical: Vec3,
  horizontal: Vec3,
  pitch: number,
  yaw: number,
) {
  return rotate(
    rotate(v, vertical, yaw),
    rotate(horizontal, vertical, yaw),
    pitch,
  );
}
export function planeHit(
  origin: Vec3,
  direction: Vec3,
  point: Vec3,
  normal: Vec3,
): { point: Vec3; distance: number } | null {
  const den = dot(direction, normal);
  if (Math.abs(den) < 1e-10) return null;
  const distance = dot(sub(point, origin), normal) / den;
  if (distance < -1e-7) return null;
  return {
    point: add(origin, scale(direction, Math.max(0, distance))),
    distance: Math.max(0, distance),
  };
}
/** Normal points toward the incident medium; flipped automatically. Returns null on total internal reflection. */
export function refract(
  direction: Vec3,
  normal: Vec3,
  n1: number,
  n2: number,
): Vec3 | null {
  let n = normalize(normal);
  const d = normalize(direction);
  if (dot(d, n) > 0) n = scale(n, -1);
  const eta = n1 / n2,
    c = -dot(d, n),
    k = 1 - eta * eta * (1 - c * c);
  return k < 0
    ? null
    : normalize(add(scale(d, eta), scale(n, eta * c - Math.sqrt(k))));
}
export const propagateQ = (
  q: Complex,
  distance: number,
  index = 1,
): Complex => ({ re: q.re + distance / index, im: q.im });
export function lensQ(q: Complex, f: number): Complex {
  const a = 1 - q.re / f,
    b = -q.im / f,
    den = a * a + b * b;
  return { re: (q.re * a + q.im * b) / den, im: (q.im * a - q.re * b) / den };
}
export const radiusFromQ = (q: Complex, wavelengthMm = 0.001064, m2 = 1) =>
  Math.sqrt(
    Math.max(
      0,
      (m2 * wavelengthMm * (q.re * q.re + q.im * q.im)) / (Math.PI * q.im),
    ),
  );
export const waistFromQ = (q: Complex, wavelengthMm = 0.001064, m2 = 1) => ({
  distance: -q.re,
  radius: Math.sqrt((m2 * wavelengthMm * q.im) / Math.PI),
  rayleigh: q.im,
});
export function frame(normal: Vec3): { u: Vec3; v: Vec3; n: Vec3 } {
  const n = normalize(normal),
    reference: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(reference, n));
  return { u, v: normalize(cross(n, u)), n };
}
export function gaussianOverlap(separation: number, w1: number, w2: number) {
  const s = w1 * w1 + w2 * w2;
  return s > 0
    ? ((4 * w1 * w1 * w2 * w2) / (s * s)) *
        Math.exp((-2 * separation * separation) / s)
    : 0;
}
export function combinedIntensity(
  i1: number,
  i2: number,
  polarization1: Vec3,
  polarization2: Vec3,
  phase = 0,
) {
  return (
    i1 +
    i2 +
    2 *
      Math.sqrt(Math.max(0, i1 * i2)) *
      dot(polarization1, polarization2) *
      Math.cos(phase)
  );
}
export const counterAngle = (a: Vec3, b: Vec3) =>
  Math.acos(clamp(-dot(normalize(a), normalize(b))));
/** Numeric rank by pivoted elimination; scale-relative tolerance. */
export function matrixRank(matrix: number[][], tolerance = 1e-6): number {
  if (!matrix.length) return 0;
  const a = matrix.map((r) => [...r]),
    rows = a.length,
    cols = a[0].length;
  const threshold = Math.max(...a.flat().map(Math.abs), 1e-20) * tolerance;
  let rank = 0;
  for (let c = 0; c < cols && rank < rows; c++) {
    let p = rank;
    for (let r = rank + 1; r < rows; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) <= threshold) continue;
    [a[p], a[rank]] = [a[rank], a[p]];
    const v = a[rank][c];
    for (let k = c; k < cols; k++) a[rank][k] /= v;
    for (let r = 0; r < rows; r++)
      if (r !== rank) {
        const f = a[r][c];
        for (let k = c; k < cols; k++) a[r][k] -= f * a[rank][k];
      }
    rank++;
  }
  return rank;
}
