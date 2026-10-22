import { useEffect, useRef } from "react";
import { frame, dot, scale } from "../physics";
import type { Measurement, BeamId, Vec3 } from "../physics/types";
export type BeamChoice = BeamId | "both";
export function Profiler({
  measurement,
  choice = "both",
  fov,
  exposure = 1,
  noise = false,
  side = false,
  particle = false,
  zoom = 1,
  viewAngle = 0,
  cameraOffset = 0,
  referenceRadius = 0.002,
  referencePower = 0.5,
  cameraPosition = [0, 70, 0],
  cameraDirection = [0, -1, 0],
}: {
  measurement: Measurement;
  choice?: BeamChoice;
  fov: number;
  exposure?: number;
  noise?: boolean;
  side?: boolean;
  particle?: boolean;
  zoom?: number;
  viewAngle?: number;
  cameraOffset?: number;
  referenceRadius?: number;
  referencePower?: number;
  cameraPosition?: Vec3;
  cameraDirection?: Vec3;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const n = 256;
    canvas.width = n;
    canvas.height = n;
    const data = ctx.createImageData(n, n);
    const spots = Object.values(measurement.spots).filter(
      (s) => s.valid && (choice === "both" || s.beam === choice),
    );
    const span = fov / zoom;
    let max = 0;
    const values = new Float32Array(n * n * 2);
    const angle = (viewAngle * Math.PI) / 180;
    const cameraFrame = frame(cameraDirection),
      toParticle = scale(cameraPosition, -1),
      depth = dot(toParticle, cameraFrame.n),
      distanceGain = depth > 0 ? (70 / depth) ** 2 : 0;
    const cameraU =
        depth > 0 ? (dot(toParticle, cameraFrame.u) * 70) / depth : 1e6,
      cameraV = depth > 0 ? (dot(toParticle, cameraFrame.v) * 70) / depth : 1e6;
    const imageU =
        cameraU * Math.cos(angle) - cameraV * Math.sin(angle) - cameraOffset,
      imageV = cameraU * Math.sin(angle) + cameraV * Math.cos(angle);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n - 0.5) * span,
          v = (0.5 - (j + 0.5) / n) * span;
        for (const s of spots) {
          const sx =
              s.x * Math.cos(angle) - s.y * Math.sin(angle) - cameraOffset,
            sy = s.x * Math.sin(angle) + s.y * Math.cos(angle);
          const r = Math.max(s.radius, (span / n) * 0.65);
          const val = side
            ? particle
              ? ((distanceGain * s.power) /
                  Math.max(s.radius * s.radius, 1e-15)) *
                Math.exp(
                  (-2 * (s.x * s.x + s.y * s.y)) /
                    Math.max(s.radius * s.radius, 1e-15),
                ) *
                Math.exp(
                  (-2 * ((u - imageU) ** 2 + (v - imageV) ** 2)) /
                    (span * 0.035) ** 2,
                )
              : 0
            : (s.power / (r * r)) *
              Math.exp((-2 * ((u - sx) ** 2 + (v - sy) ** 2)) / (r * r));
          const k = (j * n + i) * 2 + (s.beam === "A" ? 0 : 1);
          values[k] = val;
          max = Math.max(max, val);
        }
      }
    // Keep a shared display gain; normalized images are diagnostic shapes, not radiometry.
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const p = j * n + i,
          k = p * 4;
        const gain = side
          ? referencePower / (referenceRadius * referenceRadius)
          : max;
        const a = (values[p * 2] / Math.max(gain, 1e-15)) * exposure,
          b = (values[p * 2 + 1] / Math.max(gain, 1e-15)) * exposure;
        const glowA = 1 - Math.exp(-2.3 * a),
          glowB = 1 - Math.exp(-2.3 * b);
        const grain = noise
          ? ((Math.sin(i * 23.7 + j * 73.1) * 43758.54) % 1) * 5
          : 0;
        const background = Math.max(0, 1 - Math.min(1, glowA + glowB));
        data.data[k] = Math.min(
          255,
          246 * background + 192 * glowA + 17 * glowB + grain,
        );
        data.data[k + 1] = Math.min(
          255,
          250 * background + 70 * glowA + 139 * glowB + grain,
        );
        data.data[k + 2] = Math.min(
          255,
          252 * background + 55 * glowA + 119 * glowB + grain,
        );
        data.data[k + 3] = 255;
      }
    ctx.putImageData(data, 0, 0);
    ctx.strokeStyle = "#adc3ce88";
    ctx.lineWidth = 0.6;
    for (let t = 32; t < n; t += 32) {
      ctx.beginPath();
      ctx.moveTo(t, 0);
      ctx.lineTo(t, n);
      ctx.moveTo(0, t);
      ctx.lineTo(n, t);
      ctx.stroke();
    }
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "#7695a477";
    ctx.beginPath();
    ctx.moveTo(n / 2, 0);
    ctx.lineTo(n / 2, n);
    ctx.moveTo(0, n / 2);
    ctx.lineTo(n, n / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (side && particle) {
      const x = n * (imageU / span + 0.5),
        y = n * (0.5 - imageV / span);
      if (x >= 0 && x <= n && y >= 0 && y <= n) {
        ctx.strokeStyle = "#637d8b";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
    if (!side)
      for (const s of spots) {
        const x = n * (s.x / span + 0.5),
          y = n * (0.5 - s.y / span);
        ctx.strokeStyle = s.beam === "A" ? "#b94b30" : "#087d68";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }
  }, [
    measurement,
    choice,
    fov,
    exposure,
    noise,
    side,
    particle,
    zoom,
    viewAngle,
    cameraOffset,
    referenceRadius,
    referencePower,
    cameraPosition,
    cameraDirection,
  ]);
  return (
    <canvas
      ref={ref}
      className="profiler-canvas"
      aria-label={
        side
          ? "Simulated scattering camera image"
          : "Gaussian beam intensity at selected observation plane"
      }
    />
  );
}
export function ProfilePlot({
  measurement,
  choice = "both",
  fov,
  axis = "x",
}: {
  measurement: Measurement;
  choice?: BeamChoice;
  fov: number;
  axis?: "x" | "y";
}) {
  const spots = Object.values(measurement.spots).filter(
    (s) => s.valid && (choice === "both" || s.beam === choice),
  );
  return (
    <svg
      className="profile-plot"
      viewBox="0 0 270 48"
      role="img"
      aria-label={`${axis} intensity cross section`}
    >
      <line x1="0" x2="270" y1="42" y2="42" stroke="#25333e" />
      {spots.map((s) => {
        const vals = Array.from({ length: 270 }, (_, i) =>
          Math.exp(
            (-2 * ((i / 269 - 0.5) * fov - s[axis]) ** 2) /
              Math.max(s.radius ** 2, 1e-15),
          ),
        );
        return (
          <path
            key={s.beam}
            d={vals
              .map((v, i) => `${i ? "L" : "M"}${i},${42 - 36 * v}`)
              .join(" ")}
            fill="none"
            stroke={s.beam === "A" ? "#ff9875" : "#59dec0"}
            strokeWidth="1.5"
          />
        );
      })}
      <text x="4" y="12" fill="#718392" fontSize="9">
        {axis.toUpperCase()} profile
      </text>
    </svg>
  );
}
