import { useMemo } from "react";
import { measure, dot, add, sub, scale } from "../physics";
import type { BeamId, Plane, Simulation, Vec3 } from "../physics";
/** These estimates use instrument centroids and widths only, never true beam axes or waist coordinates. */
export function estimateFromPlanes(sim: Simulation, planes: Plane[]) {
  const base = planes[0];
  if (!base) return null;
  const parallel = planes.filter(
    (p) => Math.abs(dot(base.normal, p.normal)) > 0.9999,
  );
  const records = parallel.map((plane) => ({
    plane,
    measurement: measure(sim, plane),
    z: dot(plane.point, base.normal),
  }));
  const result = Object.fromEntries(
    (["A", "B"] as const).map((id) => {
      const samples = records
        .filter((r) => r.measurement.spots[id].valid)
        .sort((a, b) => a.z - b.z);
      let angles: [number, number] | null = null,
        waist: number | null = null,
        radius: number | null = null;
      if (samples.length >= 2) {
        const first = samples[0],
          last = samples[samples.length - 1];
        const position = (r: typeof first): Vec3 =>
          add(
            r.plane.point,
            add(
              scale(r.plane.u, r.measurement.spots[id].x),
              scale(r.plane.v, r.measurement.spots[id].y),
            ),
          );
        const delta = sub(position(last), position(first)),
          length = dot(delta, base.normal);
        if (Math.abs(length) > 1e-6)
          angles = [
            (dot(delta, base.u) / length) * 1000,
            (dot(delta, base.v) / length) * 1000,
          ];
      }
      // Fit w²(z)=a z²+b z+c to three distinct axial stations.
      const unique = samples.filter(
        (r, i) => i === 0 || Math.abs(r.z - samples[i - 1].z) > 1e-6,
      );
      if (unique.length >= 3) {
        const three = [
          unique[0],
          unique[Math.floor((unique.length - 1) / 2)],
          unique[unique.length - 1],
        ];
        const origin = three[1].z;
        const rows = three.map((r) => {
          const z = r.z - origin;
          return [z * z, z, 1, r.measurement.spots[id].radius ** 2];
        });
        let good = true;
        for (let k = 0; k < 3; k++) {
          let p = k;
          for (let i = k + 1; i < 3; i++)
            if (Math.abs(rows[i][k]) > Math.abs(rows[p][k])) p = i;
          [rows[p], rows[k]] = [rows[k], rows[p]];
          const d = rows[k][k];
          if (Math.abs(d) < 1e-15) {
            good = false;
            break;
          }
          for (let j = k; j < 4; j++) rows[k][j] /= d;
          for (let i = 0; i < 3; i++)
            if (i !== k) {
              const f = rows[i][k];
              for (let j = k; j < 4; j++) rows[i][j] -= f * rows[k][j];
            }
        }
        if (good) {
          const [a, b, c] = rows.map((r) => r[3]);
          const min = c - (b * b) / (4 * a);
          if (a > 1e-15 && min > 0) {
            waist = origin - b / (2 * a);
            radius = Math.sqrt(min);
          }
        }
      }
      return [id, { angles, waist, radius, count: samples.length }];
    }),
  ) as Record<
    BeamId,
    {
      angles: [number, number] | null;
      waist: number | null;
      radius: number | null;
      count: number;
    }
  >;
  const relative =
    result.A.angles && result.B.angles
      ? Math.hypot(
          result.A.angles[0] - result.B.angles[0],
          result.A.angles[1] - result.B.angles[1],
        )
      : null;
  return { beams: result, relative, base };
}
export default function MeasuredDiagnostics({
  simulation,
  planes,
}: {
  simulation: Simulation;
  planes: Plane[];
}) {
  const estimates = useMemo(
    () => estimateFromPlanes(simulation, planes),
    [simulation, planes],
  );
  if (!estimates || planes.length < 2) return null;
  return (
    <div className="measured-diagnostics">
      <span className="eyebrow">FROM CAPTURED PLANES</span>
      {(["A", "B"] as const).map((id) => {
        const b = estimates.beams[id];
        if (!b.angles) return null;
        return (
          <div key={id}>
            <b style={{ color: id === "A" ? "#ff9875" : "#59dec0" }}>
              Beam {id}
            </b>
            <span>θu / θv</span>
            <strong>
              {b.angles.map((v) => v.toFixed(3)).join(" / ")} mrad
            </strong>
            {b.waist !== null && (
              <>
                <span>Fitted waist coordinate</span>
                <strong>{(b.waist * 1000).toFixed(2)} µm</strong>
                <span>Fitted waist radius</span>
                <strong>{(b.radius! * 1000).toFixed(2)} µm</strong>
              </>
            )}
          </div>
        );
      })}
      {estimates.relative !== null && (
        <p>
          Relative axis mismatch <b>{estimates.relative.toFixed(3)} mrad</b>
        </p>
      )}
      <small>
        Centroid slopes between parallel stations; waist fits require three
        widths. Axial coordinates are along the first plane’s normal. No hidden
        geometry is used.
      </small>
    </div>
  );
}
