# Optical Bench — Dual-Beam Alignment Lab

A browser-based interactive optical alignment simulator built with React, TypeScript, Three.js / React Three Fiber, plus an optional Python NumPy/SciPy diffraction engine for local validation.

**Start by moving a mirror's pitch or yaw.** The chief rays, Gaussian envelopes, focal measurements, recombined output and hosted wave maps are calculated in the browser.

The published default bench is the editable setup supplied in `public/default-setup.json`. It is an illustrative optical model, not a reconstruction of CAD or a calibrated instrument.

## Use online

The GitHub Pages workflow in `.github/workflows/deploy-pages.yml` builds and publishes every push to `main`. After Pages is enabled with **GitHub Actions** as its source, the simulator is available at:

**https://niko-mech-phy.github.io/dual-beam-optical-alignment-simulator/**

The hosted simulator needs no installation or local server. Mode C uses a browser-native analytical Gaussian wave model. The optional Python solver remains available for local FFT diffraction validation.

To publish a redesigned bench as the site-wide default, arrange it in **Experiment → View & edit optical topology**, use **Advanced settings → Export JSON**, and replace `public/default-setup.json` with that exported file. Commit and push; every new visitor then loads that configuration.

**Image to setup** accepts a schematic image and an OpenAI API key supplied by the visitor. The browser sends that image directly to the OpenAI Responses API, previews inferred component positions and routes, and applies them only when the visitor chooses **Apply**. The key is held in the open dialog only. This importer maps a drawing onto the simulator's existing 15 component types; review and correct uncertain geometry and orientations in the topology editor. API usage may incur charges on the visitor's OpenAI account.

## Local quick start

The deliverable includes a production browser build in `dist/`. With Python 3.10+ installed, one command serves the application and the optional NumPy/SciPy API:

```bash
python3 python/server.py
```

Open **http://127.0.0.1:8765/** and keep the terminal open. Stop with **Ctrl+C**. On macOS, `Start Optical Bench.command` does the same thing and prefers a project-local `.venv` if present. Nothing is published or sent to a cloud service.

If Python dependencies are missing:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r python/requirements.txt
python3 python/server.py
```

Windows activation is `.venv\Scripts\activate`. On a new machine, installing packages requires internet access once; operation after installation is local. Fonts, icons and rendering assets are bundled locally.

### Develop or rebuild

Use Node.js **20.19+ or 22.12+**; this project was built with Node 24.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite (normally **http://127.0.0.1:5173/**). The complete hosted interface works without Python. Run `python3 python/server.py` separately only when developing against the optional FFT API.

```bash
npm run build       # TypeScript check and production build
npm test            # Browser-engine and instrument tests
python3 -m unittest discover -s python -v
npm run format      # Format the source with Prettier
```

A large Three.js bundle warning from Vite is informational. Production assets stay local. `WAVE_PORT` can change the optional Python server port; also update the Vite proxy when developing against a different port.

## A first alignment exercise

1. Choose **Real Lab → Two-iris beam walk**. All applied controls start at zero, while the setup contains seeded unknown mirror errors.
2. Select the **I1 · input beam** plane in the profiler and capture it. Capture **I2 · input beam** as well.
3. Select A1 or A2 and move pitch/yaw by one step. Each mirror rotates around its surface-center pivot. Read the centroids at both stations.
4. Use **Hint only** to calibrate a finite-difference response from the accessible measurements. **Apply next adjustment** makes one permitted move. **Auto demonstration** visibly moves the same controls and stops when no improving step is available.
5. Try **Find a common axis**. Capture two separated trap planes, such as −1 and +1 mm. The measured two-plane slopes distinguish displacement from angular mismatch.
6. Try **Overlap the waists**. Capture at least three axial planes, including the trap. The instruments fit `w²(z)` to estimate each waist. Move lens **local axial Z**; lens X/Y and pitch/yaw are unavailable in Real Lab.
7. Try **The crossing-beam trap**. The spots meet at one plane, but a second plane reveals their angular mismatch.

In Experiment mode, pitch, yaw, and roll allow exact values from −1000 to +1000 mount steps; the ruler offers 0.1-step fine and 10-step coarse arrow moves. Real Lab challenges still use bounded, discrete hidden errors and a measurement-based assistant. A stopped demonstration means that the current one-step search has reached a measurement or adjustment limit; it does not certify perfect alignment. The assistant explicitly reports insufficient independent measurements and nonunique possible causes.

Switching to Experiment or Wave optics reveals model truth. The Reveal solution button also ends the hidden-state exercise. The hidden state is not an adversarial security boundary: it remains inspectable in exported configurations and browser developer tools.

## Interface

- **Component list / 3D selection:** every mirror, lens, PBS, window, wave plate, source, iris, camera and output detector is selectable. The control panel shows fine/coarse angular controls, a draggable ruler and exact numeric entry.
- **Experiment:** ideal reset, individual reset, multiple simultaneous adjustments, baseline capture and before/after paths. Save/restore uses device-local storage; JSON export/import preserves settings, nominal geometry, hidden imperfections and user corrections separately.
- **Views:** mechanical, ray, Gaussian envelope and combined; perspective, top and trap camera presets; orbit, zoom and pan. Components are enlarged for legibility; envelopes have a disclosed 0.14 mm visibility floor. Instrument readings use physical, unexaggerated dimensions.
- **Profiler:** individual or combined intensities, centroid, 1/e² radius, power and orthogonal cross sections. Choose before/after each mirror or lens, trap positions, model waist positions (Experiment only), pre-recombination and near/far output planes. Add custom planes along the trap axis. Far output planes extrapolate the returned beam beyond the drawn detector.
- **Measured diagnostics:** two captured parallel planes estimate centroid slopes. Three distinct parallel stations fit a Gaussian width parabola for waist coordinate and radius. These estimates use readings, not hidden true axes or waist coordinates.
- **Virtual irises:** movable, non-intercepting alignment instruments by default. Their aperture display reports centroid clearance, not a claim that the entire Gaussian passes. Add an iris to a route to make it an intercepting aperture in the geometric clipping approximation.
- **Camera:** a test particle is on by default at the trap and supplies the scattering signal. Camera position and pointing determine its perspective projection; zoom, exposure, roll, image offset and optional sensor noise affect display. With no particle, the vacuum shows no scattering spot. The display gain is calibrated against the published default bench and preserves signal loss on misalignment. This is an illustrative PSF camera, not a calibrated scattering or microscope model.
- **Response matrix:** finite-difference effects of the selected adjustment on the next component, the focusing lens, the waist, direction and recombination. Pitch displays vertical response; yaw displays the other transverse response.
- **Advanced settings:** wavelength, input radius, M², focal length, step scales, glass index, cube size, power and iris radius. These calibrations are locked during an unrevealed Real Lab challenge.
- **Topology editor:** edit world component positions, exact surface/optical-axis normals, ±90° rotations about world X/Y/Z and 45° directions between world axes, and component traversal independently for both arms. Coarse installation orientation is stored separately from fine pitch/yaw mount steps. Physically invalid routes are diagnosed.
- **Onboarding:** the help button opens a four-step walkthrough.

## One PBS: the actual path assumption

World coordinates are in **millimeters**, with **Y vertical**, **Z the trap axis** and **X the other table coordinate** in the supplied default. Lens control “Z” is the lens's _local optical axis_, not necessarily world Z. A propagates toward +Z through the trap; B propagates toward −Z.

The input travels +Z along X=300, turns at A1 toward the half-wave plate, then reaches one cube at `(150, 0, 225)`. The lossless ideal PBS creates:

```text
Laser → I1 → I2 → A1 → HWP → SINGLE PBS

A, s: PBS reflection → B1 → B2 → LB → left window
      → TRAP → right window → LA → A2
      → SAME PBS reflection → common output

B, p: PBS transmission → A2 → LA → right window
      → TRAP → left window → LB → B2 → B1
      → SAME PBS transmission → common output
```

No second PBS and no hidden polarization-swapping wave plate are present. Polarization preservation sends both returning paths to the fourth port, rather than back toward the input laser.

| Component       | Nominal center, mm           |
| --------------- | ---------------------------- |
| A1              | `(300, 0, 225)`              |
| A2              | `(0, 0, 225)`                |
| B1              | `(150, 0, −150)`             |
| B2              | `(0, 0, −150)`               |
| LA / LB         | `(0, 0, 15)` / `(0, 0, −15)` |
| Windows         | `(0, 0, 5)` / `(0, 0, −5)`   |
| Trap            | `(0, 0, 0)`                  |
| Output profiler | `(150, 0, 300)`              |

The routes and geometry are editable and not constrained to this table.

## Physics models and interpretation

### Mode B: interactive geometric and Gaussian optics

- Chief rays intersect oriented planes in 3D. Mirrors obey `d_out = d_in − 2(d_in·n)n`; normals use right-handed mount yaw followed by intrinsic pitch. Components rotate about fixed center pivots.
- A finite cube traces entry refraction, one internal diagonal coating encounter and exit refraction, separately on both visits. Rotating the ideal parallel-face transmitted port produces lateral displacement; its emergent direction remains parallel in a uniform external medium. Reflected-port direction changes. Total internal reflection and missed faces are diagnosed.
- Parallel chamber windows use Snell refraction and reduced diffraction length `L/n`.
- Gaussian propagation uses a reduced-air q parameter: free space `q → q + L/n`, lens `q → q/(1−q/f)`. The effective M² Gaussian follows `w² = M² λ |q|²/(π Im(q))`, with `z_R = Im(q)` and waist displacement `−Re(q)` in each beam's own forward direction.
- Decentered/tilted lenses use the local lens plane and a first-order meridional oblique approximation. One scalar q does **not** resolve sagittal/tangential astigmatism, surface aberrations, finite lens thickness or high-NA vector focusing.
- The LA1540-C is an **equivalent f=15 mm thin lens**, not a catalog-exact prescription. Thorlabs specifies 12.7 mm diameter and 15 mm focal length. With 2.5 mm input 1/e² radius, the illuminated paraxial NA is approximately **0.167**, rather than an exact 0.20. [Thorlabs N-BK7 plano-convex lens catalog](https://punchout.thorlabs.com/newgrouppage9.cfm?objectgroup_id=3281&pn=LA1908-C).
- HWP angle θ gives powers `P_A=P sin²(2θ)` and `P_B=P cos²(2θ)`. The PBS uses ideal orthogonal channels, without extinction leakage, coating phase, Fresnel loss, ghost beams or full Jones transport through noncoplanar paths. The scalar readouts add orthogonal intensities without a false interference term.
- Finite apertures use a geometric Gaussian power estimate. Off-center clipping is an approximation and does not reshape q. Wave mode treats diffraction from an explicit boundary aperture.
- “Intensity-profile overlap” is `[∫√(I_A I_B) dA]²/(P_A P_B)`. It measures normalized spatial shape, not coherent coupling, net counterpropagating flux or trapping force. Axis mismatch and axial waist separation are independent diagnostics. Identical spots at one plane do not prove coaxiality.
- Profiler images are peak-normalized for visibility, with power in separate numerical readings. Gaussian tails can be present outside a centroid-cleared iris.

### Mode C: on-demand scalar angular spectrum

The Python engine propagates two near-waist Gaussian boundary fields independently with FFTs and `kz = sqrt(k²−kx²−ky²)`. Each beam retains its own longitudinal propagation sign. It supports a circular boundary aperture, astigmatism/coma/spherical phase screens, transverse/axial sections, angular far field, and orthogonal or optionally coherent parallel polarization. It is **not** a complete wave trace through every optomechanical surface or a vector electromagnetic solution.

Sampling warnings cover undersampled waists, tight nonparaxial boundaries, edge wrap-around, tilted-field aliasing, discarded evanescent content and unresolved λ/2 standing-wave fringes. Compare resolution and FOV before relying on fine structure. The coherent wave solver assumes M²=1; an effective M² radius inherited from Mode B is not a partially coherent beam model.

See `python/README.md` for the exact API, boundary definition, units and limitations. Browser wave coordinates `(x,y,z)` correspond to world `(Y,Z,X)`.

## Architecture

```text
src/physics/types.ts              Typed geometry, configurations, rays and measurements
src/physics/math.ts               Vector frames, rotations, Snell/reflection, q optics
src/physics/index.ts              Component graph, complete tracing, instruments,
                                 seeded scenarios and measurement-only assistant
src/components/OpticalScene.tsx   R3F scene, optomechanics, Gaussian envelopes
src/components/Profiler.tsx       Gaussian profiler and illustrative scattering camera
src/components/MeasuredDiagnostics.tsx  Instrument-derived angle and waist fits
src/components/WavePanel.tsx      On-demand browser wave controls and result maps
src/physics/browserWave.ts        Hosted analytical Gaussian wave calculation
src/components/ErrorBoundary.tsx WebGL failure isolation and retry
src/App.tsx                      Workspace, controls, training and topology editor
python/wave_engine.py            NumPy/SciPy scalar diffraction
python/server.py                 Loopback JSON API and built-app static server
```

Nominal geometry, hidden mechanical errors and visible user adjustments are separate configuration layers. The hosted application uses browser calculations throughout. Python is optional and runs on demand for local FFT studies. Saved JSON is validated before use.

## Verification

The automated suite covers mirror reflection and rotation order; 3D intersections; pivot behavior; Snell reversibility; free Gaussian propagation; lens focus translation, decenter and reverse traversal; glass path length; distinct PBS ports and repeated encounters; power; orthogonal intensity addition; crossing versus coaxial beams; two-mirror controllability; fixed instrument coordinates; seeded challenges; response observability; discrete assistant improvement; and instrument-derived waist/direction fits.

Python tests cover analytic Gaussian propagation, scalar power conservation, forward/backward reciprocity, counterpropagating phase, aperture transmission, orthogonal intensity addition, evanescent suppression, phase screens, overlap, validation and safe static paths.

The application was also exercised in a real browser: live mirror response, hidden-state mode, two-iris capture, finite-difference hints, visible automatic adjustment and a server-free hosted wave calculation. Numerical unit tests establish specific model invariants; they do not validate a real lens prescription or guarantee convergence for every edited topology.
