export interface BrowserWavePayload {
  grid_size: number;
  wavelength_um: number;
  window_um: number;
  z_range_um: number;
  plane_z_um: number;
  z_slices: number;
  aperture_radius_um: number;
  aberrations: { astigmatism: number; coma: number; spherical: number };
  polarization: string;
  relative_phase: number;
  beams: Array<{
    waist_um: number;
    center_um: number[];
    direction: number[];
    power_mw: number;
  }>;
}

export interface BrowserWaveResult {
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
    beams: Array<{
      power_mw: number;
      centroid_um: number[];
      radius_um: number[];
    }>;
  };
  cautions: string[];
  notes: string[];
}

interface Sample {
  intensity: number;
  re: number;
  im: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

function apertureTransmission(radius: number, waist: number) {
  return radius > 0
    ? 1 - Math.exp((-2 * radius * radius) / (waist * waist))
    : 1;
}

function sampleBeam(
  beam: BrowserWavePayload["beams"][number],
  x: number,
  y: number,
  z: number,
  wavelength: number,
  aperture: number,
  aberrations: BrowserWavePayload["aberrations"],
): Sample {
  const w0 = beam.waist_um;
  const k = (2 * Math.PI) / wavelength;
  const directionZ = Math.abs(beam.direction[2]) < 1e-9 ? 1 : beam.direction[2];
  const signedDistance = Math.sign(directionZ) * (z - beam.center_um[2]);
  const rayleigh = (Math.PI * w0 * w0) / wavelength;
  const ratio = signedDistance / rayleigh;
  const waist = w0 * Math.sqrt(1 + ratio * ratio);
  const centerX =
    beam.center_um[0] +
    (beam.direction[0] / directionZ) * (z - beam.center_um[2]);
  const centerY =
    beam.center_um[1] +
    (beam.direction[1] / directionZ) * (z - beam.center_um[2]);
  const dx = x - centerX;
  const dy = y - centerY;
  const r2 = dx * dx + dy * dy;
  const retained = apertureTransmission(aperture, w0);
  const intensity =
    ((2 * beam.power_mw * retained) / (Math.PI * waist * waist)) *
    Math.exp((-2 * r2) / (waist * waist));
  const curvature =
    Math.abs(signedDistance) < 1e-12
      ? 0
      : signedDistance *
        (1 + (rayleigh * rayleigh) / (signedDistance * signedDistance));
  const pupil = aperture > 0 ? aperture : 2 * w0;
  const u = dx / pupil;
  const v = dy / pupil;
  const rho2 = u * u + v * v;
  const screen =
    aberrations.astigmatism * (u * u - v * v) +
    aberrations.coma * (3 * rho2 - 2) * u +
    aberrations.spherical * (6 * rho2 * rho2 - 6 * rho2 + 1);
  const phase =
    k * signedDistance +
    k * (beam.direction[0] * dx + beam.direction[1] * dy) +
    (curvature ? (k * r2) / (2 * curvature) : 0) -
    Math.atan(ratio) +
    2 * Math.PI * screen;
  const amplitude = Math.sqrt(Math.max(0, intensity));
  return {
    intensity,
    re: amplitude * Math.cos(phase),
    im: amplitude * Math.sin(phase),
  };
}

function combined(
  a: Sample,
  b: Sample,
  polarization: string,
  relativePhase: number,
) {
  if (polarization !== "parallel") return a.intensity + b.intensity;
  const c = Math.cos(relativePhase);
  const s = Math.sin(relativePhase);
  const bre = b.re * c - b.im * s;
  const bim = b.re * s + b.im * c;
  return (a.re + bre) ** 2 + (a.im + bim) ** 2;
}

export function calculateBrowserWave(
  payload: BrowserWavePayload,
): BrowserWaveResult {
  const n = payload.grid_size;
  const spacing = payload.window_um / n;
  const axis = Array.from(
    { length: n },
    (_, i) => (i - Math.floor(n / 2)) * spacing,
  );
  const zAxis = Array.from(
    { length: payload.z_slices },
    (_, i) =>
      -payload.z_range_um +
      (2 * payload.z_range_um * i) / (payload.z_slices - 1),
  );
  const beamPowers = payload.beams.map(
    (beam) =>
      beam.power_mw *
      apertureTransmission(payload.aperture_radius_um, beam.waist_um),
  );
  const totalInput = payload.beams.reduce(
    (sum, beam) => sum + beam.power_mw,
    0,
  );
  const xy: number[][] = [];
  const beamIntensity = payload.beams.map(() => new Float64Array(n * n));
  let peak = 0;

  for (let yi = 0; yi < n; yi++) {
    const row: number[] = [];
    for (let xi = 0; xi < n; xi++) {
      const samples = payload.beams.map((beam) =>
        sampleBeam(
          beam,
          axis[xi],
          axis[yi],
          payload.plane_z_um,
          payload.wavelength_um,
          payload.aperture_radius_um,
          payload.aberrations,
        ),
      );
      beamIntensity[0][yi * n + xi] = samples[0].intensity;
      beamIntensity[1][yi * n + xi] = samples[1].intensity;
      const value = combined(
        samples[0],
        samples[1],
        payload.polarization,
        payload.relative_phase,
      );
      peak = Math.max(peak, value);
      row.push(value);
    }
    xy.push(row);
  }

  const normalize = Math.max(peak, 1e-30);
  for (const row of xy)
    for (let i = 0; i < row.length; i++) row[i] /= normalize;

  const metrics = beamIntensity.map((values, beamIndex) => {
    let total = 0;
    let cx = 0;
    let cy = 0;
    for (let yi = 0; yi < n; yi++)
      for (let xi = 0; xi < n; xi++) {
        const value = values[yi * n + xi] * spacing * spacing;
        total += value;
        cx += value * axis[xi];
        cy += value * axis[yi];
      }
    cx /= Math.max(total, 1e-30);
    cy /= Math.max(total, 1e-30);
    let vx = 0;
    let vy = 0;
    for (let yi = 0; yi < n; yi++)
      for (let xi = 0; xi < n; xi++) {
        const value = values[yi * n + xi] * spacing * spacing;
        vx += value * (axis[xi] - cx) ** 2;
        vy += value * (axis[yi] - cy) ** 2;
      }
    return {
      power_mw: total,
      centroid_um: [cx, cy],
      radius_um: [
        2 * Math.sqrt(vx / Math.max(total, 1e-30)),
        2 * Math.sqrt(vy / Math.max(total, 1e-30)),
      ],
      expectedPower: beamPowers[beamIndex],
    };
  });

  let overlapNumerator = 0;
  for (let i = 0; i < n * n; i++)
    overlapNumerator +=
      Math.sqrt(beamIntensity[0][i] * beamIntensity[1][i]) * spacing * spacing;
  const overlap =
    (overlapNumerator * overlapNumerator) /
    Math.max(metrics[0].power_mw * metrics[1].power_mw, 1e-30);

  let xzPeak = 0;
  const xz = zAxis.map((z) =>
    axis.map((x) => {
      const samples = payload.beams.map((beam) =>
        sampleBeam(
          beam,
          x,
          0,
          z,
          payload.wavelength_um,
          payload.aperture_radius_um,
          payload.aberrations,
        ),
      );
      const value = combined(
        samples[0],
        samples[1],
        payload.polarization,
        payload.relative_phase,
      );
      xzPeak = Math.max(xzPeak, value);
      return value;
    }),
  );
  for (const row of xz)
    for (let i = 0; i < row.length; i++) row[i] /= Math.max(xzPeak, 1e-30);

  const maxDirection = Math.max(
    0.02,
    ...payload.beams.map(
      (beam) =>
        Math.hypot(beam.direction[0], beam.direction[1]) +
        (4 * payload.wavelength_um) / (Math.PI * beam.waist_um),
    ),
  );
  const farAxis = Array.from(
    { length: n },
    (_, i) => ((i - Math.floor(n / 2)) / (n / 2)) * maxDirection,
  );
  let farPeak = 0;
  const far = farAxis.map((fy) =>
    farAxis.map((fx) => {
      let value = 0;
      payload.beams.forEach((beam, index) => {
        const sigma = payload.wavelength_um / (Math.PI * beam.waist_um);
        const dx = fx - beam.direction[0];
        const dy = fy - beam.direction[1];
        value +=
          beamPowers[index] *
          Math.exp(-(dx * dx + dy * dy) / Math.max(sigma * sigma, 1e-30));
      });
      farPeak = Math.max(farPeak, value);
      return value;
    }),
  );
  for (const row of far)
    for (let i = 0; i < row.length; i++) row[i] /= Math.max(farPeak, 1e-30);

  const center = Math.floor(n / 2);
  const cautions = [
    "The hosted browser model uses analytical Gaussian propagation. Aperture clipping changes transmitted power but does not calculate aperture-edge diffraction.",
  ];
  if (
    Math.abs(payload.aberrations.astigmatism) +
      Math.abs(payload.aberrations.coma) +
      Math.abs(payload.aberrations.spherical) >
    0.8
  )
    cautions.push(
      "Strong phase screens are displayed as phase perturbations; use the downloadable Python solver for FFT diffraction validation.",
    );
  if (
    payload.polarization === "parallel" &&
    (2 * payload.z_range_um) / (payload.z_slices - 1) >
      payload.wavelength_um / 4
  )
    cautions.push(
      "Axial samples do not resolve every standing-wave fringe; reduce the axial range to inspect them.",
    );

  return {
    model: "Browser Gaussian wave propagation",
    grid_size: n,
    axis_um: axis,
    z_axis_um: zAxis,
    xy,
    xz,
    far,
    far_axis_direction_cosine: farAxis,
    profiles: { x: [...xy[center]], y: xy.map((row) => row[center]) },
    metrics: {
      beams: metrics.map(
        ({ expectedPower: _expectedPower, ...metric }) => metric,
      ),
      overlap: clamp(overlap, 0, 1),
      independent_power_mw: metrics[0].power_mw + metrics[1].power_mw,
      transmission:
        totalInput > 0
          ? (metrics[0].power_mw + metrics[1].power_mw) / totalInput
          : 0,
      spacing_um: spacing,
      peak_mw_per_um2: peak,
    },
    cautions,
    notes: [
      "XY and XZ panels are independently peak-normalized. Profiles are central sections.",
      "The far field is the sum of independent analytical Gaussian angular distributions.",
      "All calculations run locally in this browser; no server request or uploaded measurement data is used.",
      "The repository also includes the NumPy/SciPy angular-spectrum solver for higher-fidelity local studies.",
    ],
  };
}
