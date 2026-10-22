import { useEffect, useMemo, useRef, useState } from "react";
import {
  Aperture,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Focus,
  GitBranch,
  Grip,
  Layers,
  Maximize2,
  Minus,
  MoreHorizontal,
  Move3D,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
  Upload,
  Waves,
  X,
  Zap,
} from "lucide-react";
import OpticalScene from "./components/OpticalScene";
import ErrorBoundary from "./components/ErrorBoundary";
import WavePanel from "./components/WavePanel";
import MeasuredDiagnostics from "./components/MeasuredDiagnostics";
import { Profiler, ProfilePlot } from "./components/Profiler";
import type { BeamChoice } from "./components/Profiler";
import {
  COMPONENTS,
  DEFAULT_ROUTES,
  createConfiguration,
  simulate,
  getPlanes,
  measure,
  randomizeConfiguration,
  suggestAdjustment,
  applyAdjustment,
  resetComponent,
  normalize,
  rotate,
} from "./physics";
import type {
  Adjustment,
  AssistantAdvice,
  BeamId,
  ComponentId,
  Configuration,
  Plane,
  Settings,
  Simulation,
  Vec3,
} from "./physics/types";

type Mode = "experiment" | "training" | "wave";
type Scenario = "irises" | "coaxial" | "waists" | "crossing";
const clamp = (v: number, lo = -5, hi = 5) => Math.max(lo, Math.min(hi, v));
const fmt = (v: number, dp = 2) => (Number.isFinite(v) ? v.toFixed(dp) : "—");
const signed = (v: number, dp = 1) => `${v > 0 ? "+" : ""}${fmt(v, dp)}`;
const unit = (mm: number) =>
  !Number.isFinite(mm)
    ? "—"
    : Math.abs(mm) < 0.1
      ? `${fmt(mm * 1000, 1)} µm`
      : `${fmt(mm, 2)} mm`;
const axesLabel: Record<keyof Adjustment, string> = {
  pitch: "Pitch",
  yaw: "Yaw",
  z: "Axial Z",
  x: "Decenter X",
  y: "Decenter Y",
  roll: "Roll",
};
const colors = { A: "#ff9875", B: "#59dec0" };
const scenarioCopy: Record<
  Scenario,
  { name: string; description: string; steps: string[] }
> = {
  irises: {
    name: "01 · Two-iris beam walk",
    description:
      "Center beam A through two separated irises. Use both mirrors to control position and direction.",
    steps: [
      "Measure beam A at two iris stations.",
      "Use the upstream mirror for angular leverage.",
      "Recenter with the second mirror, then repeat.",
    ],
  },
  coaxial: {
    name: "02 · Find a common axis",
    description:
      "Make A and B coincide at two separated planes. One overlapping spot is not enough.",
    steps: [
      "Measure the two beams before and after the trap.",
      "Correct lateral displacement and angular mismatch.",
      "Verify a second plane before calling it aligned.",
    ],
  },
  waists: {
    name: "03 · Overlap the waists",
    description:
      "With transverse alignment established, scan around the trap and bring both foci together.",
    steps: [
      "Measure widths at three axial stations.",
      "Move only lens Z to translate each waist.",
      "Check lateral overlap again after moving a lens.",
    ],
  },
  crossing: {
    name: "04 · The crossing-beam trap",
    description:
      "The beams meet at one plane but travel along different axes. Find the ambiguity with another measurement.",
    steps: [
      "Inspect the apparently overlapping trap spots.",
      "Measure at a second axial position.",
      "Remove the angle while maintaining the crossing position.",
    ],
  },
};
const KIND_ICON: Record<string, typeof Box> = {
  mirror: SlidersHorizontal,
  lens: Focus,
  pbs: Box,
  laser: Zap,
  hwp: Aperture,
  window: Layers,
  iris: Crosshair,
  camera: Camera,
  detector: ScanLine,
};

function StepSlider({
  label,
  value,
  onChange,
  disabled = false,
  unitText,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  unitText?: string;
}) {
  return (
    <div className={`adjustment ${disabled ? "disabled" : ""}`}>
      <div className="adjustment-label">
        <span>{label}</span>
        <span className="step-value">
          {value > 0 ? "+" : ""}
          {fmt(value, Number.isInteger(value) ? 0 : 1)}
          <small>steps</small>
        </span>
      </div>
      <div className="step-input">
        <button
          aria-label={`Decrease ${label}`}
          disabled={disabled || value <= -5}
          onClick={() => onChange(clamp(value - 1))}
        >
          <Minus size={12} />
        </button>
        <input
          aria-label={label}
          type="range"
          min="-5"
          max="5"
          step="1"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(+e.target.value)}
        />
        <button
          aria-label={`Increase ${label}`}
          disabled={disabled || value >= 5}
          onClick={() => onChange(clamp(value + 1))}
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="step-ticks">
        <span>−5</span>
        <span>0</span>
        <span>+5</span>
      </div>
      {unitText && <div className="control-note">{unitText}</div>}
    </div>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      className={`toggle-row ${checked ? "checked" : ""}`}
      onClick={onChange}
      role="switch"
      aria-checked={checked}
    >
      <span>{label}</span>
      <span className="switch">
        <i />
      </span>
    </button>
  );
}
function Metric({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong style={{ color: accent }}>
        {value}
        <small>{suffix}</small>
      </strong>
    </div>
  );
}
function App() {
  const [sceneBeamChoice, setSceneBeamChoice] = useState<BeamChoice>("both");
  const [config, setConfig] = useState<Configuration>(() =>
    createConfiguration(),
  );
  const configRef = useRef(config);
  configRef.current = config;
  const [mode, setMode] = useState<Mode>("experiment");
  const [selected, setSelected] = useState<ComponentId>("a1");
  const [view, setView] = useState<
    "combined" | "mechanical" | "rays" | "envelopes"
  >("combined");
  const [labels, setLabels] = useState(true);
  const [preset, setPreset] = useState<"perspective" | "top" | "trap">(
    "perspective",
  );
  const [cameraReset, setCameraReset] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [idealLens, setIdealLens] = useState(false);
  const [reference, setReference] = useState<Configuration | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [saved, setSaved] = useState<Configuration | null>(() => {
    try {
      return validateConfig(
        JSON.parse(localStorage.getItem("optical-bench-save") || "null"),
      );
    } catch {
      return null;
    }
  });
  const [notice, setNotice] = useState("");
  const [scenario, setScenario] = useState<Scenario>("irises");
  const [revealed, setRevealed] = useState(false);
  const [planeId, setPlaneId] = useState("trap");
  const [customPlanes, setCustomPlanes] = useState<Plane[]>([]);
  const [newPlaneZ, setNewPlaneZ] = useState(1);
  const [choice, setChoice] = useState<BeamChoice>("both");
  const [instrument, setInstrument] = useState<"profiler" | "camera">(
    "profiler",
  );
  const [autoFov, setAutoFov] = useState(true);
  const [manualFov, setManualFov] = useState(0.1);
  const [exposure, setExposure] = useState(1);
  const [noise, setNoise] = useState(false);
  const [particle, setParticle] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cameraAngle, setCameraAngle] = useState(0);
  const [cameraOffset, setCameraOffset] = useState(0);
  const [measuredIds, setMeasuredIds] = useState<string[]>([]);
  const [advice, setAdvice] = useState<AssistantAdvice | null>(null);
  const [adviceMessage, setAdviceMessage] = useState("");
  const [assistantTab, setAssistantTab] = useState<"guide" | "response">(
    "guide",
  );
  const [autoRunning, setAutoRunning] = useState(false);
  const stopAuto = useRef(false);
  const [tour, setTour] = useState<number | null>(null);
  const [showTopology, setShowTopology] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasSection = useRef<HTMLDivElement>(null);
  const lab = mode === "training",
    truthVisible = !lab || revealed;
  const sim = useMemo(() => simulate(config), [config]);
  const idealConfig = useMemo(() => createConfiguration(), []);
  const guideSim = useMemo(
    () => simulate({ ...config, hidden: idealConfig.hidden }),
    [config, idealConfig],
  );
  const refSim = useMemo(
    () => (reference ? simulate(reference) : null),
    [reference],
  );
  const planes = useMemo(
    () => [
      ...getPlanes(truthVisible ? sim : guideSim).filter(
        (p) => truthVisible || !p.id.startsWith("waist:"),
      ),
      ...customPlanes,
    ],
    [sim, guideSim, truthVisible, customPlanes],
  );
  const plane =
    planes.find((p) => p.id === planeId) ||
    planes.find((p) => p.id.includes("trap")) ||
    planes[0];
  const measurement = useMemo(() => measure(sim, plane), [sim, plane]);
  const trapMeasurement = useMemo(
    () =>
      measure(
        sim,
        getPlanes(guideSim).find((p) => p.id === "trap")!,
      ),
    [sim, guideSim],
  );
  const current =
    sim.components.find((c) => c.id === selected) || COMPONENTS[0];
  const adjustment = config.adjustments[selected];
  const fov = useMemo(() => {
    if (!autoFov) return manualFov;
    const valid = Object.values(measurement.spots).filter(
      (s) => s.valid && (choice === "both" || choice === s.beam),
    );
    return Math.max(
      0.015,
      ...valid.map(
        (s) => 2.6 * (Math.max(Math.abs(s.x), Math.abs(s.y)) + s.radius * 1.6),
      ),
    );
  }, [measurement, autoFov, manualFov, choice]);
  const measuredPlanes = planes.filter((p) => measuredIds.includes(p.id));
  const setAdjustment = (axis: keyof Adjustment, v: number) => {
    setAdvice(null);
    setConfig((c) => applyAdjustment(c, selected, axis, v));
  };
  const setSetting = (key: keyof Settings, v: number) =>
    setConfig((c) => ({ ...c, settings: { ...c.settings, [key]: v } }));
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3800);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    let active = true;
    fetch(new URL("default-setup.json", document.baseURI), {
      cache: "no-cache",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((raw) => {
        const loaded = validateConfig(raw?.configuration || raw);
        if (active && loaded) setConfig(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () => () => {
      stopAuto.current = true;
    },
    [],
  );
  useEffect(() => {
    setAdvice(null);
    setAdviceMessage("");
    stopAuto.current = true;
    setAutoRunning(false);
  }, [mode, scenario]);
  function ideal() {
    setMode("experiment");
    stopAuto.current = true;
    setAutoRunning(false);
    setConfig(createConfiguration());
    setRevealed(false);
    setAdvice(null);
    setMeasuredIds([]);
    setNotice("Ideal alignment restored");
  }
  function startScenario(s: Scenario = scenario) {
    stopAuto.current = true;
    setAutoRunning(false);
    setConfig(
      randomizeConfiguration(createConfiguration(), s, Date.now() % 1000000),
    );
    setMode("training");
    setScenario(s);
    setRevealed(false);
    setMeasuredIds([]);
    setAdvice(null);
    setAdviceMessage("");
    setShowReference(false);
    setNotice("New hidden imperfections generated. Begin with a measurement.");
  }
  function save() {
    setSaved(structuredClone(config));
    localStorage.setItem("optical-bench-save", JSON.stringify(config));
    setNotice("Configuration saved on this device");
  }
  function restore() {
    if (saved) {
      setConfig(structuredClone(saved));
      setAdvice(null);
      setNotice("Saved configuration restored");
    }
  }
  function exportConfig() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { format: "dual-beam-lab", version: 2, configuration: config },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "optical-bench.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function capture() {
    setMeasuredIds((ids) =>
      ids.includes(plane.id) ? ids : [...ids, plane.id],
    );
    setNotice(`${plane.name} added to the measurement set`);
  }
  function hint() {
    const available = measuredPlanes.length ? measuredPlanes : [plane];
    const result = suggestAdjustment(
      config,
      available,
      scenario === "crossing" ? "coaxial" : lab ? scenario : "coaxial",
      scenario === "irises" && lab ? "A" : undefined,
    );
    setAdvice(result);
    setAdviceMessage(
      result
        ? ""
        : "No improving discrete adjustment found. Try a second separated plane or smaller step size.",
    );
  }
  function applyAdvice(a = advice) {
    if (!a) return;
    setSelected(a.component);
    setConfig((c) =>
      applyAdjustment(
        c,
        a.component,
        a.axis,
        clamp(c.adjustments[a.component][a.axis] + a.step),
      ),
    );
    setAdvice(null);
    setNotice(
      `${a.component.toUpperCase()} ${axesLabel[a.axis]} ${a.step > 0 ? "+" : ""}${a.step} step`,
    );
  }
  async function autoAlign() {
    if (autoRunning) {
      stopAuto.current = true;
      setAutoRunning(false);
      return;
    }
    stopAuto.current = false;
    setAutoRunning(true);
    const available = measuredPlanes.length ? measuredPlanes : [plane];
    let moved = 0;
    for (let i = 0; i < 30 && !stopAuto.current; i++) {
      const a = suggestAdjustment(
        configRef.current,
        available,
        scenario === "crossing" ? "coaxial" : lab ? scenario : "coaxial",
        scenario === "irises" && lab ? "A" : undefined,
      );
      setAdvice(a);
      if (!a || a.underdetermined || !(a.scoreAfter < a.scoreBefore - 1e-12))
        break;
      setSelected(a.component);
      setConfig((c) =>
        applyAdjustment(
          c,
          a.component,
          a.axis,
          clamp(c.adjustments[a.component][a.axis] + a.step),
        ),
      );
      moved++;
      await new Promise((r) => setTimeout(r, 450));
    }
    setAutoRunning(false);
    setNotice(
      moved
        ? `Demonstration finished after ${moved} measured adjustment${moved > 1 ? "s" : ""}`
        : "Add independent observation planes before automatic alignment.",
    );
  }
  const effectiveNa = config.settings.beamRadius / config.settings.focalLength;
  const eligibleAxes: (keyof Adjustment)[] =
    current.kind === "lens"
      ? idealLens && !lab
        ? ["z", "x", "y", "pitch", "yaw"]
        : ["z"]
      : current.kind === "camera"
        ? ["pitch", "yaw", "x", "y", "z"]
        : ["mirror", "pbs", "laser", "window"].includes(current.kind)
          ? current.kind === "pbs" && !lab
            ? ["pitch", "yaw", "roll"]
            : ["pitch", "yaw"]
          : current.kind === "iris"
            ? ["x", "y"]
            : [];
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <Aperture size={26} />
          </span>
          <span>
            optical<span className="brand-light">bench</span>
            <small>DUAL-BEAM ALIGNMENT LAB</small>
          </span>
        </a>
        <nav className="main-tabs" aria-label="Workspace">
          <button
            className={mode === "experiment" ? "active" : ""}
            onClick={() => setMode("experiment")}
          >
            <Move3D size={15} />
            Experiment
          </button>
          <button
            className={mode === "training" ? "active" : ""}
            onClick={() => {
              if (mode !== "training") startScenario();
            }}
          >
            <Target size={15} />
            Real Lab
          </button>
          <button
            className={mode === "wave" ? "active" : ""}
            onClick={() => setMode("wave")}
          >
            <Waves size={16} />
            Wave optics<span className="tiny-tag">C</span>
          </button>
        </nav>
        <div className="header-actions">
          <span className="local-status">
            <i />
            LOCAL ENGINE
          </span>
          <button
            className="icon-button"
            aria-label="Open onboarding walkthrough"
            title="Walkthrough"
            onClick={() => setTour(0)}
          >
            <CircleHelp size={18} />
          </button>
          <button className="button subtle" onClick={save}>
            <Save size={14} />
            Save setup
          </button>
        </div>
      </header>
      <div className="workspace-bar">
        <div>
          <span className="eyebrow">WORKSPACE 01</span>
          <h1>
            Counter-propagating optical tweezer <span>1064 nm</span>
          </h1>
        </div>
        <div className="workspace-actions">
          <button
            className="text-button"
            onClick={() => {
              setReference(structuredClone(config));
              setShowReference(true);
              setNotice(
                "Before state captured. Adjust a component to compare.",
              );
            }}
            disabled={!truthVisible}
          >
            <Layers size={14} />
            Capture baseline
          </button>
          <button className="text-button" onClick={ideal}>
            <RotateCcw size={14} />
            Reset ideal
          </button>
          <button
            className={`icon-button ${advanced ? "active" : ""}`}
            title="Advanced settings"
            aria-label="Advanced settings"
            onClick={() => setAdvanced(!advanced)}
          >
            <Settings2 size={17} />
          </button>
        </div>
      </div>
      <main className={`lab-layout ${collapsed ? "controls-collapsed" : ""}`}>
        <aside className="control-panel panel">
          <div className="panel-heading">
            <span>
              <SlidersHorizontal size={15} />
              {!collapsed && "Components"}
            </span>
            <button
              className="icon-button"
              title="Toggle controls"
              aria-label="Toggle component panel"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen size={15} />
              ) : (
                <PanelLeftClose size={15} />
              )}
            </button>
          </div>
          {!collapsed && (
            <>
              <div className="component-list">
                {[
                  { label: "SOURCE & ROUTING", ids: ["laser", "hwp", "pbs"] },
                  {
                    label: "ARM A",
                    ids: ["a1", "a2", "la", "wa"],
                    color: colors.A,
                  },
                  {
                    label: "ARM B",
                    ids: ["b1", "b2", "lb", "wb"],
                    color: colors.B,
                  },
                  {
                    label: "INSTRUMENTS",
                    ids: ["iris1", "iris2", "camera", "detector"],
                  },
                ].map((group) => (
                  <div key={group.label} className="component-group">
                    <div className="group-label">
                      {group.color && <i style={{ background: group.color }} />}
                      {group.label}
                    </div>
                    {group.ids.map((id) => {
                      const c = COMPONENTS.find((c) => c.id === id);
                      if (!c) return null;
                      const Icon = KIND_ICON[c.kind] || Box;
                      return (
                        <button
                          key={id}
                          className={`component-row ${selected === id ? "selected" : ""}`}
                          onClick={() => {
                            setSelected(id as ComponentId);
                            if (c.kind === "camera") setInstrument("camera");
                            if (c.kind === "detector")
                              setInstrument("profiler");
                          }}
                        >
                          <Icon size={14} />
                          <span>{c.name}</span>
                          <span className="component-code">{c.short}</span>
                          {selected === id && <ChevronRight size={12} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="selected-controls">
                <div className="selected-title">
                  <div>
                    <span className="eyebrow">SELECTED COMPONENT</span>
                    <h2>{current.name}</h2>
                  </div>
                  <button
                    className="icon-button"
                    title="Reset selected component"
                    aria-label="Reset selected component"
                    onClick={() =>
                      setConfig((c) => resetComponent(c, selected))
                    }
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <p>{current.description}</p>
                {eligibleAxes.map((axis) => (
                  <StepSlider
                    key={axis}
                    label={
                      current.kind === "camera" &&
                      ["x", "y", "z"].includes(axis)
                        ? `Position ${axis.toUpperCase()}`
                        : axesLabel[axis]
                    }
                    value={adjustment[axis]}
                    onChange={(v) => setAdjustment(axis, v)}
                    disabled={lab && current.kind === "window"}
                    unitText={
                      axis === "z"
                        ? `1 step = ${config.settings.lensStepMm} mm along the lens axis`
                        : undefined
                    }
                  />
                ))}
                {current.kind === "lens" && (
                  <>
                    <div className="control-info">
                      <span className="dot teal" />
                      {lab
                        ? "Real hardware: axial translation only"
                        : "LA1540-C · equivalent thin lens"}
                    </div>
                    {!lab && (
                      <Toggle
                        checked={idealLens}
                        onChange={() => setIdealLens(!idealLens)}
                        label="Ideal investigation controls"
                      />
                    )}
                  </>
                )}
                {current.kind === "hwp" && (
                  <div className="field">
                    <label>
                      Half-wave plate angle{" "}
                      <b>{fmt(config.settings.hwpDegrees, 1)}°</b>
                    </label>
                    <input
                      aria-label="Half-wave plate angle"
                      type="range"
                      min="0"
                      max="45"
                      step=".5"
                      value={config.settings.hwpDegrees}
                      onChange={(e) =>
                        setSetting("hwpDegrees", +e.target.value)
                      }
                    />
                    <p>
                      Rotates input linear polarization. At 22.5°, the PBS
                      splits power equally.
                    </p>
                  </div>
                )}
                {current.kind === "laser" && (
                  <div className="number-grid">
                    <label>
                      Wavelength · nm
                      <input
                        type="number"
                        min="400"
                        max="1700"
                        value={config.settings.wavelengthNm}
                        onChange={(e) =>
                          setSetting(
                            "wavelengthNm",
                            clamp(+e.target.value, 400, 1700),
                          )
                        }
                      />
                    </label>
                    <label>
                      Power · W
                      <input
                        type="number"
                        min=".001"
                        max="100"
                        step=".05"
                        value={config.settings.power}
                        onChange={(e) =>
                          setSetting(
                            "power",
                            clamp(+e.target.value, 0.001, 100),
                          )
                        }
                      />
                    </label>
                  </div>
                )}
                {current.kind === "iris" && (
                  <div className="field">
                    <label>Aperture radius · mm</label>
                    <input
                      type="number"
                      min=".01"
                      max="10"
                      step=".05"
                      value={config.settings.irisRadius}
                      onChange={(e) =>
                        setSetting(
                          "irisRadius",
                          clamp(+e.target.value, 0.01, 10),
                        )
                      }
                    />
                    <p>
                      Instrument centering is evaluated at the iris plane. Beam
                      clipping is calculated in wave mode.
                    </p>
                  </div>
                )}
                {current.kind === "pbs" && (
                  <div className="control-info wrap">
                    One cube · two encounters per beam.
                    <br />
                    Reflected port bends; transmitted port shifts through a
                    finite glass slab.
                  </div>
                )}
                {current.kind === "camera" && (
                  <div className="control-info wrap">
                    Position and pointing project the trap particle onto the
                    sensor. Zoom, exposure and noise are in the measurement
                    panel. Side-view imaging requires the test particle.
                  </div>
                )}
                {current.kind === "detector" && (
                  <div className="control-info wrap">
                    Move the detector by choosing or adding an observation plane
                    in the measurement panel.
                  </div>
                )}
                {lab && (
                  <div className="lab-lock">
                    <EyeOff size={13} />
                    Mount errors are hidden. Sliders show only your applied
                    corrections.
                  </div>
                )}
              </div>
              <button
                className="topology-link"
                onClick={() => setShowTopology(true)}
              >
                <GitBranch size={14} />
                View & edit optical topology
                <ArrowRight size={13} />
              </button>
            </>
          )}
        </aside>
        <section className="center-column">
          {lab && (
            <div className="training-strip">
              <Target size={19} />
              <div>
                <span className="eyebrow">REAL LAB · HIDDEN IMPERFECTIONS</span>
                <select
                  aria-label="Training scenario"
                  value={scenario}
                  onChange={(e) => startScenario(e.target.value as Scenario)}
                >
                  {Object.entries(scenarioCopy).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="text-button" onClick={() => startScenario()}>
                <RefreshCw size={13} />
                New challenge
              </button>
              <button
                className="icon-button"
                title="Reveal true alignment and end challenge"
                aria-label="Reveal solution"
                onClick={() => setRevealed(!revealed)}
              >
                {revealed ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          )}
          <div className="scene-panel panel" ref={canvasSection}>
            <div className="scene-toolbar">
              <div className="scene-tabs">
                {(["combined", "mechanical", "rays", "envelopes"] as const).map(
                  (v) => (
                    <button
                      key={v}
                      className={view === v ? "active" : ""}
                      onClick={() => setView(v)}
                    >
                      {v === "combined" ? (
                        <Layers size={13} />
                      ) : v === "mechanical" ? (
                        <Box size={13} />
                      ) : v === "rays" ? (
                        <Zap size={13} />
                      ) : (
                        <Waves size={13} />
                      )}
                      <span>
                        {v === "envelopes"
                          ? "Gaussian"
                          : v.charAt(0).toUpperCase() + v.slice(1)}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <button
                className="icon-button"
                title="Expand optical bench"
                aria-label="Expand optical bench"
                onClick={() => {
                  if (!document.fullscreenElement)
                    canvasSection.current?.requestFullscreen();
                  else document.exitFullscreen();
                }}
              >
                <Maximize2 size={15} />
              </button>
            </div>
            <div className="scene-wrap">
              <ErrorBoundary>
                <OpticalScene
                  simulation={truthVisible ? sim : guideSim}
                  selected={selected}
                  onSelect={(id) => {
                    setSelected(id);
                    if (id === "camera") setInstrument("camera");
                    if (id === "detector") setInstrument("profiler");
                  }}
                  view={view}
                  reference={truthVisible && showReference ? refSim : null}
                  showLabels={labels}
                  revealActual={truthVisible}
                  cameraPreset={preset}
                  cameraReset={cameraReset}
                  particle={particle}
                  wavelengthNm={config.settings.wavelengthNm}
                  visibleBeams={sceneBeamChoice}
                />
              </ErrorBoundary>
              <div className="scene-top-left">
                <span className="scene-badge">
                  <i />
                  MODE B <b>GEOMETRIC + GAUSSIAN</b>
                </span>
                {lab && !revealed && (
                  <span className="scene-hint">
                    Nominal layout · actual paths hidden
                  </span>
                )}
                {revealed && lab && (
                  <span className="scene-hint">
                    Solution revealed · challenge ended
                  </span>
                )}
              </div>
              <div className="scene-top-right">
                {(["A", "B"] as const).map((b) => (
                  <button
                    key={b}
                    title={
                      sceneBeamChoice === b
                        ? "Show both beams"
                        : `Isolate beam ${b}`
                    }
                    aria-label={`Toggle scene beam ${b}`}
                    aria-pressed={
                      sceneBeamChoice === "both" || sceneBeamChoice === b
                    }
                    onClick={() =>
                      setSceneBeamChoice((old) => (old === b ? "both" : b))
                    }
                  >
                    <i style={{ background: colors[b] }} />
                    {b} · {b === "A" ? "s" : "p"}-polarized
                  </button>
                ))}
              </div>
              <div className="camera-presets">
                {(["perspective", "top", "trap"] as const).map((p) => (
                  <button
                    className={preset === p ? "active" : ""}
                    key={p}
                    onClick={() => setPreset(p)}
                  >
                    {p === "perspective" ? (
                      <Box size={14} />
                    ) : p === "top" ? (
                      <Grip size={14} />
                    ) : (
                      <Focus size={14} />
                    )}
                    <span>
                      {p === "perspective"
                        ? "3D"
                        : p === "top"
                          ? "Top"
                          : "Trap"}
                    </span>
                  </button>
                ))}
                <button
                  title="Reset view to the selected main axes"
                  aria-label="Reset camera view"
                  onClick={() => setCameraReset((value) => value + 1)}
                >
                  <RefreshCw size={14} />
                  <span>Reset</span>
                </button>
              </div>
              <div className="scene-bottom">
                <span>
                  <Move3D size={12} />
                  Drag to orbit <i>·</i> Scroll to zoom <i>·</i> Right-drag to
                  pan
                </span>
                <span>mm · optics enlarged; envelope floor 0.14 mm</span>
              </div>
            </div>
            <div className="scene-footer">
              <label>
                <input
                  type="checkbox"
                  checked={labels}
                  onChange={() => setLabels(!labels)}
                />
                Component labels
              </label>
              <label className={!reference || !truthVisible ? "muted" : ""}>
                <input
                  type="checkbox"
                  checked={showReference && !!reference && truthVisible}
                  disabled={!reference || !truthVisible}
                  onChange={() => setShowReference(!showReference)}
                />
                Before / after overlay
              </label>
              <span className="fps-badge">
                <i />
                Browser calculations
              </span>
            </div>
          </div>
          <div className="metrics-strip panel">
            {truthVisible ? (
              <>
                <Metric
                  label="SPATIAL OVERLAP AT TRAP"
                  value={fmt(sim.overlap * 100, 1)}
                  suffix="%"
                  accent="#65dfc0"
                />
                <Metric
                  label="TRANSVERSE SEPARATION"
                  value={unit(sim.separation)}
                />
                <Metric
                  label="AXIS MISMATCH"
                  value={fmt(sim.angleMrad, 3)}
                  suffix="mrad"
                />
                <Metric
                  label="WAIST AXIAL SEPARATION"
                  value={unit(Math.abs(sim.axialSeparation))}
                />
              </>
            ) : (
              <>
                <Metric
                  label="SELECTED PLANE SEPARATION"
                  value={unit(measurement.separation)}
                />
                <Metric
                  label="CAPTURED PLANES"
                  value={String(measuredIds.length)}
                />
                <Metric
                  label="OBSERVATION"
                  value={
                    instrument === "camera" ? "Side view" : "Direct profile"
                  }
                />
                <Metric
                  label="MOUNT IMPERFECTIONS"
                  value="Unknown"
                  accent="#e9bd74"
                />
              </>
            )}
          </div>
          {mode === "wave" ? (
            <div className="panel wave-container">
              <WavePanel simulation={sim} settings={config.settings} />
            </div>
          ) : (
            <div className="assistant-panel panel">
              <div className="assistant-heading">
                <div className="assistant-tabs">
                  <button
                    className={assistantTab === "guide" ? "active" : ""}
                    onClick={() => setAssistantTab("guide")}
                  >
                    <Sparkles size={15} />
                    Alignment assistant
                  </button>
                  <button
                    className={assistantTab === "response" ? "active" : ""}
                    disabled={!truthVisible}
                    onClick={() => setAssistantTab("response")}
                  >
                    <GitBranch size={15} />
                    Response matrix
                  </button>
                </div>
                <span className="quiet-badge">DETERMINISTIC · LOCAL</span>
              </div>
              {assistantTab === "response" && truthVisible ? (
                <ResponseMatrix
                  config={config}
                  selected={selected}
                  simulation={sim}
                />
              ) : (
                <div className="assistant-content">
                  <div className="assistant-copy">
                    <span className="assistant-symbol">
                      <Crosshair size={21} />
                    </span>
                    <div>
                      <h3>
                        {advice
                          ? `${COMPONENTS.find((c) => c.id === advice.component)?.name || advice.component} · ${axesLabel[advice.axis]}`
                          : lab
                            ? scenarioCopy[scenario].description
                            : "Two planes tell the whole story."}
                      </h3>
                      <p>
                        {advice
                          ? advice.explanation
                          : adviceMessage ||
                            "Measure at two separated stations to distinguish a shifted beam from a tilted one. Capture the planes at the right, then estimate the next adjustment."}
                      </p>
                      {advice?.underdetermined && (
                        <div className="warning-inline">
                          Measurement set is underdetermined. Add an independent
                          plane.
                        </div>
                      )}
                      {advice && (
                        <div className="suggestion-effect">
                          {advice.effect} · response rank {advice.rank}
                        </div>
                      )}
                      <div className="measurement-chips">
                        {measuredIds.length ? (
                          measuredPlanes.map((p) => (
                            <button
                              key={p.id}
                              onClick={() =>
                                setMeasuredIds((ids) =>
                                  ids.filter((id) => id !== p.id),
                                )
                              }
                            >
                              <Check size={11} />
                              {p.name}
                              <X size={10} />
                            </button>
                          ))
                        ) : (
                          <span>No planes captured yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="assistant-actions">
                    <button className="button" onClick={hint}>
                      <Sparkles size={14} />
                      Hint only
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        !advice || advice.underdetermined || advice.step === 0
                      }
                      onClick={() => applyAdvice()}
                    >
                      <ArrowRight size={14} />
                      Apply next adjustment
                    </button>
                    <button className="text-button" onClick={autoAlign}>
                      {autoRunning ? <Square size={13} /> : <Play size={13} />}{" "}
                      {autoRunning
                        ? "Stop demonstration"
                        : "Auto demonstration"}
                    </button>
                  </div>
                  <div className="assistant-footnote">
                    Hints probe the selected measurement planes with finite
                    differences. The assistant does not read hidden offsets to
                    choose corrections.
                  </div>
                </div>
              )}
            </div>
          )}
          {sim.warnings.length > 0 && truthVisible && (
            <details className="model-notes">
              <summary>
                {sim.warnings.length} optical model note
                {sim.warnings.length > 1 ? "s" : ""}
                <ChevronDown size={12} />
              </summary>
              {[...new Set(sim.warnings)].map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </details>
          )}
        </section>
        <aside className="measurement-panel panel">
          <div className="panel-heading">
            <span>
              <ScanLine size={16} />
              Measurements
            </span>
            <span className="live-label">
              <i />
              LIVE
            </span>
          </div>
          <div className="instrument-tabs">
            <button
              className={instrument === "profiler" ? "active" : ""}
              onClick={() => setInstrument("profiler")}
            >
              <ScanLine size={13} />
              Beam profiler
            </button>
            <button
              className={instrument === "camera" ? "active" : ""}
              onClick={() => setInstrument("camera")}
            >
              <Camera size={13} />
              Camera
            </button>
          </div>
          <div className="measurement-body">
            <label className="field-label" htmlFor="observation">
              OBSERVATION PLANE
            </label>
            <select
              id="observation"
              disabled={instrument === "camera"}
              value={instrument === "camera" ? "trap" : plane.id}
              onChange={(e) => {
                setPlaneId(e.target.value);
                setAdvice(null);
              }}
            >
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="beam-choice">
              {(["A", "B", "both"] as const).map((b) => (
                <button
                  key={b}
                  className={choice === b ? "active" : ""}
                  onClick={() => setChoice(b)}
                >
                  {b !== "both" && <i style={{ background: colors[b] }} />}
                  {b === "both" ? "Combined" : `Beam ${b}`}
                </button>
              ))}
            </div>
            <div className="profiler-frame">
              <Profiler
                measurement={
                  instrument === "camera" ? trapMeasurement : measurement
                }
                choice={choice}
                fov={instrument === "camera" ? 0.1 : fov}
                referenceRadius={
                  (config.settings.m2 *
                    config.settings.wavelengthNm *
                    1e-6 *
                    config.settings.focalLength) /
                  (Math.PI * config.settings.beamRadius)
                }
                referencePower={config.settings.power / 2}
                cameraPosition={
                  sim.components.find((c) => c.id === "camera")!.position
                }
                cameraDirection={
                  sim.components.find((c) => c.id === "camera")!.normal
                }
                exposure={exposure}
                noise={noise}
                side={instrument === "camera"}
                particle={particle}
                zoom={instrument === "camera" ? zoom : 1}
                viewAngle={cameraAngle}
                cameraOffset={cameraOffset}
              />
              <span className="image-corner">
                {instrument === "profiler" ? "I(u, v)" : "SIDE SCATTER"}
              </span>
              <span className="image-scale">
                {unit(
                  (instrument === "camera" ? 0.1 : fov) /
                    (instrument === "camera" ? zoom : 1),
                )}{" "}
                field
              </span>
              {instrument === "camera" && !particle && (
                <div className="empty-vacuum">
                  <Camera size={22} />
                  <span>Empty vacuum</span>
                  <small>Enable a test particle to see scattering.</small>
                </div>
              )}
            </div>
            {instrument === "profiler" ? (
              <>
                <div className="profiles">
                  <ProfilePlot
                    measurement={measurement}
                    choice={choice}
                    fov={fov}
                    axis="x"
                  />
                  <ProfilePlot
                    measurement={measurement}
                    choice={choice}
                    fov={fov}
                    axis="y"
                  />
                </div>
                <div className="readout-table">
                  <div className="readout-head">
                    <span>AT THIS PLANE</span>
                    <b style={{ color: colors.A }}>A</b>
                    <b style={{ color: colors.B }}>B</b>
                  </div>
                  {[
                    ["Centroid u", (s: any) => `${signed(s.x * 1000)} µm`],
                    ["Centroid v", (s: any) => `${signed(s.y * 1000)} µm`],
                    ["1/e² radius", (s: any) => unit(s.radius)],
                    ["Power", (s: any) => `${fmt(s.power * 1000, 1)} mW`],
                  ].map(([label, render]) => (
                    <div key={label as string}>
                      <span>{label as string}</span>
                      {(["A", "B"] as const).map((b) => (
                        <b key={b}>
                          {measurement.spots[b].valid
                            ? (render as Function)(measurement.spots[b])
                            : "—"}
                        </b>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="plane-overlap">
                  <span>Intensity-profile overlap</span>
                  <strong>
                    {fmt(measurement.overlap * 100, 1)}
                    <small>%</small>
                  </strong>
                </div>
                <Toggle
                  checked={autoFov}
                  onChange={() => setAutoFov(!autoFov)}
                  label="Auto field of view"
                />
                {!autoFov && (
                  <div className="field">
                    <label>Field width · mm</label>
                    <input
                      aria-label="Field width"
                      type="number"
                      min=".001"
                      max="100"
                      step=".01"
                      value={manualFov}
                      onChange={(e) =>
                        setManualFov(clamp(+e.target.value, 0.001, 100))
                      }
                    />
                  </div>
                )}
                <button className="button capture-button" onClick={capture}>
                  <Plus size={14} />
                  {measuredIds.includes(plane.id)
                    ? "Plane captured"
                    : "Capture this plane"}
                </button>
                <MeasuredDiagnostics simulation={sim} planes={measuredPlanes} />
                <IrisReadout
                  measurement={measurement}
                  radius={config.settings.irisRadius}
                  active={plane.name.toLowerCase().includes("iris")}
                />
                <p className="instrument-note">
                  Direct detection · orthogonal intensities add.
                  <br />
                  Image gain is normalized; no artificial interference.
                </p>
              </>
            ) : (
              <>
                <Toggle
                  checked={particle}
                  onChange={() => setParticle(!particle)}
                  label="Test particle at trap"
                />
                <Toggle
                  checked={noise}
                  onChange={() => setNoise(!noise)}
                  label="Sensor noise"
                />
                {[
                  {
                    name: "Exposure",
                    v: exposure,
                    set: setExposure,
                    min: 0.1,
                    max: 4,
                    step: 0.1,
                  },
                  {
                    name: "Zoom",
                    v: zoom,
                    set: setZoom,
                    min: 0.5,
                    max: 4,
                    step: 0.1,
                  },
                  {
                    name: "View roll · degrees",
                    v: cameraAngle,
                    set: setCameraAngle,
                    min: -180,
                    max: 180,
                    step: 5,
                  },
                  {
                    name: "Camera offset · mm",
                    v: cameraOffset,
                    set: setCameraOffset,
                    min: -0.1,
                    max: 0.1,
                    step: 0.001,
                  },
                ].map((c) => (
                  <div className="field" key={c.name}>
                    <label>
                      {c.name}
                      <b>{fmt(c.v, c.step < 0.01 ? 3 : 1)}</b>
                    </label>
                    <input
                      aria-label={c.name}
                      type="range"
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      value={c.v}
                      onChange={(e) => c.set(+e.target.value)}
                    />
                  </div>
                ))}
                <p className="instrument-note">
                  Illustrative point-particle camera with a fixed-gain
                  point-spread function and perspective projection. Signal comes
                  only from an optional particle at the trap, not from light
                  propagating in empty vacuum.
                </p>
              </>
            )}
            <details className="add-plane">
              <summary>
                <Plus size={12} />
                Custom observation plane
              </summary>
              <label>
                Position along trap axis · mm
                <input
                  type="number"
                  value={newPlaneZ}
                  min="-10"
                  max="10"
                  step=".1"
                  onChange={(e) =>
                    setNewPlaneZ(clamp(+e.target.value, -10, 10))
                  }
                />
              </label>
              <button
                className="button"
                onClick={() => {
                  const p: Plane = {
                    id: `custom-${Date.now()}`,
                    name: `Custom x = ${newPlaneZ} mm`,
                    point: [newPlaneZ, 0, 0],
                    normal: [1, 0, 0],
                    u: [0, 0, 1],
                    v: [0, 1, 0],
                    segmentHint: "trap",
                  };
                  setCustomPlanes((a) => [...a, p]);
                  setPlaneId(p.id);
                }}
              >
                Add plane
                <Plus size={12} />
              </button>
            </details>
            <div className="beam-summary">
              <div>
                <span className="eyebrow">SOURCE</span>
                <strong>
                  {config.settings.wavelengthNm} <small>nm</small>
                </strong>
              </div>
              <div>
                <span className="eyebrow">BEAM Ø</span>
                <strong>
                  {fmt(config.settings.beamRadius * 2, 1)} <small>mm</small>
                </strong>
              </div>
              <div>
                <span className="eyebrow">M²</span>
                <strong>{fmt(config.settings.m2, 1)}</strong>
              </div>
            </div>
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          <span className="dot teal" />
          All adjustments computed on your device
        </span>
        <span>
          Paraxial Gaussian model · scalar diffraction available in Mode C
          <button onClick={() => setShowTopology(true)}>
            Model & assumptions
            <ArrowRight size={11} />
          </button>
        </span>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <Check size={15} />
          {notice}
        </div>
      )}
      {advanced && (
        <div className="modal-backdrop" onClick={() => setAdvanced(false)}>
          <div
            className="modal advanced-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">CONFIGURATION</span>
                <h2>Advanced optical settings</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close advanced settings"
                onClick={() => setAdvanced(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-intro">
              Physical scales are in millimeters. Mirror and mount sliders
              remain discrete, relative adjustments.
            </p>
            <>
              {lab && !revealed && (
                <p className="warning-inline">
                  Calibration is fixed during this challenge. Switch to
                  Experiment to change physical settings.
                </p>
              )}
            </>
            <div className="settings-grid">
              {(
                [
                  {
                    key: "wavelengthNm",
                    label: "Wavelength",
                    unit: "nm",
                    min: 400,
                    max: 1700,
                    step: 1,
                  },
                  {
                    key: "beamRadius",
                    label: "Input 1/e² radius",
                    unit: "mm",
                    min: 0.2,
                    max: 5,
                    step: 0.1,
                  },
                  {
                    key: "m2",
                    label: "Beam quality M²",
                    unit: "",
                    min: 1,
                    max: 5,
                    step: 0.1,
                  },
                  {
                    key: "focalLength",
                    label: "Lens focal length",
                    unit: "mm",
                    min: 5,
                    max: 50,
                    step: 1,
                  },
                  {
                    key: "mirrorStepMrad",
                    label: "Angular increment",
                    unit: "mrad / step",
                    min: 0.001,
                    max: 2,
                    step: 0.01,
                  },
                  {
                    key: "lensStepMm",
                    label: "Lens axial increment",
                    unit: "mm / step",
                    min: 0.001,
                    max: 1,
                    step: 0.01,
                  },
                  {
                    key: "pbsIndex",
                    label: "PBS glass index",
                    unit: "",
                    min: 1,
                    max: 2,
                    step: 0.01,
                  },
                  {
                    key: "pbsSize",
                    label: "Cube thickness",
                    unit: "mm",
                    min: 1,
                    max: 25,
                    step: 1,
                  },
                  {
                    key: "power",
                    label: "Input power",
                    unit: "W",
                    min: 0.001,
                    max: 100,
                    step: 0.1,
                  },
                  {
                    key: "irisRadius",
                    label: "Iris radius",
                    unit: "mm",
                    min: 0.01,
                    max: 10,
                    step: 0.05,
                  },
                ] as {
                  key: keyof Settings;
                  label: string;
                  unit: string;
                  min: number;
                  max: number;
                  step: number;
                }[]
              ).map((s) => (
                <label key={s.key}>
                  {s.label}
                  <div className="input-unit">
                    <input
                      disabled={lab && !revealed}
                      type="number"
                      value={config.settings[s.key]}
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      onChange={(e) =>
                        setSetting(s.key, clamp(+e.target.value, s.min, s.max))
                      }
                    />
                    <span>{s.unit}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="model-callout">
              <Focus size={18} />
              <div>
                <b>Illuminated paraxial NA ≈ {fmt(effectiveNa, 3)}</b>
                <p>
                  Computed from beam radius / focal length. LA1540-C is
                  represented by a 15 mm equivalent thin lens; this is not a
                  catalog-accurate surface prescription. Tilt uses a first-order
                  oblique model.
                </p>
              </div>
            </div>
            <div className="config-actions">
              <button className="button" onClick={save}>
                <Save size={14} />
                Save
              </button>
              <button className="button" disabled={!saved} onClick={restore}>
                <RotateCcw size={14} />
                Restore
              </button>
              <button className="button" onClick={exportConfig}>
                <Download size={14} />
                Export JSON
              </button>
              <button
                className="button"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} />
                Import JSON
              </button>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const parsed = JSON.parse(await file.text());
                    const c = validateConfig(parsed.configuration || parsed);
                    if (!c) throw Error();
                    setConfig(c);
                    setNotice("Optical configuration imported");
                  } catch {
                    setNotice(
                      "Import failed: invalid or unsupported optical configuration",
                    );
                  }
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
      )}
      {showTopology && (
        <TopologyModal
          config={config}
          setConfig={setConfig}
          onClose={() => setShowTopology(false)}
          locked={lab && !revealed}
        />
      )}
      {tour !== null && (
        <div className="modal-backdrop">
          <div className="modal tour-modal">
            <div className="tour-graphic">
              {tour === 0 ? (
                <Aperture size={52} />
              ) : tour === 1 ? (
                <Crosshair size={52} />
              ) : tour === 2 ? (
                <Focus size={52} />
              ) : (
                <Target size={52} />
              )}
            </div>
            <span className="eyebrow">QUICK START · {tour + 1} / 4</span>
            <h2>
              {
                [
                  "A real optical alignment workflow",
                  "Walk a beam through two planes",
                  "Make the waists meet",
                  "Practice with unknown errors",
                ][tour]
              }
            </h2>
            <p>
              {
                [
                  "Select any mirror in the 3D bench or component list. Pitch and yaw use eleven relative positions. Watch the downstream beam change immediately. A is coral and B is teal.",
                  "Choose an observation plane, then capture it. Repeat at a separated plane. Use two steering mirrors to control position and angle independently. Coincidence at one point does not establish coaxiality.",
                  "Once the beams share an axis, compare profiles across several axial positions around the trap. Translate each lens along its local Z axis until the two waist locations coincide.",
                  "Real Lab generates hidden mechanical errors. Only realistic controls and virtual instruments are available. The assistant calibrates responses from your selected measurements. Start with the two-iris challenge.",
                ][tour]
              }
            </p>
            <div className="tour-progress">
              {[0, 1, 2, 3].map((i) => (
                <i className={i === tour ? "active" : ""} key={i} />
              ))}
            </div>
            <div className="modal-actions">
              <button className="text-button" onClick={() => setTour(null)}>
                Close walkthrough
              </button>
              <button
                className="button primary"
                onClick={() =>
                  tour === 3
                    ? (setTour(null), startScenario("irises"))
                    : setTour(tour + 1)
                }
              >
                {tour === 3 ? "Start training" : "Next"}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function IrisReadout({
  measurement,
  radius,
  active,
}: {
  measurement: ReturnType<typeof measure>;
  radius: number;
  active: boolean;
}) {
  if (!active) return null;
  return (
    <div className="iris-readout">
      <span className="eyebrow">IRIS · CENTROID CLEARANCE</span>
      {Object.values(measurement.spots).map((s) => (
        <div key={s.beam}>
          <b style={{ color: colors[s.beam] }}>Beam {s.beam}</b>
          <span>
            {!s.valid
              ? "No ray"
              : Math.hypot(s.x, s.y) < radius
                ? "Centroid inside"
                : "Centroid blocked"}
          </span>
          <small>{s.valid ? unit(radius - Math.hypot(s.x, s.y)) : "—"}</small>
        </div>
      ))}
      <p>Gaussian tails may clip even when the centroid passes.</p>
    </div>
  );
}
function ResponseMatrix({
  config,
  selected,
  simulation,
}: {
  config: Configuration;
  selected: ComponentId;
  simulation: Simulation;
}) {
  const component = simulation.components.find((c) => c.id === selected)!;
  const [axis, setAxis] = useState<keyof Adjustment>("yaw");
  const chosen = component.kind === "lens" ? "z" : axis;
  const coord = chosen === "pitch" ? 1 : 2;
  const coordName = coord === 1 ? "y" : "z";
  const diff = useMemo(() => {
    const next = simulate(
      applyAdjustment(
        config,
        selected,
        chosen,
        clamp(
          config.adjustments[selected][chosen] +
            (config.adjustments[selected][chosen] >= 5 ? -1 : 1),
        ),
      ),
    );
    const sign = config.adjustments[selected][chosen] >= 5 ? -1 : 1;
    return (["A", "B"] as const).map((id) => {
      const a = simulation.beams[id],
        b = next.beams[id];
      const atLens = (s: Simulation) =>
        s.beams[id].segments.find((t) => t.toId === (id === "A" ? "la" : "lb"))
          ?.to || [0, 0, 0];
      const nextPoint = (s: Simulation) => {
        const segs = s.beams[id].segments;
        const i = segs.findIndex((t) => t.fromId === selected);
        return i >= 0 ? segs[i].to : [0, 0, 0];
      };
      const p = atLens(simulation),
        q = atLens(next),
        r = nextPoint(simulation),
        t = nextPoint(next);
      return {
        id,
        values: [
          ((t[coord] - r[coord]) * 1000) / sign,
          ((b.direction[coord] - a.direction[coord]) * 1000) / sign,
          ((q[coord] - p[coord]) * 1000) / sign,
          ((b.waist[coord] - a.waist[coord]) * 1000) / sign,
          ((b.waist[0] - a.waist[0]) * 1000) / sign,
          ((b.returnPoint[coord] - a.returnPoint[coord]) * 1000) / sign,
        ],
      };
    });
  }, [config, selected, chosen, coord, simulation]);
  const rows = [
    `Next component · ${coordName} / µm`,
    `Beam angle · d${coordName} / mrad`,
    `At focusing lens · ${coordName} / µm`,
    `Waist transverse · ${coordName} / µm`,
    "Waist axial · x / µm",
    `Recombined · ${coordName} / µm`,
  ];
  return (
    <div className="response-content">
      <div className="response-top">
        <p>
          Response to <b>+1 step</b> on {component.name}
        </p>
        <select
          aria-label="Response adjustment axis"
          value={chosen}
          onChange={(e) => setAxis(e.target.value as keyof Adjustment)}
        >
          {(component.kind === "lens" ? ["z"] : ["yaw", "pitch"]).map((a) => (
            <option key={a} value={a}>
              {axesLabel[a as keyof Adjustment]}
            </option>
          ))}
        </select>
      </div>
      <div className="response-grid">
        <div className="response-grid-header">
          <span>OBSERVABLE</span>
          <b style={{ color: colors.A }}>BEAM A</b>
          <b style={{ color: colors.B }}>BEAM B</b>
        </div>
        {rows.map((r, i) => (
          <div key={r}>
            <span>{r}</span>
            {diff.map((b) => (
              <span
                key={b.id}
                className={`response-cell ${Math.abs(b.values[i]) < 1e-7 ? "neutral" : b.values[i] > 0 ? "positive" : "negative"}`}
              >
                <span
                  className="response-bar"
                  style={{
                    width: `${Math.min(50, Math.abs(b.values[i]) * 15)}%`,
                  }}
                />
                {Math.abs(b.values[i]) < 1e-7 ? "—" : signed(b.values[i], 3)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="instrument-note">
        Finite-difference sensitivity in world coordinates. Positive and
        negative cells show the measured response direction. Recompute after
        changing the optical geometry.
      </p>
    </div>
  );
}
function OrientationIllustration({
  normal,
  label,
}: {
  normal: Vec3;
  label: string;
}) {
  const project = ([x, y, z]: Vec3): [number, number] => [
    100 + x * 62 - z * 34,
    77 - y * 58 + z * 26,
  ];
  const end = project(normalize(normal));
  return (
    <div className="orientation-illustration">
      <div className="orientation-preview-heading">
        <span>LIVE ORIENTATION</span>
        <b>{label}</b>
      </div>
      <svg viewBox="0 0 200 145" role="img" aria-label={`${label} orientation`}>
        <defs>
          <marker
            id="orientation-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#69e0c2" />
          </marker>
        </defs>
        {(
          [
            { name: "X", vector: [1, 0, 0] as Vec3, color: "#ff8a65" },
            { name: "Y", vector: [0, 1, 0] as Vec3, color: "#79cf8c" },
            { name: "Z", vector: [0, 0, 1] as Vec3, color: "#78aef5" },
          ] as const
        ).map((axis) => {
          const p = project(axis.vector);
          return (
            <g key={axis.name}>
              <line
                x1="100"
                y1="77"
                x2={p[0]}
                y2={p[1]}
                stroke={axis.color}
                strokeWidth="1.4"
                opacity=".72"
              />
              <text x={p[0] + 4} y={p[1] + 3} fill={axis.color}>
                +{axis.name}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="77" r="4" fill="#d8e9ed" />
        <line
          x1="100"
          y1="77"
          x2={end[0]}
          y2={end[1]}
          stroke="#69e0c2"
          strokeWidth="4"
          markerEnd="url(#orientation-arrow)"
        />
        <circle cx={end[0]} cy={end[1]} r="7" fill="#69e0c229" />
        <text x="10" y="132" className="orientation-vector-text">
          n = [{normal.map((value) => value.toFixed(3)).join(", ")}]
        </text>
      </svg>
    </div>
  );
}

function TopologyModal({
  config,
  setConfig,
  onClose,
  locked,
}: {
  config: Configuration;
  setConfig: React.Dispatch<React.SetStateAction<Configuration>>;
  onClose: () => void;
  locked: boolean;
}) {
  const [id, setId] = useState<ComponentId>("a1");
  const [routes, setRoutes] = useState<Record<BeamId, string>>({
    A: (config.routes?.A || DEFAULT_ROUTES.A).join(", "),
    B: (config.routes?.B || DEFAULT_ROUTES.B).join(", "),
  });
  const [inputRoute, setInputRoute] = useState(
    (config.inputRoute || ["hwp"]).join(", "),
  );
  const [error, setError] = useState("");
  const c = COMPONENTS.find((c) => c.id === id)!;
  const position = config.geometry[id] || c.position;
  const orientation = config.orientations?.[id] || c.normal;
  const setOrientation = (next: Vec3) => {
    if (Math.hypot(...next) < 1e-8) return;
    setConfig((old) => ({
      ...old,
      orientations: {
        ...old.orientations,
        [id]: normalize(next),
      },
    }));
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal topology-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              ONE CUBE · TWO COUNTER-PROPAGATING PATHS
            </span>
            <h2>Optical path graph</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close topology"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="modal-intro">
          The editable input chain feeds one PBS. The two beams then travel in
          opposite directions through the folded loop and recombine at that same
          cube.
        </p>
        <div className="topology-source">
          <Zap size={16} />
          Laser <ArrowRight size={14} />
          {(config.inputRoute || ["hwp"]).map((x) => (
            <span key={x}>
              {COMPONENTS.find((c) => c.id === x)?.short || x}{" "}
              <ArrowRight size={14} />
            </span>
          ))}
          <b>Single PBS</b>
        </div>
        {(["A", "B"] as const).map((b) => (
          <div className="path-row" key={b}>
            <span style={{ color: colors[b] }}>ARM {b}</span>
            <div>
              {(config.routes?.[b] || DEFAULT_ROUTES[b]).map((x, i) => (
                <span key={`${x}-${i}`}>
                  <button
                    onClick={() => setId(x)}
                    className={id === x ? "active" : ""}
                  >
                    {COMPONENTS.find((c) => c.id === x)?.short || x}
                  </button>
                  <ArrowRight size={10} />
                </span>
              ))}
              <b>PBS ↗ detection</b>
            </div>
          </div>
        ))}
        <div className="model-callout">
          <GitBranch size={18} />
          <div>
            <b>Polarization-preserving recombination</b>
            <p>
              A is reflected at both coating encounters. B is transmitted at
              both. The editable input chain and loop geometry determine the
              physical ports; no second PBS or hidden polarization swap is
              introduced.
            </p>
          </div>
        </div>
        <div className="geometry-edit">
          <label>
            Component
            <select
              value={id}
              onChange={(e) => setId(e.target.value as ComponentId)}
            >
              {COMPONENTS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {(["X", "Y", "Z"] as const).map((axis, i) => (
            <label key={axis}>
              World {axis} · mm
              <input
                disabled={locked}
                type="number"
                step="1"
                min="-1000"
                max="1000"
                value={position[i]}
                onChange={(e) => {
                  const p = [...position] as Vec3;
                  p[i] = clamp(+e.target.value, -1000, 1000);
                  setConfig((old) => ({
                    ...old,
                    geometry: { ...old.geometry, [id]: p },
                  }));
                }}
              />
            </label>
          ))}
        </div>
        <div className="orientation-edit">
          <div className="orientation-heading">
            <div>
              <b>Nominal orientation</b>
              <p>
                This is the coarse installation angle, separate from the fine
                pitch/yaw mount controls. For mirrors it is the surface normal;
                for lenses and windows it is the optical axis.
              </p>
            </div>
            <button
              className="button"
              disabled={locked}
              onClick={() => setOrientation(c.normal)}
            >
              Reset component default
            </button>
          </div>
          <div className="orientation-workspace">
            <OrientationIllustration normal={orientation} label={c.short} />
            <div className="orientation-controls">
              <div className="orientation-values">
                {(["X", "Y", "Z"] as const).map((axis, i) => (
                  <label key={axis}>
                    Normal {axis}
                    <input
                      disabled={locked}
                      type="number"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={Number(orientation[i].toFixed(6))}
                      onChange={(e) => {
                        const next = [...orientation] as Vec3;
                        next[i] = clamp(+e.target.value, -1, 1);
                        setOrientation(next);
                      }}
                    />
                  </label>
                ))}
              </div>
              <span className="axis-control-label">ALIGN TO MAIN AXIS</span>
              <div className="axis-alignment-buttons">
                {(["X", "Y", "Z"] as const).flatMap((axis, index) =>
                  ([-1, 1] as const).map((direction) => {
                    const vector: Vec3 = [0, 0, 0];
                    vector[index] = direction;
                    return (
                      <button
                        className="button"
                        disabled={locked}
                        key={`${axis}-${direction}`}
                        onClick={() => setOrientation(vector)}
                      >
                        {direction > 0 ? "+" : "−"}
                        {axis}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          </div>
          <div className="coarse-rotation-buttons">
            {([0, 1, 2] as const).flatMap((axis) =>
              ([-1, 1] as const).map((direction) => {
                const axisName = ["X", "Y", "Z"][axis];
                const rotationAxis: Vec3 = [0, 0, 0];
                rotationAxis[axis] = 1;
                return (
                  <button
                    className="button"
                    disabled={locked}
                    key={`${axis}-${direction}`}
                    onClick={() =>
                      setOrientation(
                        rotate(
                          orientation,
                          rotationAxis,
                          direction * (Math.PI / 2),
                        ),
                      )
                    }
                  >
                    Rotate {axisName} {direction > 0 ? "+90°" : "−90°"}
                  </button>
                );
              }),
            )}
          </div>
        </div>
        <details className="route-edit">
          <summary>Edit component traversal</summary>
          <p>
            The input route runs from the laser to the first PBS encounter. Beam
            routes lie between the first and second PBS encounters. Invalid
            paths or incompatible coarse orientations may miss surfaces.
          </p>
          <label>
            Input
            <input
              disabled={locked}
              value={inputRoute}
              onChange={(e) => setInputRoute(e.target.value)}
            />
          </label>
          {(["A", "B"] as const).map((b) => (
            <label key={b}>
              Beam {b}
              <input
                disabled={locked}
                value={routes[b]}
                onChange={(e) =>
                  setRoutes((s) => ({ ...s, [b]: e.target.value }))
                }
              />
            </label>
          ))}
          <button
            className="button"
            disabled={locked}
            onClick={() => {
              const nextInput = inputRoute
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
              const next = {
                A: routes.A.split(",").map((x) => x.trim()),
                B: routes.B.split(",").map((x) => x.trim()),
              };
              if (
                nextInput.length < 1 ||
                nextInput.length > 20 ||
                nextInput.some(
                  (x) =>
                    !COMPONENTS.some((c) => c.id === x) ||
                    !["mirror", "iris", "hwp"].includes(
                      COMPONENTS.find((c) => c.id === x)!.kind,
                    ),
                ) ||
                Object.values(next).some(
                  (r) =>
                    r.length < 2 ||
                    r.length > 20 ||
                    r.some(
                      (x) =>
                        !COMPONENTS.some((c) => c.id === x) ||
                        ["pbs", "camera", "detector", "laser", "hwp"].includes(
                          x,
                        ),
                    ),
                )
              ) {
                setError(
                  "Use valid input and loop component IDs; the PBS is added automatically.",
                );
                return;
              }
              setError("");
              setConfig((c) => ({
                ...c,
                inputRoute: nextInput as ComponentId[],
                routes: next as Record<BeamId, ComponentId[]>,
              }));
            }}
          >
            Apply paths
          </button>
          {error && <p className="error-text">{error}</p>}
        </details>
        {locked && (
          <p className="warning-inline">
            Geometry is fixed during Real Lab challenges. Switch to Experiment
            to edit it.
          </p>
        )}
        <div className="assumptions">
          <b>Model scope</b>
          <p>
            3D chief rays use surface intersections and reflection. Gaussian q
            propagation uses equivalent thin lenses and a first-order oblique
            approximation. Cube and window transmission include slab refraction.
            Finite apertures use an approximate encircled-power clipping
            estimate; ray mode does not calculate aperture diffraction. Mode C
            propagates a scalar focal field, not a full vector electromagnetic
            solution.
          </p>
          <p>
            The virtual camera is an illustrative scattering instrument. No
            bright beam is rendered in an empty-vacuum camera image. Scene beam
            envelopes are visualization aids.
          </p>
          <a
            href="https://punchout.thorlabs.com/newgrouppage9.cfm?objectgroup_id=3281&pn=LA1908-C"
            target="_blank"
            rel="noreferrer"
          >
            Thorlabs LA1540-C specification ↗
          </a>
        </div>
      </div>
    </div>
  );
}
function validateConfig(raw: unknown): Configuration | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Configuration;
  const base = createConfiguration();
  if (!r.adjustments || !r.hidden || !r.settings || !r.geometry) return null;
  for (const collection of [r.adjustments, r.hidden])
    for (const id of Object.keys(base.adjustments) as ComponentId[])
      for (const axis of ["pitch", "yaw", "z", "x", "y", "roll"] as const)
        if (
          !Number.isFinite(collection[id]?.[axis]) ||
          Math.abs(collection[id][axis]) > 1000
        )
          return null;
  for (const key of Object.keys(base.settings) as (keyof Settings)[])
    if (!Number.isFinite(r.settings[key])) return null;
  if (
    r.settings.wavelengthNm <= 0 ||
    r.settings.beamRadius <= 0 ||
    r.settings.focalLength <= 0 ||
    r.settings.m2 < 1 ||
    r.settings.power <= 0 ||
    r.settings.pbsIndex < 1 ||
    r.settings.pbsSize <= 0 ||
    r.settings.mirrorStepMrad <= 0 ||
    r.settings.lensStepMm <= 0 ||
    r.settings.irisRadius <= 0
  )
    return null;
  for (const p of Object.values(r.geometry))
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      p.some((v) => !Number.isFinite(v) || Math.abs(v) > 10000)
    )
      return null;
  if (r.orientations)
    for (const normal of Object.values(r.orientations))
      if (
        !Array.isArray(normal) ||
        normal.length !== 3 ||
        normal.some((v) => !Number.isFinite(v) || Math.abs(v) > 1) ||
        Math.hypot(...normal) < 1e-8
      )
        return null;
  if (r.routes)
    for (const route of Object.values(r.routes))
      if (
        !Array.isArray(route) ||
        route.length < 2 ||
        route.length > 20 ||
        route.some((id) => !base.adjustments[id as ComponentId])
      )
        return null;
  if (
    r.inputRoute &&
    (!Array.isArray(r.inputRoute) ||
      r.inputRoute.length < 1 ||
      r.inputRoute.length > 20 ||
      r.inputRoute.some((id) => !base.adjustments[id as ComponentId]))
  )
    return null;
  return r;
}
export default App;
