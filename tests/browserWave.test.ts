import { describe, expect, it } from "vitest";
import {
  calculateBrowserWave,
  type BrowserWavePayload,
} from "../src/physics/browserWave";

const payload: BrowserWavePayload = {
  grid_size: 128,
  wavelength_um: 1.064,
  window_um: 40,
  z_range_um: 100,
  plane_z_um: 0,
  z_slices: 17,
  aperture_radius_um: 0,
  aberrations: { astigmatism: 0, coma: 0, spherical: 0 },
  polarization: "orthogonal",
  relative_phase: 0,
  beams: [
    { waist_um: 4, center_um: [0, 0, 0], direction: [0, 0, 1], power_mw: 1 },
    { waist_um: 4, center_um: [0, 0, 0], direction: [0, 0, -1], power_mw: 1 },
  ],
};

describe("browser wave model", () => {
  it("produces normalized maps and full overlap for identical beams", () => {
    const result = calculateBrowserWave(payload);
    expect(result.xy).toHaveLength(128);
    expect(result.xz).toHaveLength(17);
    expect(Math.max(...result.xy.flat())).toBeCloseTo(1, 8);
    expect(result.metrics.overlap).toBeCloseTo(1, 4);
    expect(result.metrics.transmission).toBeCloseTo(1, 3);
  });

  it("reports reduced power when an input aperture clips the beams", () => {
    const open = calculateBrowserWave(payload);
    const clipped = calculateBrowserWave({ ...payload, aperture_radius_um: 2 });
    expect(clipped.metrics.transmission).toBeLessThan(
      open.metrics.transmission,
    );
    expect(clipped.metrics.transmission).toBeGreaterThan(0);
  });
});
