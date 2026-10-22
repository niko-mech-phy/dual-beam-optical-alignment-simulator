import { describe, it, expect } from "vitest";
import {
  COMPONENTS,
  createConfiguration,
  simulate,
  applyAdjustment,
  resetComponent,
  randomizeConfiguration,
  getPlanes,
  measure,
  suggestAdjustment,
  makePlane,
  DEFAULT_ROUTES,
  reflect,
  rotate,
  mountRotate,
  normalize,
  sub,
  norm,
  dot,
  scale,
  add,
  planeHit,
  refract,
  propagateQ,
  lensQ,
  radiusFromQ,
  waistFromQ,
  thinLensDirection,
  slabPass,
  cubePass,
  combinedIntensity,
  gaussianOverlap,
  counterAngle,
  matrixRank,
} from "../src/physics";
import defaultSetup from "../public/default-setup.json";
import type {
  Vec3,
  ComponentId,
  Adjustment,
  Configuration,
} from "../src/physics";
const nearVector = (actual: Vec3, expected: Vec3, tolerance = 1e-9) =>
  expect(norm(sub(actual, expected))).toBeLessThan(tolerance);
describe("coordinate frames and geometric laws", () => {
  it("applies coarse component orientations independently of fine mount steps", () => {
    const config = createConfiguration();
    config.orientations = { a1: [0, 1, 0] };
    const component = simulate(config).components.find(
      (item) => item.id === "a1",
    )!;
    nearVector(component.normal, [0, 1, 0]);
    expect(config.adjustments.a1.pitch).toBe(0);
    expect(config.adjustments.a1.yaw).toBe(0);
  });
  it("reflects a ray with the exact doubled mirror rotation", () => {
    const theta = 0.003,
      normal = rotate(normalize([-1, 0, 1]), [0, 1, 0], theta),
      actual = reflect([0, 0, 1], normal),
      expected = rotate([1, 0, 0], [0, 1, 0], 2 * theta);
    nearVector(actual, expected);
    expect(norm(actual)).toBeCloseTo(1, 14);
    expect(dot(actual, normal)).toBeCloseTo(-dot([0, 0, 1], normal), 14);
  });
  it("uses right-handed local yaw then intrinsic pitch (order matters)", () => {
    const n = normalize([-1, 0, 1]),
      yaw = 0.2,
      pitch = 0.3,
      vertical: Vec3 = [0, 1, 0],
      horizontal = normalize([n[2], 0, -n[0]]);
    const expected = rotate(
      rotate(n, vertical, yaw),
      rotate(horizontal, vertical, yaw),
      pitch,
    );
    nearVector(mountRotate(n, n, pitch, yaw), expected);
    expect(
      norm(sub(expected, rotate(rotate(n, horizontal, pitch), vertical, -yaw))),
    ).toBeGreaterThan(0.1);
  });
  it("intersects a 3D tilted surface and rejects backward/parallel intersections", () => {
    const n = normalize([1, 1, 1]),
      h = planeHit([0, 0, 0], normalize([1, 2, 3]), [0, 0, 5], n)!;
    expect(dot(sub(h.point, [0, 0, 5]), n)).toBeCloseTo(0, 12);
    expect(planeHit([0, 0, 0], [1, 0, 0], [-1, 0, 0], [1, 0, 0])).toBeNull();
    expect(planeHit([0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 0, 0])).toBeNull();
  });
  it("rotates a mirror about the mount center while changing its downstream position", () => {
    const c = createConfiguration(),
      a = simulate(c),
      b = simulate(applyAdjustment(c, "a1", "yaw", 1));
    nearVector(
      a.components.find((x) => x.id === "a1")!.position,
      b.components.find((x) => x.id === "a1")!.position,
    );
    expect(
      norm(
        sub(
          a.beams.A.segments.find((x) => x.toId === "a2")!.to,
          b.beams.A.segments.find((x) => x.toId === "a2")!.to,
        ),
      ),
    ).toBeGreaterThan(0.01);
  });
  it("Snell refraction is reversible and recognizes total internal reflection", () => {
    const d = normalize([0.2, 0, 1]),
      inside = refract(d, [0, 0, 1], 1, 1.5)!;
    nearVector(refract(inside, [0, 0, 1], 1.5, 1)!, d);
    expect(refract(normalize([1, 0, 0.1]), [0, 0, 1], 1.5, 1)).toBeNull();
  });
});
describe("Gaussian and local lens optics", () => {
  it("free propagation agrees with the analytic Gaussian radius and Rayleigh range", () => {
    const wavelength = 0.001064,
      w0 = 2.5,
      zR = (Math.PI * w0 * w0) / wavelength;
    for (const z of [0, 10, 1000, 20000])
      expect(
        radiusFromQ(propagateQ({ re: 0, im: zR }, z), wavelength),
      ).toBeCloseTo(w0 * Math.sqrt(1 + (z / zR) ** 2), 12);
  });
  it("thin-lens ABCD transform produces a positive finite waist", () => {
    const f = 15,
      zR = 18000,
      q = lensQ({ re: 0, im: zR }, f),
      w = waistFromQ(q);
    expect(w.distance).toBeCloseTo((f * zR * zR) / (f * f + zR * zR), 12);
    expect(w.rayleigh).toBeCloseTo((f * f * zR) / (f * f + zR * zR), 12);
    expect(w.radius).toBeGreaterThan(0);
  });
  it("lens axial translation moves its waist in the same physical direction", () => {
    const c = createConfiguration(),
      a = simulate(c),
      b = simulate(applyAdjustment(c, "la", "z", 1));
    expect(b.beams.A.waist[0] - a.beams.A.waist[0]).toBeCloseTo(
      -c.settings.lensStepMm,
      4,
    );
  });
  it("lens lateral decenter steers toward the lens center", () => {
    const out = thinLensDirection(
      [0, 0, 1],
      [0, 0, 0],
      [0.2, 0, 0],
      [0, 0, 1],
      15,
    );
    expect(out[0]).toBeGreaterThan(0);
    expect(out[0] / out[2]).toBeCloseTo(0.2 / 15, 10);
  });
  it("a lens works in a direction-local frame for reverse propagation", () => {
    const out = thinLensDirection(
      [0, 0, -1],
      [0.1, 0, 0],
      [0, 0, 0],
      [0, 0, 1],
      15,
    );
    expect(out[0]).toBeLessThan(0);
    expect(out[2]).toBeLessThan(0);
    expect(out[0] / Math.abs(out[2])).toBeCloseTo(-0.1 / 15, 10);
    const q = lensQ({ re: 0, im: 18000 }, 15);
    expect(waistFromQ(q).distance).toBeGreaterThan(0);
  });
  it("a tilted and decentered lens has a coupled 3D transverse kick", () => {
    const tilted = normalize([0.15, 0.1, 1]);
    const a = thinLensDirection(
        [0, 0, 1],
        [0.3, 0.1, 0],
        [0, 0, 0],
        tilted,
        15,
      ),
      b = thinLensDirection([0, 0, 1], [0.3, 0.1, 0], [0, 0, 0], [0, 0, 1], 15);
    expect(norm(sub(a, b))).toBeGreaterThan(0.0001);
    expect(norm(a)).toBeCloseTo(1, 14);
  });
  it("parallel glass adds reduced propagation length and a finite lateral shift", () => {
    const d = normalize([0.1, 0, 1]),
      pass = slabPass([0, 0, -20], d, [0, 0, 0], [0, 0, 1], 2, 1.5)!;
    nearVector(pass.direction, d);
    const bare = planeHit([0, 0, -20], d, [0, 0, 1], [0, 0, 1])!;
    expect(pass.exit[0]).toBeLessThan(bare.point[0]);
    expect(propagateQ({ re: 0, im: 10 }, pass.glassLength, 1.5).re).toBeCloseTo(
      pass.glassLength / 1.5,
      12,
    );
  });
});
describe("finite single-PBS loop and power", () => {
  it("contains one PBS with two independently traced encounters per beam", () => {
    const s = simulate(createConfiguration());
    expect(COMPONENTS.filter((c) => c.kind === "pbs")).toHaveLength(1);
    for (const b of [s.beams.A, s.beams.B]) {
      expect(b.blocked, b.warnings.join("; ")).toBe(false);
      expect(
        b.segments.filter(
          (x) => x.toId.includes("pbs:") && x.toId.endsWith(":coating"),
        ),
      ).toHaveLength(2);
      expect(b.returnDirection[0]).toBeLessThan(-0.999);
    }
  });
  it("has counter-propagating, nearly coincident nominal foci", () => {
    const s = simulate(createConfiguration());
    expect(s.angleMrad).toBeLessThan(1e-3);
    expect(s.separation).toBeLessThan(1e-8);
    expect(s.axialSeparation).toBeLessThan(0.001);
    expect(s.overlap).toBeGreaterThan(0.999);
    expect(s.beams.A.direction[0]).toBeLessThan(-0.999);
    expect(s.beams.B.direction[0]).toBeGreaterThan(0.999);
  });
  it("PBS reflected port rotates and transmitted port shifts without changing far-field angle", () => {
    const center: Vec3 = [0, 0, 0],
      origin: Vec3 = [0, 0, -50],
      d: Vec3 = [0, 0, 1];
    const r0 = cubePass(origin, d, center, 0, 0, 0, 12, 1.5, true)!,
      r1 = cubePass(origin, d, center, 0, 0.01, 0, 12, 1.5, true)!,
      t0 = cubePass(origin, d, center, 0, 0, 0, 12, 1.5, false)!,
      t1 = cubePass(origin, d, center, 0, 0.01, 0, 12, 1.5, false)!;
    expect(norm(sub(r1.direction, r0.direction))).toBeGreaterThan(0.01);
    nearVector(t1.direction, t0.direction);
    expect(norm(sub(t1.exit, t0.exit))).toBeGreaterThan(0.01);
  });
  it("PBS conserves power after the HWP aperture; input splitting sums to source power", () => {
    for (const degrees of [0, 11, 22.5, 35, 45]) {
      const c = createConfiguration();
      c.settings.hwpDegrees = degrees;
      const s = simulate(c);
      const initial = s.beams.A.segments[0].power + s.beams.B.segments[0].power;
      expect(initial).toBeCloseTo(c.settings.power, 14);
      for (const b of [s.beams.A, s.beams.B]) {
        const pbs = b.segments.filter(
          (x) => x.fromId.startsWith("pbs:1:") || x.toId.startsWith("pbs:1:"),
        );
        expect(pbs.every((x) => Math.abs(x.power - pbs[0].power) < 1e-14)).toBe(
          true,
        );
      }
      expect(s.beams.A.power + s.beams.B.power).toBeCloseTo(
        c.settings.power,
        4,
      );
    }
  });
  it("orthogonal polarizations sum intensities without a phase fringe", () => {
    for (const phase of [0, 0.1, Math.PI, 4])
      expect(combinedIntensity(2, 3, [0, 1, 0], [0, 0, 1], phase)).toBe(5);
    expect(combinedIntensity(2, 3, [0, 1, 0], [0, 1, 0], 0)).toBeGreaterThan(5);
  });
  it("honors supplied loop routes and diagnoses physically invalid paths", () => {
    const c = createConfiguration();
    c.routes = { A: [...DEFAULT_ROUTES.A], B: [...DEFAULT_ROUTES.B] };
    expect(simulate(c).beams.A.blocked).toBe(false);
    c.routes.A = ["a2", "a1"];
    expect(simulate(c).beams.A.blocked).toBe(true);
  });
});
describe("instruments, training and observability", () => {
  it("two crossing beams may overlap perfectly on one plane without being coaxial", () => {
    expect(gaussianOverlap(0, 1, 1)).toBe(1);
    expect(
      counterAngle(normalize([-1, 0, 0.01]), normalize([1, 0, 0.01])),
    ).toBeGreaterThan(0.019);
    const c = randomizeConfiguration(createConfiguration(), "crossing", 4),
      s = simulate(c);
    expect(s.separation).toBeLessThan(1e-5);
    expect(s.angleMrad).toBeGreaterThan(0.01);
  });
  it("two mirrors have four independent responses and can walk a beam to control position and angle", () => {
    const base = createConfiguration(),
      s = simulate(base),
      planes = getPlanes(s).filter((p) => p.id === "iris1" || p.id === "iris2");
    const read = (c: typeof base) =>
      planes.flatMap((p) => {
        const spot = measure(simulate(c), p).spots.A;
        return [spot.x, spot.y];
      });
    const initial = read(base),
      controls = [
        ["a1", "pitch"],
        ["a1", "yaw"],
        ["a2", "pitch"],
        ["a2", "yaw"],
      ] as [ComponentId, keyof Adjustment][];
    const columns = controls.map(([id, axis]) =>
      read(applyAdjustment(base, id, axis, 1)).map((v, i) => v - initial[i]),
    );
    const matrix = initial.map((_, i) => columns.map((c) => c[i]));
    expect(matrixRank(matrix)).toBe(4); // Solve measured finite-difference response, then apply a simultaneous corrective walk.
    const perturbed = createConfiguration();
    perturbed.hidden.a1.pitch = 0.3;
    perturbed.hidden.a1.yaw = -0.2;
    perturbed.hidden.a2.pitch = 0.15;
    perturbed.hidden.a2.yaw = 0.4;
    const error = read(perturbed),
      aug = matrix.map((r, i) => [...r, -error[i]]);
    for (let k = 0; k < 4; k++) {
      let pivot = k;
      for (let r = k + 1; r < 4; r++)
        if (Math.abs(aug[r][k]) > Math.abs(aug[pivot][k])) pivot = r;
      [aug[k], aug[pivot]] = [aug[pivot], aug[k]];
      const v = aug[k][k];
      for (let j = k; j <= 4; j++) aug[k][j] /= v;
      for (let r = 0; r < 4; r++)
        if (r !== k) {
          const f = aug[r][k];
          for (let j = k; j <= 4; j++) aug[r][j] -= f * aug[k][j];
        }
    }
    controls.forEach(
      ([id, axis], i) => (perturbed.adjustments[id][axis] = aug[i][4]),
    );
    expect(Math.hypot(...read(perturbed))).toBeLessThan(
      Math.hypot(...error) * 0.001,
    );
  });
  it("measurement isolates returned light and preserves wavelength and M² scaling", () => {
    const c = createConfiguration(),
      s = simulate(c),
      p = getPlanes(s).find((p) => p.id === "output")!,
      m = measure(s, p);
    expect(m.spots.A.valid && m.spots.B.valid).toBe(true);
    expect(m.spots.A.direction[0]).toBeLessThan(-0.999);
    expect(getPlanes(s).length).toBeGreaterThan(30);
    const none = measure(
      s,
      makePlane("missing", "Missing", [0, 1000, 0], [0, 1, 0]),
    );
    expect(none.spots.A.valid).toBe(false);
  });
  it("assistant identifies insufficient one-plane data and uses discrete accessible moves", () => {
    const c = randomizeConfiguration(createConfiguration(), "irises", 8),
      planes = getPlanes(simulate(c)).filter((p) => p.id === "iris1");
    const advice = suggestAdjustment(c, planes, "irises", "A")!;
    expect(advice.underdetermined).toBe(true);
    expect(advice.rank).toBeLessThanOrEqual(2);
    expect([-1, 0, 1]).toContain(advice.step);
    expect(["a1", "a2"]).toContain(advice.component);
    expect(["pitch", "yaw"]).toContain(advice.axis);
    expect(advice.explanation).toContain("second");
  });
  it("separated measurements make the relative coaxial objective observable", () => {
    const c = randomizeConfiguration(createConfiguration(), "coaxial", 8),
      planes = getPlanes(simulate(createConfiguration())).filter(
        (p) => p.id === "trap:-1" || p.id === "trap:1",
      );
    const advice = suggestAdjustment(c, planes, "coaxial")!;
    expect(advice.rank).toBe(4);
    expect(advice.underdetermined).toBe(false);
    expect(advice.explanation).toContain("cannot be identified uniquely");
  });
  it("three axial profile stations support a waist adjustment estimate", () => {
    const c = randomizeConfiguration(createConfiguration(), "waists", 8),
      planes = getPlanes(simulate(createConfiguration())).filter(
        (p) => p.id === "trap:-1" || p.id === "trap" || p.id === "trap:1",
      );
    const advice = suggestAdjustment(c, planes, "waists")!;
    expect(advice.rank).toBeGreaterThanOrEqual(5);
    expect(advice.underdetermined).toBe(false);
  });
  it("assistant improves a measured two-iris alignment without resetting hidden errors", () => {
    let c = randomizeConfiguration(createConfiguration(), "irises", 18);
    const hidden = JSON.stringify(c.hidden),
      planes = getPlanes(simulate(c)).filter(
        (p) => p.id === "iris1" || p.id === "iris2",
      );
    const first = suggestAdjustment(c, planes, "irises")!;
    for (let k = 0; k < 12; k++) {
      const a = suggestAdjustment(c, planes, "irises")!;
      if (!a.step) break;
      expect(a.scoreAfter).toBeLessThan(a.scoreBefore);
      c = applyAdjustment(
        c,
        a.component,
        a.axis,
        c.adjustments[a.component][a.axis] + a.step,
      );
    }
    const last = suggestAdjustment(c, planes, "irises")!;
    expect(last.scoreBefore).toBeLessThan(first.scoreBefore);
    expect(JSON.stringify(c.hidden)).toBe(hidden);
  });
  it("scenario seeds reproduce unknown errors and component reset preserves them", () => {
    const a = randomizeConfiguration(createConfiguration(), "waists", 91),
      b = randomizeConfiguration(createConfiguration(), "waists", 91);
    expect(a).toEqual(b);
    const changed = applyAdjustment(a, "a1", "yaw", 4),
      reset = resetComponent(changed, "a1");
    expect(reset.adjustments.a1.yaw).toBe(0);
    expect(reset.hidden).toEqual(a.hidden);
  });
});

describe("fixed observation coordinates", () => {
  it("measures a nonzero lens-relative centroid instead of moving the detector with the ray", () => {
    const nominal = simulate(createConfiguration());
    const moved = simulate(
      applyAdjustment(createConfiguration(), "a1", "yaw", 2),
    );
    const plane = getPlanes(nominal).find((p) => p.id === "A:before:la")!;
    expect(Math.abs(measure(moved, plane).spots.A.x)).toBeGreaterThan(0.01);
  });
  it("can measure the recombined field beyond the drawn output segment", () => {
    const sim = simulate(createConfiguration()),
      far = getPlanes(sim).find((p) => p.id === "far")!;
    expect(measure(sim, far).spots.A.valid).toBe(true);
    expect(measure(sim, far).spots.B.valid).toBe(true);
  });
});

describe("per-beam transverse frames", () => {
  it("keeps Gaussian coordinates and ideal polarization transverse on a tilted 3D path", () => {
    const sim = simulate(
      applyAdjustment(createConfiguration(), "a1", "pitch", 2),
    );
    for (const beam of Object.values(sim.beams))
      for (const segment of beam.segments) {
        const f = segment.coordinateFrame!;
        expect(norm(f.n)).toBeCloseTo(1, 12);
        expect(dot(f.u, f.n)).toBeCloseTo(0, 12);
        expect(dot(f.v, f.n)).toBeCloseTo(0, 12);
        expect(dot(segment.polarization!, segment.direction)).toBeCloseTo(
          0,
          12,
        );
      }
    expect(sim.beams.A.segments.some((s) => s.toId === "hwp")).toBe(true);
  });
});

describe("published reference layout", () => {
  it("traces both counter-propagating beams through the requested folded bench", () => {
    const sim = simulate(
      defaultSetup.configuration as unknown as Configuration,
    );
    expect(sim.beams.A.blocked).toBe(false);
    expect(sim.beams.B.blocked).toBe(false);
    expect(sim.separation).toBeLessThan(0.001);
    expect(sim.angleMrad).toBeLessThan(0.1);
    expect(sim.beams.A.segments.some((s) => s.toId === "iris1")).toBe(true);
    expect(sim.beams.B.segments.some((s) => s.toId === "a1")).toBe(true);
  });
});
