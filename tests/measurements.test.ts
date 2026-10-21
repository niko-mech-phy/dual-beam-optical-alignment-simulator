import { describe, it, expect } from "vitest";
import {
  createConfiguration,
  simulate,
  getPlanes,
  applyAdjustment,
} from "../src/physics";
import { estimateFromPlanes } from "../src/components/MeasuredDiagnostics";
describe("instrument-derived diagnostics", () => {
  it("fits waist position and size from three measured widths", () => {
    const sim = simulate(createConfiguration());
    const planes = getPlanes(sim).filter((p) =>
      ["trap:-1", "trap", "trap:1"].includes(p.id),
    );
    const result = estimateFromPlanes(sim, planes)!;
    for (const id of ["A", "B"] as const) {
      expect(result.beams[id].waist).toBeCloseTo(sim.beams[id].waist[0], 7);
      expect(result.beams[id].radius).toBeCloseTo(sim.beams[id].waistRadius, 7);
    }
  });
  it("estimates nonzero axis mismatch from two fixed planes", () => {
    const sim = simulate(
      applyAdjustment(createConfiguration(), "a1", "yaw", 1),
    );
    const nominal = simulate(createConfiguration());
    const planes = getPlanes(nominal).filter((p) =>
      ["trap:-1", "trap:1"].includes(p.id),
    );
    const result = estimateFromPlanes(sim, planes)!;
    expect(result.relative).toBeGreaterThan(1);
    expect(result.relative!).toBeCloseTo(sim.angleMrad, 2);
  });
  it("does not infer a waist or angle from one measurement", () => {
    const sim = simulate(createConfiguration());
    const result = estimateFromPlanes(
      sim,
      getPlanes(sim).filter((p) => p.id === "trap"),
    )!;
    expect(result.beams.A.angles).toBeNull();
    expect(result.beams.A.waist).toBeNull();
  });
});
