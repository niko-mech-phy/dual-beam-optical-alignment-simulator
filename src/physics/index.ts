import type {
  Adjustment,
  AssistantAdvice,
  BeamId,
  BeamResult,
  Component,
  ComponentId,
  Configuration,
  Measurement,
  Plane,
  Segment,
  Settings,
  Simulation,
  Vec3,
  Complex,
} from "./types";
import {
  add,
  sub,
  scale,
  dot,
  norm,
  normalize,
  reflect,
  mountRotate,
  planeHit,
  refract,
  propagateQ,
  lensQ,
  radiusFromQ,
  waistFromQ,
  frame,
  gaussianOverlap,
  counterAngle,
  matrixRank,
} from "./math";
export * from "./types";
export * from "./math";

export const DEFAULT_SETTINGS: Settings = {
  wavelengthNm: 1064,
  beamRadius: 2.5,
  m2: 1,
  focalLength: 15,
  power: 1,
  mirrorStepMrad: 0.15,
  lensStepMm: 0.02,
  hwpDegrees: 22.5,
  pbsIndex: 1.5,
  pbsSize: 12,
  irisRadius: 1.5,
};
// Account for the window's reduced diffraction length and finite input Gaussian curvature.
function nominalLensDistance(pathConstant: number) {
  let length = 15 + 1 - 1 / 1.45;
  const rayleigh = (Math.PI * 2.5 ** 2) / 0.001064;
  for (let i = 0; i < 4; i++)
    length =
      -lensQ({ re: pathConstant - length, im: rayleigh }, 15).re + 1 - 1 / 1.45;
  return length;
}
const lensDistanceA = nominalLensDistance(776),
  lensDistanceB = nominalLensDistance(1016);
const descriptions = {
  mirror:
    "Two-axis mount; yaw about local vertical, then pitch about the rotated horizontal axis. The reflecting surface rotates about its center pivot.",
  lens: "LA1540-C approximation: f = 15 mm, diameter = 12.7 mm. Local thin lens and meridional oblique correction; spherical aberration and vector focusing are not included.",
  window:
    "Lossless 1 mm parallel fused-silica slab, index 1.45. Refraction changes position and Gaussian diffraction distance.",
  pbs: "One finite, lossless ideal cube. Snell refraction at external faces and polarization-selective internal coating; ghost reflections are omitted.",
};
function comp(
  id: ComponentId,
  name: string,
  short: string,
  kind: Component["kind"],
  position: Vec3,
  normal: Vec3,
  aperture: number,
  beam?: BeamId,
): Component {
  return {
    id,
    name,
    short,
    kind,
    position,
    normal: normalize(normal),
    aperture,
    beam,
    description:
      descriptions[kind as keyof typeof descriptions] ||
      "Selectable virtual optical instrument.",
  };
}
const mirrorNormal = (incoming: Vec3, outgoing: Vec3) =>
  normalize(sub(normalize(incoming), normalize(outgoing)));
export const COMPONENTS: Component[] = [
  comp("laser", "1064 nm laser", "Laser", "laser", [0, 0, -300], [0, 0, 1], 5),
  comp("hwp", "Half-wave plate", "λ/2", "hwp", [0, 0, -250], [0, 0, 1], 12.7),
  comp(
    "pbs",
    "Polarizing beam splitter",
    "PBS",
    "pbs",
    [0, 0, -180],
    [-1, 0, 1],
    12,
  ),
  comp(
    "a1",
    "Arm A · mirror 1",
    "A1",
    "mirror",
    [240, 0, -180],
    mirrorNormal([1, 0, 0], [0, 0, 1]),
    25,
    "A",
  ),
  comp(
    "a2",
    "Arm A · mirror 2",
    "A2",
    "mirror",
    [240, 0, 0],
    mirrorNormal([0, 0, 1], [-1, 0, 0]),
    25,
    "A",
  ),
  comp(
    "la",
    "Arm A · focusing lens",
    "LA",
    "lens",
    [lensDistanceA, 0, 0],
    [-1, 0, 0],
    12.7,
    "A",
  ),
  comp("wa", "Right chamber window", "WA", "window", [5, 0, 0], [-1, 0, 0], 15),
  comp("wb", "Left chamber window", "WB", "window", [-5, 0, 0], [1, 0, 0], 15),
  comp(
    "lb",
    "Arm B · focusing lens",
    "LB",
    "lens",
    [-lensDistanceB, 0, 0],
    [1, 0, 0],
    12.7,
    "B",
  ),
  comp(
    "b2",
    "Arm B · mirror 2",
    "B2",
    "mirror",
    [-240, 0, 0],
    mirrorNormal([-240, 0, -180], [1, 0, 0]),
    25,
    "B",
  ),
  comp(
    "b1",
    "Arm B · mirror 1",
    "B1",
    "mirror",
    [0, 0, 180],
    mirrorNormal([0, 0, 1], [-240, 0, -180]),
    25,
    "B",
  ),
  comp(
    "iris1",
    "Alignment iris 1",
    "I1",
    "iris",
    [190, 0, 0],
    [-1, 0, 0],
    3,
    "A",
  ),
  comp(
    "iris2",
    "Alignment iris 2",
    "I2",
    "iris",
    [70, 0, 0],
    [-1, 0, 0],
    3,
    "A",
  ),
  comp("camera", "Trap camera", "Camera", "camera", [0, 70, 0], [0, -1, 0], 10),
  comp(
    "detector",
    "Recombined output profiler",
    "Output",
    "detector",
    [-100, 0, -180],
    [-1, 0, 0],
    20,
  ),
];
export const DEFAULT_ROUTES: Record<BeamId, ComponentId[]> = {
  A: ["a1", "a2", "la", "wa", "wb", "lb", "b2", "b1"],
  B: ["b1", "b2", "lb", "wb", "wa", "la", "a2", "a1"],
};
const zero = (): Adjustment => ({
  pitch: 0,
  yaw: 0,
  z: 0,
  x: 0,
  y: 0,
  roll: 0,
});
export function createConfiguration(): Configuration {
  return {
    adjustments: Object.fromEntries(
      COMPONENTS.map((c) => [c.id, zero()]),
    ) as Record<ComponentId, Adjustment>,
    hidden: Object.fromEntries(COMPONENTS.map((c) => [c.id, zero()])) as Record<
      ComponentId,
      Adjustment
    >,
    settings: { ...DEFAULT_SETTINGS },
    geometry: {},
    seed: 42,
  };
}
const total = (c: Configuration, id: ComponentId): Adjustment =>
  Object.fromEntries(
    Object.keys(zero()).map((k) => [
      k,
      (c.adjustments[id]?.[k as keyof Adjustment] || 0) +
        (c.hidden[id]?.[k as keyof Adjustment] || 0),
    ]),
  ) as unknown as Adjustment;
export function applyAdjustment(
  config: Configuration,
  id: ComponentId,
  axis: keyof Adjustment,
  value: number,
): Configuration {
  return {
    ...config,
    adjustments: {
      ...config.adjustments,
      [id]: {
        ...config.adjustments[id],
        [axis]: Math.max(-5, Math.min(5, Math.round(value))),
      },
    },
  };
}
export function resetComponent(
  config: Configuration,
  id: ComponentId,
): Configuration {
  return { ...config, adjustments: { ...config.adjustments, [id]: zero() } };
}
function actualComponents(config: Configuration): Component[] {
  return COMPONENTS.map((c) => {
    const a = total(config, c.id),
      base = config.geometry[c.id] || c.position,
      axial =
        c.kind === "lens" || c.kind === "window"
          ? c.normal
          : ([0, 0, 1] as Vec3);
    const local = frame(axial);
    const position = add(
      base,
      add(
        scale(axial, a.z * config.settings.lensStepMm),
        add(
          scale(local.u, a.x * config.settings.lensStepMm),
          scale(local.v, a.y * config.settings.lensStepMm),
        ),
      ),
    );
    const rad = config.settings.mirrorStepMrad * 0.001;
    return {
      ...c,
      aperture: c.kind === "iris" ? 2 * config.settings.irisRadius : c.aperture,
      position,
      normal: normalize(
        mountRotate(
          c.normal,
          c.normal,
          a.pitch * rad,
          a.yaw * rad,
          a.roll * rad,
        ),
      ),
    };
  });
}
interface Ray {
  p: Vec3;
  d: Vec3;
  q: Complex;
  power: number;
  segments: Segment[];
  last: string;
  warnings: string[];
  blocked: boolean;
}
function advance(ray: Ray, to: Vec3, id: string, beam: BeamId, index = 1) {
  const length = norm(sub(to, ray.p));
  const coordinateFrame = frame(ray.d);
  if (length > 1e-9)
    ray.segments.push({
      beam,
      from: [...ray.p],
      to: [...to],
      direction: [...ray.d],
      q: { ...ray.q },
      power: ray.power,
      fromId: ray.last,
      toId: id,
      length,
      refractiveIndex: index,
      coordinateFrame,
      polarization: beam === "A" ? coordinateFrame.v : coordinateFrame.u,
    });
  ray.q = propagateQ(ray.q, length, index);
  ray.p = to;
  ray.last = id;
}
function hit(
  ray: Ray,
  point: Vec3,
  normal: Vec3,
  id: string,
  beam: BeamId,
  index = 1,
): boolean {
  const h = planeHit(ray.p, ray.d, point, normal);
  if (!h) {
    ray.blocked = true;
    ray.warnings.push(
      `${id}: ray misses the forward surface. Check the edited path graph.`,
    );
    return false;
  }
  advance(ray, h.point, id, beam, index);
  return true;
}
/** The q parameter is in reduced-air coordinates; internal slab propagation adds L/n. */
export function slabPass(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  normal: Vec3,
  thickness: number,
  index: number,
) {
  const n = dot(direction, normal) > 0 ? normal : scale(normal, -1),
    entry = planeHit(
      origin,
      direction,
      sub(center, scale(n, thickness / 2)),
      n,
    );
  if (!entry) return null;
  const internal = refract(direction, n, 1, index);
  if (!internal) return null;
  const exit = planeHit(
    entry.point,
    internal,
    add(center, scale(n, thickness / 2)),
    n,
  );
  if (!exit) return null;
  const outgoing = refract(internal, n, index, 1);
  return outgoing
    ? {
        entry: entry.point,
        exit: exit.point,
        direction: outgoing,
        internal,
        glassLength: exit.distance,
      }
    : null;
}
function passWindow(ray: Ray, c: Component, beam: BeamId) {
  const pass = slabPass(ray.p, ray.d, c.position, c.normal, 1, 1.45);
  if (!pass) {
    ray.blocked = true;
    ray.warnings.push(`${c.short}: no valid window exit.`);
    return;
  }
  advance(ray, pass.entry, `${c.id}:entry`, beam);
  ray.d = pass.internal;
  advance(ray, pass.exit, `${c.id}:exit`, beam, 1.45);
  ray.d = pass.direction;
}
/** Finite cube: refract at the selected entry face, interact once with the internal diagonal coating, then refract at the exit face. */
export function cubePass(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  pitch: number,
  yaw: number,
  roll: number,
  size: number,
  index: number,
  reflected: boolean,
) {
  const nominal = normalize([-1, 0, 1]);
  const axes = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((v) => mountRotate(v, nominal, pitch, yaw, roll));
  const coating = mountRotate(nominal, nominal, pitch, yaw, roll);
  let entryAxis = axes[0];
  for (const a of axes)
    if (Math.abs(dot(direction, a)) > Math.abs(dot(direction, entryAxis)))
      entryAxis = a;
  const inward = scale(entryAxis, dot(direction, entryAxis) > 0 ? 1 : -1);
  const entry = planeHit(
    origin,
    direction,
    sub(center, scale(inward, size / 2)),
    inward,
  );
  if (
    !entry ||
    axes.some(
      (axis) => Math.abs(dot(sub(entry.point, center), axis)) > size / 2 + 1e-7,
    )
  )
    return null;
  const internal = refract(direction, inward, 1, index);
  if (!internal) return null;
  const coatingHit = planeHit(entry.point, internal, center, coating);
  if (
    !coatingHit ||
    axes.some(
      (axis) =>
        Math.abs(dot(sub(coatingHit.point, center), axis)) > size / 2 + 1e-7,
    )
  )
    return null;
  const after = reflected ? reflect(internal, coating) : internal;
  let best: { point: Vec3; distance: number; normal: Vec3 } | null = null;
  for (const axis of axes) {
    const out = scale(axis, dot(after, axis) > 0 ? 1 : -1),
      h = planeHit(
        coatingHit.point,
        after,
        add(center, scale(out, size / 2)),
        out,
      );
    if (h && h.distance > 1e-8 && (!best || h.distance < best.distance))
      best = { ...h, normal: out };
  }
  if (!best) return null;
  const outgoing = refract(after, best.normal, index, 1);
  if (!outgoing) return null;
  return {
    entry: entry.point,
    coating: coatingHit.point,
    exit: best.point,
    internal,
    beforeExit: after,
    direction: outgoing,
    glassLength: coatingHit.distance + best.distance,
  };
}
function passPBS(
  ray: Ray,
  component: Component,
  config: Configuration,
  beam: BeamId,
  encounter: number,
) {
  const a = total(config, "pbs"),
    rad = config.settings.mirrorStepMrad * 0.001;
  const pass = cubePass(
    ray.p,
    ray.d,
    component.position,
    a.pitch * rad,
    a.yaw * rad,
    a.roll * rad,
    config.settings.pbsSize,
    config.settings.pbsIndex,
    beam === "A",
  );
  if (!pass) {
    ray.blocked = true;
    ray.warnings.push(
      "PBS: no valid exit (missed face or total internal reflection).",
    );
    return;
  }
  advance(ray, pass.entry, `pbs:${encounter}:entry`, beam);
  ray.d = pass.internal;
  advance(
    ray,
    pass.coating,
    `pbs:${encounter}:coating`,
    beam,
    config.settings.pbsIndex,
  );
  ray.d = pass.beforeExit;
  advance(
    ray,
    pass.exit,
    `pbs:${encounter}:exit`,
    beam,
    config.settings.pbsIndex,
  );
  ray.d = pass.direction;
}
/** Local lens frame. Meridional f·cos(incidence) approximation; one scalar Gaussian q cannot resolve astigmatism. */
export function thinLensDirection(
  direction: Vec3,
  hitPoint: Vec3,
  center: Vec3,
  normal: Vec3,
  focalLength: number,
): Vec3 {
  const axis = dot(direction, normal) > 0 ? normal : scale(normal, -1),
    cos = Math.max(0.05, dot(direction, axis)),
    r = sub(
      sub(hitPoint, center),
      scale(axis, dot(sub(hitPoint, center), axis)),
    );
  return normalize(sub(direction, scale(r, cos / (focalLength * cos))));
}
function clip(ray: Ray, c: Component, settings: Settings) {
  const r = norm(sub(ray.p, c.position)),
    w = radiusFromQ(ray.q, settings.wavelengthNm * 1e-6, settings.m2),
    R = c.aperture / 2;
  let fraction = 1;
  if (r + 4 * w > R) {
    if (r < 1e-4) fraction = 1 - Math.exp((-2 * R * R) / (w * w));
    else {
      const t = ((R - r) * Math.SQRT2) / w;
      const sign = t < 0 ? -1 : 1,
        x = Math.abs(t),
        p = 1 / (1 + 0.3275911 * x);
      const erf =
        sign *
        (1 -
          ((((1.061405429 * p - 1.453152027) * p + 1.421413741) * p -
            0.284496736) *
            p +
            0.254829592) *
            p *
            Math.exp(-x * x));
      fraction = Math.max(0, Math.min(1, (1 + erf) / 2));
    }
  }
  ray.power *= fraction;
  if (fraction < 0.99)
    ray.warnings.push(
      `${c.short}: estimated aperture clipping ${((1 - fraction) * 100).toFixed(1)}%.`,
    );
  if (fraction < 1e-6) ray.blocked = true;
}
function traceBeam(
  config: Configuration,
  components: Component[],
  beam: BeamId,
): BeamResult {
  const get = (id: ComponentId) => components.find((c) => c.id === id)!;
  const settings = config.settings,
    laser = get("laser"),
    fraction =
      beam === "A"
        ? Math.sin((2 * settings.hwpDegrees * Math.PI) / 180) ** 2
        : Math.cos((2 * settings.hwpDegrees * Math.PI) / 180) ** 2;
  const ray: Ray = {
    p: [...laser.position],
    d: [...laser.normal],
    q: {
      re: 0,
      im:
        (Math.PI * settings.beamRadius ** 2) /
        (settings.wavelengthNm * 1e-6 * settings.m2),
    },
    power: settings.power * fraction,
    segments: [],
    last: "laser",
    warnings: [],
    blocked: false,
  };
  const hwp = get("hwp");
  if (hit(ray, hwp.position, hwp.normal, hwp.id, beam))
    clip(ray, hwp, settings);
  if (!ray.blocked) passPBS(ray, get("pbs"), config, beam, 1);
  const route = config.routes?.[beam] || DEFAULT_ROUTES[beam];
  let trapSegment: Segment | undefined;
  for (const id of route) {
    if (ray.blocked) break;
    const c = get(id);
    if (!c || !["mirror", "lens", "window", "iris"].includes(c.kind)) {
      ray.warnings.push(
        `Unsupported loop element ${id}; use mirrors, lenses, windows, or irises.`,
      );
      ray.blocked = true;
      break;
    }
    const before = ray.segments.length;
    if (c.kind === "window") passWindow(ray, c, beam);
    else {
      if (!hit(ray, c.position, c.normal, id, beam)) break;
      clip(ray, c, settings);
      if (c.kind === "mirror") ray.d = reflect(ray.d, c.normal);
      if (c.kind === "lens") {
        const incidence = Math.abs(dot(ray.d, c.normal)),
          f = settings.focalLength * Math.max(0.05, incidence);
        ray.d = thinLensDirection(
          ray.d,
          ray.p,
          c.position,
          c.normal,
          settings.focalLength,
        );
        ray.q = lensQ(ray.q, f);
        if (incidence < 0.995)
          ray.warnings.push(
            `${c.short}: oblique scalar lens approximation; astigmatism is unresolved.`,
          );
      }
    }
    for (const s of ray.segments.slice(before))
      if (
        (s.fromId.startsWith("wa:exit") && s.toId.startsWith("wb:entry")) ||
        (s.fromId.startsWith("wb:exit") && s.toId.startsWith("wa:entry"))
      )
        trapSegment = s;
  }
  const fallback =
    ray.segments.find((s) => s.fromId === (beam === "A" ? "la" : "lb")) ||
    ray.segments[ray.segments.length - 1];
  const focus = trapSegment || fallback;
  const centralDirection = focus?.direction || ray.d,
    waistInfo = waistFromQ(
      focus?.q || ray.q,
      settings.wavelengthNm * 1e-6,
      settings.m2,
    ),
    waist = add(
      focus?.from || ray.p,
      scale(centralDirection, waistInfo.distance),
    );
  const trapHit = planeHit(
    focus?.from || ray.p,
    centralDirection,
    [0, 0, 0],
    [1, 0, 0],
  );
  const trapPoint = trapHit?.point || waist;
  if (!ray.blocked) passPBS(ray, get("pbs"), config, beam, 2);
  const returnPoint: [number, number, number] = [...ray.p],
    returnDirection: [number, number, number] = [...ray.d];
  if (!ray.blocked) {
    const detection = planeHit(
      ray.p,
      ray.d,
      get("detector").position,
      get("detector").normal,
    );
    advance(
      ray,
      detection?.point || add(ray.p, scale(ray.d, 100)),
      "detector",
      beam,
    );
  }
  // All mirrors lie in the x-z plane nominally. The ideal PBS eigenstates are orthogonal s/p; no coherent cross term is included in intensity displays.
  const coordinateFrame = frame(centralDirection);
  const polarization: Vec3 =
    beam === "A" ? coordinateFrame.v : coordinateFrame.u;
  return {
    id: beam,
    segments: ray.segments,
    waist,
    waistRadius: waistInfo.radius,
    rayleigh: waistInfo.rayleigh,
    direction: centralDirection,
    trapPoint,
    returnPoint,
    returnDirection,
    power: ray.power,
    polarization,
    coordinateFrame,
    blocked: ray.blocked,
    warnings: ray.warnings,
  };
}
export function simulate(config: Configuration): Simulation {
  const components = actualComponents(config),
    A = traceBeam(config, components, "A"),
    B = traceBeam(config, components, "B"),
    separation = norm(sub(A.trapPoint, B.trapPoint)),
    axis = normalize(sub(A.direction, B.direction)),
    axialSeparation = Math.abs(dot(sub(A.waist, B.waist), axis));
  const beamWidth = (b: BeamResult) =>
    b.waistRadius *
    Math.sqrt(
      1 + (dot(sub(b.trapPoint, b.waist), b.direction) / b.rayleigh) ** 2,
    );
  return {
    beams: { A, B },
    components,
    separation,
    angleMrad: counterAngle(A.direction, B.direction) * 1000,
    axialSeparation,
    overlap: ![A, B].every((b) =>
      b.segments.some((s) => isTrap(s) && s.power > 1e-12),
    )
      ? 0
      : gaussianOverlap(separation, beamWidth(A), beamWidth(B)),
    warnings: [...new Set([...A.warnings, ...B.warnings])],
    wavelengthNm: config.settings.wavelengthNm,
    m2: config.settings.m2,
  };
}

export function makePlane(
  id: string,
  name: string,
  point: Vec3,
  normal: Vec3,
  segmentHint?: string,
  beam?: BeamId,
): Plane {
  const f = frame(normal);
  return { id, name, point, normal: f.n, u: f.u, v: f.v, segmentHint, beam };
}
function nominalSegmentDirection(s: Segment): Vec3 {
  const from = COMPONENTS.find((c) => c.id === s.fromId.split(":")[0]),
    to = COMPONENTS.find((c) => c.id === s.toId.split(":")[0]);
  return from && to ? normalize(sub(to.position, from.position)) : s.direction;
}
function isTrap(s: Segment) {
  return (
    (s.fromId.startsWith("wa:exit") && s.toId.startsWith("wb:entry")) ||
    (s.fromId.startsWith("wb:exit") && s.toId.startsWith("wa:entry"))
  );
}
export function getPlanes(sim: Simulation): Plane[] {
  const planes: Plane[] = [
    makePlane("trap", "Trap center", [0, 0, 0], [1, 0, 0], "trap"),
    makePlane(
      "iris1",
      "Iris 1 · arm A",
      sim.components.find((c) => c.id === "iris1")!.position,
      [-1, 0, 0],
      "a2>la",
      "A",
    ),
    makePlane(
      "iris2",
      "Iris 2 · arm A",
      sim.components.find((c) => c.id === "iris2")!.position,
      [-1, 0, 0],
      "a2>la",
      "A",
    ),
  ];
  for (const x of [-2, -1, -0.5, 0.5, 1, 2])
    planes.push(
      makePlane(
        `trap:${x}`,
        `Trap ${x > 0 ? "+" : ""}${x} mm`,
        [x, 0, 0],
        [1, 0, 0],
        "trap",
      ),
    );
  for (const beam of ["A", "B"] as BeamId[]) {
    const b = sim.beams[beam];
    planes.push(
      makePlane(
        `waist:${beam}`,
        `Near waist ${beam}`,
        b.waist,
        b.direction,
        "trap",
      ),
    );
    for (const id of ["a1", "a2", "la", "lb", "b2", "b1"] as ComponentId[]) {
      const component = sim.components.find((c) => c.id === id)!;
      const before = b.segments.find((s) => s.toId === id),
        after = b.segments.find((s) => s.fromId === id);
      if (before)
        planes.push(
          makePlane(
            `${beam}:before:${id}`,
            `${beam} · before ${component.short}`,
            sub(
              component.position,
              scale(nominalSegmentDirection(before), 0.1),
            ),
            nominalSegmentDirection(before),
            `${before.fromId}>${before.toId}`,
            beam,
          ),
        );
      if (after)
        planes.push(
          makePlane(
            `${beam}:after:${id}`,
            `${beam} · after ${component.short}`,
            add(component.position, scale(nominalSegmentDirection(after), 0.1)),
            nominalSegmentDirection(after),
            `${after.fromId}>${after.toId}`,
            beam,
          ),
        );
    }
    const beforeReturn = b.segments.find((s) => s.toId === "pbs:2:entry");
    if (beforeReturn)
      planes.push(
        makePlane(
          `${beam}:before:pbs`,
          `${beam} · before recombination`,
          sub(
            sim.components.find((c) => c.id === "pbs")!.position,
            scale(nominalSegmentDirection(beforeReturn), 11),
          ),
          nominalSegmentDirection(beforeReturn),
          `${beforeReturn.fromId}>${beforeReturn.toId}`,
          beam,
        ),
      );
  }
  const detector = sim.components.find((c) => c.id === "detector")!;
  planes.push(
    makePlane(
      "output",
      "After PBS · output profiler",
      detector.position,
      detector.normal,
      "return",
    ),
    makePlane(
      "near",
      "Output near field",
      [-45, 0, -180],
      [-1, 0, 0],
      "return",
    ),
    makePlane("far", "Output far field", [-450, 0, -180], [-1, 0, 0], "return"),
  );
  return planes;
}
export function measure(sim: Simulation, plane: Plane): Measurement {
  const spots = {} as Measurement["spots"];
  for (const beam of ["A", "B"] as BeamId[]) {
    const candidates = sim.beams[beam].segments.filter(
      (s) =>
        !plane.segmentHint ||
        (plane.segmentHint === "trap"
          ? isTrap(s)
          : plane.segmentHint === "return"
            ? s.fromId === "pbs:2:exit" && s.toId === "detector"
            : `${s.fromId}>${s.toId}` === plane.segmentHint),
    );
    let found:
      { s: Segment; hit: NonNullable<ReturnType<typeof planeHit>> } | undefined;
    if (!plane.beam || plane.beam === beam)
      for (const s of candidates) {
        const h = planeHit(s.from, s.direction, plane.point, plane.normal);
        if (
          h &&
          (h.distance <= s.length + 1e-6 ||
            (s.fromId === "pbs:2:exit" && s.toId === "detector"))
        ) {
          found = { s, hit: h };
          break;
        }
      }
    if (found) {
      const offset = sub(found.hit.point, plane.point);
      spots[beam] = {
        beam,
        x: dot(offset, plane.u),
        y: dot(offset, plane.v),
        radius: radiusFromQ(
          propagateQ(
            found.s.q,
            found.hit.distance,
            found.s.refractiveIndex || 1,
          ),
          (sim.wavelengthNm || 1064) * 1e-6,
          sim.m2 || 1,
        ),
        power: found.s.power,
        direction: found.s.direction,
        valid: found.s.power > 1e-12,
      };
    } else
      spots[beam] = {
        beam,
        x: 0,
        y: 0,
        radius: 0,
        power: 0,
        direction: sim.beams[beam].direction,
        valid: false,
      };
  }
  const both = spots.A.valid && spots.B.valid,
    separation = both
      ? Math.hypot(spots.A.x - spots.B.x, spots.A.y - spots.B.y)
      : Infinity;
  return {
    plane,
    spots,
    separation,
    overlap: both
      ? gaussianOverlap(separation, spots.A.radius, spots.B.radius)
      : 0,
  };
}

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomizeConfiguration(
  config: Configuration,
  scenario: "irises" | "coaxial" | "waists" | "crossing",
  seed = config.seed + 1,
): Configuration {
  const fresh = createConfiguration(),
    next: Configuration = {
      ...fresh,
      settings: { ...config.settings },
      geometry: { ...config.geometry },
      routes: config.routes,
      seed,
    };
  const random = rng(seed),
    error = (amplitude = 2) => (random() * 2 - 1) * amplitude;
  const ids: ComponentId[] =
    scenario === "irises" ? ["a1", "a2"] : ["a1", "a2", "b1", "b2"];
  for (const id of ids) {
    next.hidden[id].pitch = error();
    next.hidden[id].yaw = error();
  }
  if (scenario === "waists") {
    for (const id of ["la", "lb"] as const) {
      next.hidden[id].z = error(3);
      next.hidden[id].x = error(0.6);
      next.hidden[id].y = error(0.6);
      next.hidden[id].pitch = error(2);
      next.hidden[id].yaw = error(2);
    }
    next.hidden.pbs.pitch = error(0.25);
    next.hidden.pbs.yaw = error(0.25);
    next.hidden.laser.pitch = error(0.15);
    next.hidden.laser.yaw = error(0.15);
    next.hidden.wa.yaw = error(1);
    next.hidden.wb.pitch = error(1);
  }
  if (scenario === "crossing") {
    for (const id of ids) next.hidden[id] = zero();
    next.hidden.a1.yaw = 2;
    next.hidden.a2.yaw = 2; // Solve one hidden perturbation to make A intersect B at the trap while retaining nonzero angular error.
    for (let k = 0; k < 4; k++) {
      const s = simulate(next),
        f = s.beams.A.trapPoint[2] - s.beams.B.trapPoint[2];
      next.hidden.a2.yaw += 0.01;
      const probe = simulate(next),
        df =
          (probe.beams.A.trapPoint[2] - probe.beams.B.trapPoint[2] - f) / 0.01;
      next.hidden.a2.yaw -= 0.01;
      if (Math.abs(df) > 1e-10) next.hidden.a2.yaw -= f / df;
    }
  }
  return next;
}

/** Residuals contain only available centroid/width measurements. No hidden parameters, true ray directions, or actual waist coordinates enter the controller. */
function observableResidual(
  sim: Simulation,
  planes: Plane[],
  goal: "irises" | "coaxial" | "waists",
  beam: BeamId,
): number[] {
  const result: number[] = [];
  for (const p of planes) {
    const m = measure(sim, p);
    if (goal === "irises") {
      const s = m.spots[beam];
      result.push(s.valid ? s.x : 100, s.valid ? s.y : 100);
    } else {
      const a = m.spots.A,
        b = m.spots.B;
      if (!a.valid || !b.valid)
        result.push(100, 100, ...(goal === "waists" ? [100] : []));
      else {
        result.push((a.x - b.x) * 100, (a.y - b.y) * 100);
        if (goal === "waists")
          result.push(
            Math.log(Math.max(1e-9, a.radius) / Math.max(1e-9, b.radius)),
          );
      }
    }
  }
  return result;
}
const squared = (values: number[]) => values.reduce((sum, v) => sum + v * v, 0);
export function suggestAdjustment(
  config: Configuration,
  planes: Plane[],
  goal: "irises" | "coaxial" | "waists",
  beam: BeamId = "A",
): AssistantAdvice | null {
  if (!planes.length) return null;
  const controls: { id: ComponentId; axis: keyof Adjustment }[] = [];
  for (const id of (goal === "irises"
    ? beam === "A"
      ? ["a1", "a2"]
      : ["b1", "b2"]
    : ["a1", "a2", "b1", "b2"]) as ComponentId[])
    for (const axis of ["pitch", "yaw"] as const) controls.push({ id, axis });
  if (goal === "waists")
    for (const id of ["la", "lb"] as const) controls.push({ id, axis: "z" });
  const initial = observableResidual(simulate(config), planes, goal, beam),
    before = squared(initial),
    columns: number[][] = [];
  let best: {
    control: (typeof controls)[number];
    step: number;
    score: number;
  } | null = null;
  for (const control of controls) {
    const current = config.adjustments[control.id][control.axis],
      responses: { step: number; residual: number[] }[] = [];
    for (const step of [-1, 1])
      if (current + step >= -5 && current + step <= 5) {
        const changed = applyAdjustment(
            config,
            control.id,
            control.axis,
            current + step,
          ),
          residual = observableResidual(simulate(changed), planes, goal, beam);
        responses.push({ step, residual });
        const score = squared(residual);
        if (!best || score < best.score) best = { control, step, score };
      }
    const positive = responses.find((r) => r.step === 1),
      negative = responses.find((r) => r.step === -1);
    columns.push(
      initial.map((v, i) =>
        positive && negative
          ? (positive.residual[i] - negative.residual[i]) / 2
          : positive
            ? positive.residual[i] - v
            : negative
              ? v - negative.residual[i]
              : 0,
      ),
    );
  }
  const jacobian = initial.map((_, i) => columns.map((c) => c[i])),
    rank = matrixRank(jacobian),
    underdetermined = rank < (goal === "waists" ? 6 : 4),
    sourceDegeneracy = rank < controls.length;
  const enoughPlanes = planes.length >= (goal === "waists" ? 3 : 2);
  const deficit = !enoughPlanes
    ? ` Add ${goal === "waists" ? "at least three axial profile planes" : "a second spatially separated plane"} to distinguish ${goal === "waists" ? "focus position and size" : "position and angle"}.`
    : sourceDegeneracy
      ? " Several control combinations have the same measured effect; the hidden cause cannot be identified uniquely."
      : "";
  if (!best) return null;
  const improves = best.score < before - 1e-12;
  const component = best.control.id,
    axis = best.control.axis;
  return {
    component,
    axis,
    step: improves ? best.step : 0,
    scoreBefore: before,
    scoreAfter: improves ? best.score : before,
    rank,
    underdetermined: underdetermined || !enoughPlanes,
    explanation: improves
      ? `Measured ${goal === "irises" ? "iris-centering" : goal === "coaxial" ? "multi-plane centroid" : "centroid and width"} error falls ${((1 - best.score / Math.max(before, 1e-20)) * 100).toFixed(1)}% after ${component.toUpperCase()} ${axis} ${best.step > 0 ? "+1" : "−1"}.${deficit}`
      : `No single permitted one-step adjustment improves the measured error. The controls may be at their resolution limit or require a coordinated move.${deficit}`,
    effect:
      axis === "z"
        ? "Moves the lens along its local axis, changing the axial focus and measured profile widths."
        : "Rotates a mirror about its mount pivot. The reflected angle changes first; downstream centroid changes accumulate with propagation distance.",
  };
}
