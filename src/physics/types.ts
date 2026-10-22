// All lengths in mm, ray directions normalized, angles in radians.
export type Vec3 = [number, number, number];
export type BeamId = "A" | "B";
export type ComponentKind =
  | "mirror"
  | "lens"
  | "pbs"
  | "window"
  | "hwp"
  | "laser"
  | "iris"
  | "camera"
  | "detector";
export type ComponentId =
  | "laser"
  | "hwp"
  | "pbs"
  | "a1"
  | "a2"
  | "la"
  | "wa"
  | "wb"
  | "lb"
  | "b2"
  | "b1"
  | "iris1"
  | "iris2"
  | "camera"
  | "detector";
export interface Adjustment {
  pitch: number;
  yaw: number;
  z: number;
  x: number;
  y: number;
  roll: number;
}
export interface Component {
  id: ComponentId;
  name: string;
  short: string;
  kind: ComponentKind;
  position: Vec3;
  normal: Vec3;
  beam?: BeamId;
  description: string;
  aperture: number;
}
export interface Settings {
  wavelengthNm: number;
  beamRadius: number;
  m2: number;
  focalLength: number;
  power: number;
  mirrorStepMrad: number;
  lensStepMm: number;
  hwpDegrees: number;
  pbsIndex: number;
  pbsSize: number;
  irisRadius: number;
}
export interface Configuration {
  adjustments: Record<ComponentId, Adjustment>;
  hidden: Record<ComponentId, Adjustment>;
  settings: Settings;
  geometry: Partial<Record<ComponentId, Vec3>>;
  orientations?: Partial<Record<ComponentId, Vec3>>;
  seed: number;
  routes?: Record<BeamId, ComponentId[]>;
}
export interface Complex {
  re: number;
  im: number;
}
export interface Segment {
  beam: BeamId;
  from: Vec3;
  to: Vec3;
  direction: Vec3;
  q: Complex;
  power: number;
  fromId: string;
  toId: string;
  length: number;
  refractiveIndex?: number;
  coordinateFrame?: { u: Vec3; v: Vec3; n: Vec3 };
  polarization?: Vec3;
}
export interface BeamResult {
  id: BeamId;
  segments: Segment[];
  waist: Vec3;
  waistRadius: number;
  rayleigh: number;
  direction: Vec3;
  trapPoint: Vec3;
  returnPoint: Vec3;
  returnDirection: Vec3;
  power: number;
  polarization: Vec3;
  coordinateFrame?: { u: Vec3; v: Vec3; n: Vec3 };
  blocked: boolean;
  warnings: string[];
}
export interface Simulation {
  beams: Record<BeamId, BeamResult>;
  components: Component[];
  overlap: number;
  separation: number;
  angleMrad: number;
  axialSeparation: number;
  warnings: string[];
  wavelengthNm?: number;
  m2?: number;
}
export interface Plane {
  id: string;
  name: string;
  point: Vec3;
  normal: Vec3;
  u: Vec3;
  v: Vec3;
  beam?: BeamId;
  segmentHint?: string;
}
export interface Spot {
  beam: BeamId;
  x: number;
  y: number;
  radius: number;
  power: number;
  direction: Vec3;
  valid: boolean;
}
export interface Measurement {
  plane: Plane;
  spots: Record<BeamId, Spot>;
  separation: number;
  overlap: number;
}
export interface AssistantAdvice {
  component: ComponentId;
  axis: keyof Adjustment;
  step: number;
  scoreBefore: number;
  scoreAfter: number;
  explanation: string;
  effect: string;
  rank: number;
  underdetermined: boolean;
}
