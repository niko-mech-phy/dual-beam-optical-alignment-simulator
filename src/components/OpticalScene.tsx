import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type {
  Component,
  ComponentId,
  Segment,
  Simulation,
  Vec3,
} from "../physics/types";

interface OpticalSceneProps {
  simulation: Simulation;
  selected: ComponentId;
  onSelect: (id: ComponentId) => void;
  view: "combined" | "mechanical" | "rays" | "envelopes";
  reference?: Simulation | null;
  showLabels: boolean;
  revealActual: boolean;
  cameraPreset: "perspective" | "top" | "trap";
  cameraReset?: number;
  particle: boolean;
  wavelengthNm?: number;
  visibleBeams?: "A" | "B" | "both";
}
const COLORS = { A: "#ff8a65", B: "#55e0c0" };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function faceQuaternion(normal: Vec3) {
  return new THREE.Quaternion().setFromUnitVectors(
    Z_AXIS,
    new THREE.Vector3(...normal).normalize(),
  );
}
function alongQuaternion(direction: Vec3) {
  return new THREE.Quaternion().setFromUnitVectors(
    Y_AXIS,
    new THREE.Vector3(...direction).normalize(),
  );
}

function Breadboard() {
  const holes = useRef<THREE.InstancedMesh>(null);
  const rim = useRef<THREE.InstancedMesh>(null);
  const holeGeometry = useMemo(
    () => new THREE.CylinderGeometry(1.35, 1.35, 0.4, 10),
    [],
  );
  const ringGeometry = useMemo(
    () => new THREE.TorusGeometry(1.6, 0.25, 4, 10),
    [],
  );
  const positions = useMemo(() => {
    const list: THREE.Vector3[] = [];
    for (let x = -320; x <= 320; x += 20)
      for (let z = -320; z <= 260; z += 20)
        list.push(new THREE.Vector3(x, -25.6, z));
    return list;
  }, []);
  useEffect(() => {
    const obj = new THREE.Object3D();
    positions.forEach((pos, i) => {
      obj.position.copy(pos);
      obj.rotation.set(0, 0, 0);
      obj.updateMatrix();
      holes.current?.setMatrixAt(i, obj.matrix);
      obj.rotation.x = -Math.PI / 2;
      obj.position.y += 0.22;
      obj.updateMatrix();
      rim.current?.setMatrixAt(i, obj.matrix);
    });
    if (holes.current) holes.current.instanceMatrix.needsUpdate = true;
    if (rim.current) rim.current.instanceMatrix.needsUpdate = true;
  }, [positions]);
  return (
    <group>
      <mesh position={[0, -32, -30]} receiveShadow>
        <boxGeometry args={[680, 12, 620]} />
        <meshStandardMaterial
          color="#172326"
          metalness={0.75}
          roughness={0.52}
        />
      </mesh>
      <mesh position={[0, -39.5, -30]}>
        <boxGeometry args={[675, 3, 615]} />
        <meshStandardMaterial
          color="#0a1113"
          metalness={0.85}
          roughness={0.35}
        />
      </mesh>
      <instancedMesh
        ref={holes}
        args={[holeGeometry, undefined, positions.length]}
      >
        <meshBasicMaterial color="#070d10" />
      </instancedMesh>
      <instancedMesh
        ref={rim}
        args={[ringGeometry, undefined, positions.length]}
      >
        <meshStandardMaterial color="#344247" metalness={0.7} roughness={0.6} />
      </instancedMesh>
      {[-325, 325].map((x) =>
        [-325, 265].map((z) => (
          <mesh
            key={`${x}${z}`}
            position={[x, -24.8, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[2.4, 4, 20]} />
            <meshStandardMaterial
              color="#617177"
              metalness={0.9}
              roughness={0.3}
            />
          </mesh>
        )),
      )}
    </group>
  );
}
function Post({ small = false }: { small?: boolean }) {
  return (
    <group>
      <mesh position={[0, -22.5, 0]} castShadow>
        <boxGeometry args={small ? [14, 5, 15] : [32, 5, 29]} />
        <meshStandardMaterial
          color="#20292f"
          metalness={0.85}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, small ? -16 : -13, 0]} castShadow>
        <cylinderGeometry
          args={[small ? 2.4 : 4, small ? 2.4 : 4, small ? 10 : 16, 20]}
        />
        <meshStandardMaterial
          color="#7e8c92"
          metalness={0.95}
          roughness={0.22}
        />
      </mesh>
      {!small && (
        <mesh position={[0, -18, 0]}>
          <cylinderGeometry args={[6, 6, 7, 20]} />
          <meshStandardMaterial
            color="#222d34"
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>
      )}
    </group>
  );
}
function Screws({ color = "#929da2" }: { color?: string }) {
  return (
    <>
      {[
        [-12, 10],
        [12, 10],
        [-12, -10],
      ].map(([x, y], i) => (
        <group key={i} position={[x, y, -6]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[2.7, 2.7, 7, 12]} />
            <meshStandardMaterial
              color={color}
              metalness={0.85}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, 0, -3.6]}>
            <boxGeometry args={[2.8, 0.5, 0.3]} />
            <meshBasicMaterial color="#263035" />
          </mesh>
        </group>
      ))}
    </>
  );
}
function Mirror({ accent }: { accent: string }) {
  return (
    <>
      <mesh position={[0, 0, -2]} castShadow>
        <boxGeometry args={[31, 29, 5]} />
        <meshStandardMaterial
          color="#313c43"
          metalness={0.85}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0, 1]}>
        <torusGeometry args={[11, 2, 8, 40]} />
        <meshStandardMaterial
          color="#879298"
          metalness={0.94}
          roughness={0.18}
        />
      </mesh>
      <mesh position={[0, 0, 1.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[10.4, 10.4, 1.4, 40]} />
        <meshStandardMaterial
          color="#b4c6d2"
          emissive={accent}
          emissiveIntensity={0.05}
          metalness={1}
          roughness={0.08}
        />
      </mesh>
      <Screws />
    </>
  );
}
function Lens({ window = false }: { window?: boolean }) {
  return (
    <>
      <mesh castShadow>
        <torusGeometry args={[window ? 8 : 10.1, window ? 1.1 : 2, 10, 40]} />
        <meshStandardMaterial
          color={window ? "#63777e" : "#263a44"}
          metalness={0.92}
          roughness={0.2}
        />
      </mesh>
      <mesh
        scale={[window ? 7.1 : 9.1, window ? 7.1 : 9.1, window ? 0.55 : 2.1]}
      >
        <sphereGeometry args={[1, 28, 16]} />
        <meshPhysicalMaterial
          color="#a3dce2"
          transparent
          opacity={window ? 0.19 : 0.28}
          roughness={0.06}
          metalness={0.15}
          transmission={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {!window && (
        <mesh position={[0, -12, 0]} castShadow>
          <boxGeometry args={[7, 5, 6]} />
          <meshStandardMaterial
            color="#2d414a"
            metalness={0.8}
            roughness={0.35}
          />
        </mesh>
      )}
    </>
  );
}
function Iris({ aperture }: { aperture: number }) {
  const open = Math.max(0.3, Math.min(aperture / 2, 10));
  return (
    <>
      <mesh castShadow>
        <ringGeometry args={[open, 13, 40]} />
        <meshStandardMaterial
          color="#1b2c34"
          metalness={0.85}
          roughness={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <torusGeometry args={[13, 1.4, 8, 40]} />
        <meshStandardMaterial color="#6a7b84" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh>
        <torusGeometry args={[open, 0.3, 6, 32]} />
        <meshStandardMaterial
          color="#b3bbb5"
          metalness={0.8}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[11, 9, 0]}>
        <boxGeometry args={[6, 2, 2]} />
        <meshStandardMaterial
          color="#697b83"
          metalness={0.85}
          roughness={0.3}
        />
      </mesh>
    </>
  );
}
function PBS() {
  return (
    <>
      <mesh position={[0, -12.5, 0]} castShadow>
        <boxGeometry args={[28, 5, 28]} />
        <meshStandardMaterial
          color="#384951"
          metalness={0.8}
          roughness={0.28}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[20, 20, 20]} />
        <meshPhysicalMaterial
          color="#84bbd3"
          roughness={0.08}
          metalness={0.2}
          transparent
          opacity={0.25}
          depthWrite={false}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(20, 20, 20)]} />
        <lineBasicMaterial color="#97d8e7" transparent opacity={0.64} />
      </lineSegments>
      <mesh rotation={[0, -Math.PI / 4, 0]}>
        <planeGeometry args={[28.2, 19.5]} />
        <meshPhysicalMaterial
          color="#b7a4dd"
          transparent
          opacity={0.33}
          metalness={0.5}
          roughness={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
function Instrument({ kind }: { kind: "laser" | "camera" | "detector" }) {
  if (kind === "laser")
    return (
      <group>
        <mesh position={[0, 0, -12]} castShadow>
          <boxGeometry args={[29, 24, 46]} />
          <meshStandardMaterial
            color="#384951"
            metalness={0.78}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 0, 12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[7, 8, 8, 24]} />
          <meshStandardMaterial
            color="#0b151c"
            metalness={0.8}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, 0, 16.2]}>
          <circleGeometry args={[4, 24]} />
          <meshStandardMaterial
            color="#ffe3a4"
            emissive="#e3a252"
            emissiveIntensity={0.7}
          />
        </mesh>
        {[-8, -4, 0, 4, 8].map((x) => (
          <mesh key={x} position={[x, 12.4, -14]}>
            <boxGeometry args={[1.4, 1.4, 32]} />
            <meshStandardMaterial
              color="#111f27"
              metalness={0.8}
              roughness={0.4}
            />
          </mesh>
        ))}
        <mesh position={[10, 7, 11.2]}>
          <sphereGeometry args={[1.4, 12, 8]} />
          <meshBasicMaterial color="#65e2ad" />
        </mesh>
      </group>
    );
  if (kind === "camera")
    return (
      <group>
        <mesh position={[0, 0, -8]} castShadow>
          <boxGeometry args={[25, 21, 21]} />
          <meshStandardMaterial
            color="#35404c"
            metalness={0.8}
            roughness={0.34}
          />
        </mesh>
        <mesh position={[0, 0, 6]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[9, 9, 13, 24]} />
          <meshStandardMaterial
            color="#111c26"
            metalness={0.8}
            roughness={0.32}
          />
        </mesh>
        <mesh position={[0, 0, 13]}>
          <circleGeometry args={[7, 28]} />
          <meshStandardMaterial
            color="#416d8a"
            metalness={0.95}
            roughness={0.06}
          />
        </mesh>
        <mesh position={[10, 6, 2.8]}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color="#72aef7" />
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[27, 27, 7]} />
        <meshStandardMaterial
          color="#263d47"
          metalness={0.8}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0, 3.6]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial
          color="#07181a"
          emissive="#2a8b7d"
          emissiveIntensity={0.15}
          roughness={0.4}
        />
      </mesh>
      <Line
        points={[
          [-10, 0, 3.7],
          [10, 0, 3.7],
        ]}
        color="#5ca89d"
        transparent
        opacity={0.3}
        lineWidth={0.6}
      />
      <Line
        points={[
          [0, -10, 3.7],
          [0, 10, 3.7],
        ]}
        color="#5ca89d"
        transparent
        opacity={0.3}
        lineWidth={0.6}
      />
    </group>
  );
}

const LABEL_OFFSETS: Partial<Record<ComponentId, Vec3>> = {
  la: [35, 43, -13],
  lb: [-35, 43, -13],
  wa: [12, 28, 25],
  wb: [-12, 28, 25],
  pbs: [0, 36, 0],
  laser: [0, 30, -20],
  iris1: [0, 30, 0],
  iris2: [0, 30, 0],
};
function ComponentModel({
  component: c,
  selected,
  onSelect,
  showLabels,
  faint,
}: {
  component: Component;
  selected: boolean;
  onSelect: OpticalSceneProps["onSelect"];
  showLabels: boolean;
  faint: boolean;
}) {
  const color = c.beam ? COLORS[c.beam] : "#b5c8d5";
  const orientation = useMemo(
    () =>
      c.kind === "pbs"
        ? new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(-1, 0, 1).normalize(),
            new THREE.Vector3(...c.normal).normalize(),
          )
        : faceQuaternion(c.normal),
    [c.normal, c.kind],
  );
  const small = c.kind === "lens" || c.kind === "window" || c.kind === "hwp";
  const offset = LABEL_OFFSETS[c.id] ?? [0, 34, 0];
  return (
    <group
      position={c.position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(c.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {!faint && (
        <>
          {c.kind === "camera" ? (
            <group>
              <mesh position={[35, -(c.position[1] + 25) / 2, 0]} castShadow>
                <cylinderGeometry
                  args={[3, 3, Math.max(5, c.position[1] + 25), 16]}
                />
                <meshStandardMaterial
                  color="#5e737f"
                  metalness={0.9}
                  roughness={0.25}
                />
              </mesh>
              <mesh position={[17.5, 0, 0]} castShadow>
                <boxGeometry args={[35, 5, 6]} />
                <meshStandardMaterial
                  color="#3c515e"
                  metalness={0.8}
                  roughness={0.3}
                />
              </mesh>
              <mesh position={[35, -c.position[1] - 22, 0]}>
                <boxGeometry args={[25, 5, 25]} />
                <meshStandardMaterial
                  color="#263640"
                  metalness={0.85}
                  roughness={0.3}
                />
              </mesh>
            </group>
          ) : (
            <Post small={small} />
          )}
          {selected && (
            <mesh position={[0, -24.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[small ? 15 : 23, small ? 15.7 : 23.7, 64]} />
              <meshBasicMaterial color="#8abffd" transparent opacity={0.9} />
            </mesh>
          )}
          <group quaternion={orientation}>
            {c.kind === "mirror" && <Mirror accent={color} />}
            {c.kind === "lens" && <Lens />}
            {c.kind === "window" && <Lens window />}
            {c.kind === "iris" && <Iris aperture={c.aperture} />}
            {c.kind === "pbs" && <PBS />}
            {c.kind === "hwp" && (
              <>
                <Lens />
                <mesh rotation={[0, 0, Math.PI / 4]}>
                  <torusGeometry args={[11.7, 0.5, 8, 32]} />
                  <meshStandardMaterial
                    color="#b194cd"
                    metalness={0.65}
                    roughness={0.3}
                  />
                </mesh>
              </>
            )}
            {(c.kind === "laser" ||
              c.kind === "camera" ||
              c.kind === "detector") && <Instrument kind={c.kind} />}
          </group>
        </>
      )}
      {faint && (
        <mesh>
          <sphereGeometry args={[4.5, 16, 12]} />
          <meshBasicMaterial
            color={selected ? "#91bfff" : "#5b717c"}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      {(showLabels || selected) && (
        <Html
          position={offset}
          center
          zIndexRange={[12, 0]}
          style={{ pointerEvents: "auto" }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(c.id);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
              padding: selected ? "5px 9px" : "4px 7px",
              background: selected
                ? "rgba(31,54,69,.95)"
                : "rgba(10,22,28,.83)",
              color: selected ? "#e3f0fc" : "#a7bdc6",
              border: `1px solid ${selected ? "#7db9e0" : "rgba(128,159,170,.18)"}`,
              borderRadius: 5,
              font: "500 10px/1.2 Inter, system-ui, sans-serif",
              cursor: "pointer",
              boxShadow: "0 2px 8px #0002",
            }}
          >
            {c.beam && (
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: color,
                }}
              />
            )}
            {c.short}
          </button>
        </Html>
      )}
    </group>
  );
}
function envelopeGeometry(segment: Segment, wavelengthNm: number) {
  const axis = new THREE.Vector3(...segment.direction).normalize();
  const transverse =
    Math.abs(axis.y) > 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
  const u = transverse.cross(axis).normalize();
  const v = axis.clone().cross(u).normalize();
  const from = new THREE.Vector3(...segment.from);
  const to = new THREE.Vector3(...segment.to);
  const rings = 24,
    sides = 16;
  const vertices: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const qre =
      segment.q.re + (segment.length * t) / (segment.refractiveIndex ?? 1);
    const qim = Math.max(1e-8, segment.q.im);
    const radius = Math.min(
      60,
      Math.max(
        0.14,
        Math.sqrt(
          (wavelengthNm * 1e-6 * (qre * qre + qim * qim)) / (Math.PI * qim),
        ),
      ),
    );
    const center = from.clone().lerp(to, t);
    for (let j = 0; j <= sides; j++) {
      const theta = (j / sides) * Math.PI * 2;
      const p = center
        .clone()
        .addScaledVector(u, radius * Math.cos(theta))
        .addScaledVector(v, radius * Math.sin(theta));
      vertices.push(p.x, p.y, p.z);
      if (i < rings && j < sides) {
        const a = i * (sides + 1) + j,
          b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function BeamSegment({
  segment,
  envelope,
  ray,
  reference = false,
  wavelengthNm,
}: {
  segment: Segment;
  envelope: boolean;
  ray: boolean;
  reference?: boolean;
  wavelengthNm: number;
}) {
  const geometry = useMemo(
    () => envelopeGeometry(segment, wavelengthNm),
    [segment, wavelengthNm],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = reference ? "#9caeb8" : COLORS[segment.beam];
  const midpoint = new THREE.Vector3(...segment.from).lerp(
    new THREE.Vector3(...segment.to),
    0.55,
  );
  const quaternion = alongQuaternion(segment.direction);
  const powerAlpha = Math.max(
    0.25,
    Math.min(1, Math.sqrt(Math.max(0, segment.power))),
  );
  if (segment.power < 1e-8) return null;
  return (
    <group>
      {envelope && !reference && (
        <mesh geometry={geometry} renderOrder={2}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.13 * powerAlpha}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
      {(ray || reference) && (
        <Line
          points={[segment.from, segment.to]}
          color={color}
          lineWidth={reference ? 0.9 : segment.beam === "A" ? 2 : 1.15}
          transparent
          opacity={reference ? 0.34 : 0.85 * powerAlpha}
          dashed={reference}
          dashSize={4}
          gapSize={4}
          depthWrite={false}
        />
      )}
      {envelope && !ray && !reference && (
        <Line
          points={[segment.from, segment.to]}
          color={color}
          lineWidth={0.65}
          transparent
          opacity={0.45 * powerAlpha}
          depthWrite={false}
        />
      )}
      {ray && !reference && segment.length > 55 && (
        <mesh position={midpoint} quaternion={quaternion}>
          <coneGeometry args={[1.7, 5, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} />
        </mesh>
      )}
    </group>
  );
}
function Trap({
  particle,
  showLabels,
}: {
  particle: boolean;
  showLabels: boolean;
}) {
  return (
    <group>
      <mesh position={[0, -22, 0]} receiveShadow>
        <boxGeometry args={[47, 5, 48]} />
        <meshStandardMaterial
          color="#41565e"
          metalness={0.85}
          roughness={0.25}
        />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[9, 9, 10, 32, 1, true]} />
        <meshPhysicalMaterial
          color="#72b9c5"
          transparent
          opacity={0.1}
          roughness={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[
          [-6, 0, 0],
          [6, 0, 0],
        ]}
        color="#d1e7ed"
        transparent
        opacity={0.35}
        lineWidth={0.5}
      />
      <Line
        points={[
          [0, -6, 0],
          [0, 6, 0],
        ]}
        color="#d1e7ed"
        transparent
        opacity={0.35}
        lineWidth={0.5}
      />
      {particle && (
        <mesh>
          <sphereGeometry args={[0.9, 20, 12]} />
          <meshStandardMaterial
            color="#fff6d7"
            emissive="#ffe1a1"
            emissiveIntensity={1.6}
            metalness={0.15}
            roughness={0.18}
          />
        </mesh>
      )}
      {showLabels && (
        <Html
          position={[0, 47, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none" }}
        >
          <span
            style={{
              color: "#d5e5e9",
              font: "500 9px Inter, system-ui, sans-serif",
              letterSpacing: "1.3px",
              whiteSpace: "nowrap",
              textShadow: "0 2px 8px #000",
            }}
          >
            TRAPPING REGION
          </span>
        </Html>
      )}
    </group>
  );
}
function Waist({
  point,
  direction,
  color,
}: {
  point: Vec3;
  direction: Vec3;
  color: string;
}) {
  return (
    <group position={point} quaternion={faceQuaternion(direction)}>
      <mesh>
        <torusGeometry args={[color === COLORS.A ? 3.2 : 2.6, 0.12, 6, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.32, 12, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}
function CameraRig({
  preset,
  reset,
}: {
  preset: OpticalSceneProps["cameraPreset"];
  reset?: number;
}) {
  const { camera, invalidate } = useThree();
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const target =
      preset === "trap"
        ? new THREE.Vector3(0, 0, 0)
        : new THREE.Vector3(0, -6, -35);
    const position =
      preset === "top"
        ? new THREE.Vector3(0, 760, -34.99)
        : preset === "trap"
          ? new THREE.Vector3(74, 50, 87)
          : new THREE.Vector3(530, 460, 560);
    camera.position.copy(position);
    if (preset === "top") camera.up.set(0, 0, -1);
    else camera.up.set(0, 1, 0);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
    invalidate();
  }, [preset, reset, camera, invalidate]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={35}
      maxDistance={1250}
      maxPolarAngle={Math.PI * 0.49}
      target={[0, -6, -35]}
    />
  );
}
function World(props: OpticalSceneProps) {
  const {
    simulation,
    reference,
    selected,
    onSelect,
    showLabels,
    view,
    particle,
    revealActual,
    cameraPreset,
  } = props;
  const wavelengthNm =
    (props.wavelengthNm ?? simulation.wavelengthNm ?? 1064) *
    (simulation.m2 ?? 1);
  const mechanical = view === "combined" || view === "mechanical";
  const envelope = view === "combined" || view === "envelopes";
  const ray = view === "combined" || view === "rays";
  return (
    <>
      <color attach="background" args={["#0a141b"]} />
      <fog attach="fog" args={["#0a141b", 1000, 1900]} />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#bfdfed", "#263239", 1.5]} />
      <directionalLight
        position={[200, 400, 80]}
        intensity={3}
        color="#d6edf9"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-380}
        shadow-camera-right={380}
        shadow-camera-top={350}
        shadow-camera-bottom={-350}
        shadow-camera-near={20}
        shadow-camera-far={1000}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={[-300, 150, -220]}
        intensity={1.7}
        color="#6baeb5"
      />
      <pointLight
        position={[250, 100, -150]}
        intensity={4500}
        distance={800}
        decay={2}
        color="#ffc7a8"
      />
      <Breadboard />
      <Trap particle={particle} showLabels={showLabels} />
      {simulation.components.map((component) => (
        <ComponentModel
          key={component.id}
          component={component}
          selected={selected === component.id}
          onSelect={onSelect}
          showLabels={showLabels}
          faint={!mechanical}
        />
      ))}
      {view !== "mechanical" &&
        (["A", "B"] as const)
          .filter(
            (beam) =>
              !props.visibleBeams ||
              props.visibleBeams === "both" ||
              props.visibleBeams === beam,
          )
          .map((beam) => (
            <group key={beam}>
              {reference?.beams[beam].segments.map((segment, i) => (
                <BeamSegment
                  key={`ref-${i}`}
                  segment={segment}
                  envelope={false}
                  ray
                  reference
                  wavelengthNm={wavelengthNm}
                />
              ))}
              {simulation.beams[beam].segments.map((segment, i) => (
                <BeamSegment
                  key={i}
                  segment={segment}
                  envelope={envelope}
                  ray={ray}
                  wavelengthNm={wavelengthNm}
                />
              ))}
              {revealActual && (
                <Waist
                  point={simulation.beams[beam].waist}
                  direction={simulation.beams[beam].direction}
                  color={COLORS[beam]}
                />
              )}
            </group>
          ))}
      <CameraRig preset={cameraPreset} reset={props.cameraReset} />
    </>
  );
}
export default function OpticalScene(props: OpticalSceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.7]}
      frameloop="demand"
      camera={{ position: [530, 460, 560], fov: 43, near: 0.1, far: 2400 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  );
}
