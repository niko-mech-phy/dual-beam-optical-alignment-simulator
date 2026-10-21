import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  FlaskConical,
  Play,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { Settings, Simulation } from "../physics/types";

interface WaveResult {
  model: string;
  grid_size: number;
  axis_um: number[];
  z_axis_um: number[];
  xy: number[][];
  xz: number[][];
  far: number[][];
  far_axis_direction_cosine: number[];
  profiles: { x: number[]; y: number[] };
  metrics: {
    overlap: number;
    independent_power_mw: number;
    transmission: number;
    spacing_um: number;
    peak_mw_per_um2: number;
    beams: { power_mw: number; centroid_um: number[]; radius_um: number[] }[];
  };
  cautions: string[];
  notes: string[];
}

const waveStyles = `
.wave-panel {padding:22px; color:#dbe5e9; background:#101923; border:1px solid #253440; border-radius:14px; font-size:12px;}
.wave-top {display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:20px;}
.wave-title {display:flex; align-items:center; gap:9px; font-size:16px; font-weight:600; color:#eff5f5;}
.wave-subtitle {color:#8596a6; line-height:1.65; margin:8px 0 0; max-width:740px;}
.wave-chip {display:inline-flex; align-items:center; gap:5px; color:#a2d5c6; border:1px solid #32554e; background:#1a302e; padding:5px 8px; border-radius:20px; white-space:nowrap; font-size:10px; letter-spacing:.05em;}
.wave-controls {display:grid; grid-template-columns:repeat(auto-fit,minmax(125px,1fr)); gap:12px; margin-bottom:16px;}
.wave-control {display:flex; flex-direction:column; gap:7px; color:#95a6b6; font-size:11px;}
.wave-control select,.wave-control input[type=number] {width:100%; background:#0a121b; border:1px solid #2a3c4c; border-radius:7px; color:#d6e3ed; font:inherit; padding:9px 10px; min-height:35px;}
.wave-control input[type=range] {width:100%; accent-color:#79d7bd;}
.wave-actions {display:flex; align-items:center; gap:12px; flex-wrap:wrap;}
.wave-run {display:inline-flex; align-items:center; gap:7px; cursor:pointer; background:#78d4b8; color:#09221c; border:0; border-radius:7px; padding:10px 14px; font-size:12px; font-weight:650;}
.wave-run:disabled {opacity:.55; cursor:wait;}.wave-note {font-size:11px; color:#8397a8; line-height:1.6;}
.wave-error,.wave-warning {display:flex; align-items:flex-start; gap:8px; background:#392a1a; border:1px solid #5d4529; color:#e2bf8e; padding:11px 13px; border-radius:8px; line-height:1.6; margin:13px 0;}
.wave-error code {color:#ffdbad; font-size:11px;}
.wave-empty {display:flex; align-items:center; gap:15px; border:1px dashed #2e4251; border-radius:10px; margin-top:20px; padding:25px; color:#8298aa; line-height:1.65;}
.wave-metrics {display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:20px 0 16px;}
.wave-metric {background:#0b141e; border:1px solid #253743; border-radius:8px; padding:13px;}
.wave-metric strong {display:block; color:#eaf5f3; font-size:20px; font-weight:500; margin-bottom:5px;}
.wave-metric span {font-size:10px; color:#8196a5; text-transform:uppercase; letter-spacing:.06em;}
.wave-maps {display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px;}
.wave-map {margin:0; min-width:0; background:#0a121b; padding:12px; border-radius:9px; border:1px solid #233441;}
.wave-map figcaption {display:flex; justify-content:space-between; gap:5px; color:#b5c7d4; font-size:11px; margin-bottom:10px;}
.wave-map figcaption span {font-size:9px; color:#758a9a;}
.wave-map canvas {display:block; width:100%; aspect-ratio:1; object-fit:fill; border:1px solid #1d2b39; border-radius:5px; background:#060d15;}
.wave-axis {display:flex; justify-content:space-between; gap:4px; color:#6f8799; font-size:9px; margin-top:7px;}
.wave-profiles {display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:15px;}
.wave-profile {border:1px solid #263845; border-radius:8px; padding:10px; background:#0b141e;}
.wave-profile svg {width:100%; height:65px; display:block;}.wave-profile p {font-size:10px; margin:0 0 5px; color:#8ca4b6;}
.wave-details {margin-top:16px; color:#8da2b2; line-height:1.7; font-size:11px;}.wave-details summary {cursor:pointer; color:#bbd2df;}.wave-details ul {padding-left:20px; margin:10px 0;}
.wave-stale {color:#e8bd78; font-size:11px;}.wave-section-label {color:#637e92; font-size:10px; text-transform:uppercase; letter-spacing:.09em; margin:18px 0 10px;}
@media(max-width:800px){.wave-maps {grid-template-columns:1fr 1fr;}.wave-map:last-child {grid-column:1/-1; max-width:360px;}.wave-metrics{grid-template-columns:1fr 1fr;}.wave-top{flex-direction:column; gap:8px;}.wave-panel{padding:15px;}}
@media(max-width:520px){.wave-maps{grid-template-columns:1fr;}.wave-map:last-child{max-width:none;}.wave-profiles{grid-template-columns:1fr;}}
`;

function Heatmap({
  values,
  title,
  subtitle,
  horizontal,
  vertical,
  log = false,
}: {
  values: number[][];
  title: string;
  subtitle: string;
  horizontal: [number, number];
  vertical: string;
  log?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !values.length) return;
    const rows = values.length,
      columns = values[0].length;
    canvas.width = columns;
    canvas.height = rows;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const im = ctx.createImageData(columns, rows);
    const stops = [
      [4, 11, 21],
      [17, 43, 66],
      [26, 103, 112],
      [92, 186, 160],
      [245, 225, 166],
    ];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const raw = Math.max(0, Math.min(1, values[rows - y - 1][x]));
        const t = log ? Math.log10(1 + 999 * raw) / 3 : Math.pow(raw, 0.6);
        const part = Math.min(3, Math.floor(t * 4)),
          frac = t * 4 - part,
          index = (y * columns + x) * 4;
        for (let c = 0; c < 3; c++)
          im.data[index + c] =
            stops[part][c] * (1 - frac) + stops[part + 1][c] * frac;
        im.data[index + 3] = 255;
      }
    ctx.putImageData(im, 0, 0);
    ctx.strokeStyle = "#bddee825";
    ctx.lineWidth = 0.55;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(columns / 2, 0);
    ctx.lineTo(columns / 2, rows);
    ctx.moveTo(0, rows / 2);
    ctx.lineTo(columns, rows / 2);
    ctx.stroke();
  }, [values, log]);
  const fmt = (x: number) =>
    Math.abs(x) >= 100
      ? x.toFixed(0)
      : Math.abs(x) >= 1
        ? x.toFixed(1)
        : x.toPrecision(2);
  return (
    <figure className="wave-map">
      <figcaption>
        {title}
        <span>{subtitle}</span>
      </figcaption>
      <canvas ref={ref} aria-label={`${title}: ${vertical}`} />
      <div className="wave-axis">
        <span>{fmt(horizontal[0])}</span>
        <span>{vertical}</span>
        <span>{fmt(horizontal[1])}</span>
      </div>
    </figure>
  );
}

function LineProfile({
  values,
  label,
  color,
}: {
  values: number[];
  label: string;
  color: string;
}) {
  const path = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${(i / (values.length - 1)) * 400},${60 - v * 54}`,
    )
    .join(" ");
  return (
    <div className="wave-profile">
      <p>{label} · normalized central section</p>
      <svg
        viewBox="0 0 400 65"
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <line x1="0" y1="60" x2="400" y2="60" stroke="#2b4353" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.6" />
      </svg>
    </div>
  );
}

export default function WavePanel({
  simulation,
  settings,
}: {
  simulation: Simulation;
  settings: Settings;
}) {
  const [grid, setGrid] = useState(128),
    [windowScale, setWindowScale] = useState(10),
    [rangeScale, setRangeScale] = useState(2);
  const [apertureScale, setApertureScale] = useState(0),
    [astigmatism, setAstigmatism] = useState(0),
    [coma, setComa] = useState(0),
    [spherical, setSpherical] = useState(0);
  const [polarization, setPolarization] = useState("orthogonal"),
    [phase, setPhase] = useState(0),
    [planeScale, setPlaneScale] = useState(0),
    [log, setLog] = useState(false);
  const [result, setResult] = useState<WaveResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [lastSignature, setLastSignature] = useState("");
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);
  const payload = useMemo(() => {
    const beams = Object.values(simulation.beams);
    const waist = Math.max(...beams.map((b) => b.waistRadius * 1000), 0.3);
    const position = Math.max(
      ...beams.flatMap((b) => [
        Math.abs(b.waist[1] * 1000),
        Math.abs(b.waist[2] * 1000),
      ]),
    );
    const rayleigh = Math.max(...beams.map((b) => b.rayleigh * 1000), 1);
    return {
      grid_size: grid,
      wavelength_um: settings.wavelengthNm / 1000,
      window_um: Math.max(
        2,
        Math.min(50000, waist * windowScale + 2 * position),
      ),
      z_range_um: Math.min(100000, rayleigh * rangeScale),
      plane_z_um: Math.max(-100000, Math.min(100000, rayleigh * planeScale)),
      z_slices: 65,
      aperture_radius_um: apertureScale * waist,
      aberrations: { astigmatism, coma, spherical },
      polarization,
      relative_phase: phase,
      beams: beams.map((b) => {
        const trap = b.segments.find(
          (s) =>
            (s.fromId.startsWith("wa:exit") && s.toId.startsWith("wb:entry")) ||
            (s.fromId.startsWith("wb:exit") && s.toId.startsWith("wa:entry")),
        );
        return {
          waist_um: Math.max(0.2, b.waistRadius * 1000),
          center_um: [b.waist[1] * 1000, b.waist[2] * 1000, b.waist[0] * 1000],
          direction: [b.direction[1], b.direction[2], b.direction[0]],
          power_mw: trap ? trap.power * 1000 : 0,
        };
      }),
    };
  }, [
    simulation,
    settings.wavelengthNm,
    grid,
    windowScale,
    rangeScale,
    planeScale,
    apertureScale,
    astigmatism,
    coma,
    spherical,
    polarization,
    phase,
  ]);
  const signature = JSON.stringify(payload),
    stale = !!result && lastSignature !== signature;
  async function run() {
    setBusy(true);
    setError("");
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch("/api/wave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: signature,
        signal: controller.signal,
      });
      const text = await response.text();
      let data: WaveResult & { error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The local wave engine is not responding.");
      }
      if (!response.ok)
        throw new Error(data.error || "The local wave engine is unavailable.");
      setResult(data);
      setLastSignature(signature);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(
          err instanceof Error
            ? err.message
            : "Could not connect to the local wave engine.",
        );
      else
        setError(
          "Calculation was interrupted or exceeded 90 seconds. Try a smaller grid.",
        );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  const fixed = (value: number, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : "—";
  return (
    <section className="wave-panel" aria-label="Advanced scalar wave optics">
      <style>{waveStyles}</style>
      <div className="wave-top">
        <div>
          <div className="wave-title">
            <FlaskConical size={18} color="#84ddc2" />
            Wave optics workbench
          </div>
          <p className="wave-subtitle">
            Propagate both beams with a local NumPy/SciPy angular-spectrum
            solver. These are scalar diffraction results from Gaussian
            near-waist boundaries. Adjust the experiment, then calculate a new
            snapshot.
          </p>
        </div>
        <span className="wave-chip">
          <Activity size={11} />
          MODE C · LOCAL PYTHON
        </span>
      </div>
      <div className="wave-controls">
        <label className="wave-control">
          Grid resolution
          <select value={grid} onChange={(e) => setGrid(+e.target.value)}>
            <option value="128">128 × 128 · fast</option>
            <option value="256">256 × 256</option>
            <option value="512">512 × 512 · fine</option>
          </select>
        </label>
        <label className="wave-control">
          Field of view
          <select
            value={windowScale}
            onChange={(e) => setWindowScale(+e.target.value)}
          >
            {[6, 10, 16, 24].map((x) => (
              <option key={x} value={x}>
                {x} × waist radius
              </option>
            ))}
          </select>
        </label>
        <label className="wave-control">
          Axial half-range
          <select
            value={rangeScale}
            onChange={(e) => setRangeScale(+e.target.value)}
          >
            {[0.001, 0.01, 0.25, 1, 2, 5, 10].map((x) => (
              <option key={x} value={x}>
                ±{x} Rayleigh ranges
              </option>
            ))}
          </select>
        </label>
        <label className="wave-control">
          XY observation plane
          <select
            value={planeScale}
            onChange={(e) => setPlaneScale(+e.target.value)}
          >
            {[-5, -2, -1, 0, 1, 2, 5].map((x) => (
              <option key={x} value={x}>
                {x === 0
                  ? "Trap plane"
                  : `${x > 0 ? "+" : ""}${x} Rayleigh ranges`}
              </option>
            ))}
          </select>
        </label>
        <label className="wave-control">
          Input aperture
          <select
            value={apertureScale}
            onChange={(e) => setApertureScale(+e.target.value)}
          >
            <option value="0">Open · no clipping</option>
            {[0.5, 0.75, 1, 1.5, 2, 3].map((x) => (
              <option key={x} value={x}>
                Radius {x} × waist
              </option>
            ))}
          </select>
        </label>
        <label className="wave-control">
          Polarization
          <select
            value={polarization}
            onChange={(e) => setPolarization(e.target.value)}
          >
            <option value="orthogonal">Orthogonal · add intensities</option>
            <option value="parallel">Parallel · coherent sum</option>
          </select>
        </label>
      </div>
      <div className="wave-section-label">
        Boundary phase screens · coefficients in waves
      </div>
      <div className="wave-controls">
        {[
          { label: "Astigmatism", value: astigmatism, set: setAstigmatism },
          { label: "Coma", value: coma, set: setComa },
          { label: "Spherical", value: spherical, set: setSpherical },
        ].map((c) => (
          <label className="wave-control" key={c.label}>
            {c.label}{" "}
            <span style={{ color: "#b7d6d0" }}>{c.value.toFixed(2)} λ</span>
            <input
              aria-label={`${c.label} phase aberration`}
              type="range"
              min="-1"
              max="1"
              step=".05"
              value={c.value}
              onChange={(e) => c.set(+e.target.value)}
            />
          </label>
        ))}
        {polarization === "parallel" && (
          <label className="wave-control">
            Relative phase <span>{(phase / Math.PI).toFixed(2)} π</span>
            <input
              aria-label="Relative phase"
              type="range"
              min="0"
              max={2 * Math.PI}
              step={Math.PI / 20}
              value={phase}
              onChange={(e) => setPhase(+e.target.value)}
            />
          </label>
        )}
      </div>
      <div className="wave-actions">
        <button className="wave-run" disabled={busy} onClick={run}>
          {busy ? <RefreshCw size={14} /> : <Play size={13} />}{" "}
          {busy ? "Calculating locally…" : "Run wave calculation"}
        </button>
        <span className="wave-note">
          {fixed(payload.window_um)} μm field · ±{fixed(payload.z_range_um)} μm
          axial · no network calls while adjusting
        </span>
        {stale && (
          <span className="wave-stale">
            Configuration changed · run to update
          </span>
        )}
      </div>
      {error && (
        <div className="wave-error" role="alert">
          <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            {error}
            <br />
            Start the local backend from the project folder:{" "}
            <code>python3 python/server.py</code>
          </div>
        </div>
      )}
      {!result && (
        <div className="wave-empty">
          <Activity size={35} color="#4f8c80" />
          <div>
            <strong
              style={{
                display: "block",
                color: "#bed5dc",
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              From rays to diffraction
            </strong>
            Calculate the focal plane, axial section and angular far field.
            Clipping and phase screens reveal where a Gaussian approximation
            stops describing the profile.
          </div>
          <ArrowRight size={22} style={{ marginLeft: "auto", flexShrink: 0 }} />
        </div>
      )}
      {result && (
        <>
          <div className="wave-metrics">
            <div className="wave-metric">
              <strong>{fixed(result.metrics.overlap * 100)}%</strong>
              <span>Intensity overlap</span>
            </div>
            <div className="wave-metric">
              <strong>{fixed(result.metrics.transmission * 100)}%</strong>
              <span>Power retained</span>
            </div>
            <div className="wave-metric">
              <strong>{fixed(result.metrics.spacing_um, 2)} μm</strong>
              <span>Transverse sample</span>
            </div>
            <div className="wave-metric">
              <strong>{result.grid_size}²</strong>
              <span>FFT grid</span>
            </div>
          </div>
          <label
            className="wave-note"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 11,
            }}
          >
            <input
              type="checkbox"
              checked={log}
              onChange={(e) => setLog(e.target.checked)}
            />
            Log display · reveal diffraction tails
          </label>
          <div className="wave-maps">
            <Heatmap
              values={result.xy}
              title="Focal / observation plane"
              subtitle="XY intensity"
              horizontal={[result.axis_um[0], result.axis_um.at(-1)!]}
              vertical="transverse x (μm) · y ↑"
              log={log}
            />
            <Heatmap
              values={result.xz}
              title="Axial section"
              subtitle="XZ intensity · y = 0"
              horizontal={[result.axis_um[0], result.axis_um.at(-1)!]}
              vertical={`x (μm) · z ↑ ±${fixed(result.z_axis_um.at(-1)!)}`}
              log={log}
            />
            <Heatmap
              values={result.far}
              title="Angular far field"
              subtitle="separate channels summed"
              horizontal={[
                result.far_axis_direction_cosine[0],
                result.far_axis_direction_cosine.at(-1)!,
              ]}
              vertical="direction cosine x · y ↑"
              log={log}
            />
          </div>
          <div className="wave-profiles">
            <LineProfile
              values={result.profiles.x}
              label="Transverse X"
              color="#87d8bd"
            />
            <LineProfile
              values={result.profiles.y}
              label="Transverse Y"
              color="#f0b893"
            />
          </div>
          {result.cautions.length > 0 && (
            <div className="wave-warning">
              <TriangleAlert
                size={16}
                style={{ flexShrink: 0, marginTop: 3 }}
              />
              <div>
                {result.cautions.map((text, i) => (
                  <div key={i}>{text}</div>
                ))}
              </div>
            </div>
          )}
          <details className="wave-details">
            <summary>Model, coordinates and sampling</summary>
            <p>
              Local wave coordinates (x, y, z) correspond to world (Y, Z, X).
              Beam A propagates toward −z and beam B toward +z. Each beam
              retains its own waist position, direction and power. The relative
              phase is referenced to the two input waist centers.
            </p>
            <ul>
              {result.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
              <li>
                Input radius inherits the browser Gaussian model. This coherent
                wave calculation assumes M² = 1; a general M² beam requires a
                partial coherence model.
              </li>
              <li>
                Overlap is the normalized integral of √(IₐIᵦ), independent of
                phase. Retained power is the sum of the two independent beam
                powers, not counterpropagating net flux.
              </li>
              <li>
                Aberration phase: 2π[a(u²−v²) + c(3r²−2)u + s(6r⁴−6r²+1)]. The
                scale is the aperture radius, or twice each beam’s own boundary
                radius when open.
              </li>
            </ul>
            <p>
              At the selected plane: A radius{" "}
              {result.metrics.beams[0].radius_um
                .map((n) => fixed(n, 2))
                .join(" × ")}{" "}
              μm; B radius{" "}
              {result.metrics.beams[1].radius_um
                .map((n) => fixed(n, 2))
                .join(" × ")}{" "}
              μm. Radii are twice the transverse intensity standard deviations.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
