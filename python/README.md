# Local scalar wave engine

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r python/requirements.txt
python3 python/server.py
```

In a second terminal run `npm run dev`. Vite proxies `/api` to `127.0.0.1:8765`.
The Python server binds only to loopback and performs no network requests. No
cloud account or API key is needed. The browser interactive ray/Gaussian model
does not call Python; the **Run wave calculation** button does.

Run verification with:

```bash
python3 -m unittest discover -s python -v
```

## Model and coordinates

The boundary of each beam is a coherent scalar Gaussian field at its own
near-waist transverse plane. The browser supplies independently traced waist
positions, radii, ray directions and powers. These fields are propagated on a
common Cartesian grid using SciPy FFTs and the exact propagating scalar
angular spectrum `kz = sqrt(k² − kx² − ky²)`.

Internal lengths are µm, input powers mW, intensity mW/µm². Local wave
coordinates `(x,y,z)` map to browser world `(Y,Z,X)`. Beam A travels toward
negative z; beam B toward positive z. The transfer function is
`exp(i sign(direction.z) kz (z − z_boundary))`. Each input phase is zero at its
own waist center before an optional boundary phase screen; the user phase is
then added to beam B. Thus coherent counterpropagating waves accumulate
opposite longitudinal phases. Orthogonal polarization adds intensities and
cannot create interference fringes.

The common centered circular clipping aperture acts independently at the
two near-waist input boundaries. It is an exploratory stop, **not** a simulated
physical lens pupil or a second stop in the ray-traced apparatus. The selected
aberrations are scalar phase screens at those boundaries, applied to both
beams. Their unnormalized polynomial phase (in radians) is
`2π [a(u²−v²) + c(3r²−2)u + s(6r⁴−6r²+1)]`, where `r²=u²+v²`.
The coordinate scale is the selected aperture radius; with an open aperture
each beam uses twice its own waist radius. Coefficients are waves, not RMS
wavefront error. No aberration is inferred from a proprietary lens prescription.

Overlap is the squared normalized integral of √(I_A I_B), matching the Gaussian mode’s intensity-profile overlap. It excludes phase, polarization mismatch, and angular mismatch; inspect direction and axial scans separately.

The XY panel is an intensity plane, XZ is the central `y=0` section, and profiles
are central sections. The far field is the incoherent sum of the independent
beam angular spectra, with axes in direction cosines. Opposite far-field
output channels are kept conceptually distinct even when parallel polarization
is selected. Each image is independently peak-normalized; the display is not
an absolute radiometric instrument. The log option uses `log10(1+999 I)/3`.

## Numerical and physical limits

- Scalar monochromatic diffraction; no vectorial high-NA focusing, near-field
  material response, chromatic dispersion, scattering, optical forces or
  full-train wave propagation. This is **not** a full electromagnetic solution.
- Gaussian boundaries are paraxial and M² = 1 in this coherent engine. Effective
  radii from the browser can be inherited, but general M² requires a partial
  coherence or multimode model. Large tilt and tight waists need a better input
  field even though propagation uses exact scalar kz.
- Evanescent modes are discarded, including at zero propagation distance.
  Reverse propagation is reciprocal for propagating modes, never amplifies
  evanescent modes, and cannot reconstruct discarded near-field information.
- FFT propagation is periodic. FOV truncation and wrap-around can invalidate
  a result. Warnings flag waist sampling, transverse tilt aliasing, edge power,
  evanescent removal and unresolved axial standing-wave fringes. Compare
  increasing resolution and FOV before interpreting fine details.
- Parallel coherent counterpropagating beams have λ/2 axial fringes. The 65
  axial samples normally underresolve these fringes; the UI flags this, and
  offers a tiny axial range to examine them. Orthogonal mode is the default.
- Power retained is `P_A + P_B` after clipping/evanescent removal, not net
  longitudinal flux and not the spatial integral of coherent interference.
- Input limits: grids 128/256/512; at most 129 axial slices; finite bounded
  numerical inputs; 64 KiB JSON requests; one active calculation. There is no
  authentication because this is a loopback development service.

## Verification

Eleven deterministic `unittest` cases cover analytical Gaussian width versus
distance (0.2% tolerance, accounting for scalar nonparaxial corrections),
lossless power conservation, reciprocal reverse propagation for both beam
directions, opposite longitudinal phase, analytically expected aperture
transmission, absence of orthogonal interference, evanescent suppression
without reverse growth, request validation, output shapes, Gaussian overlap and
power-preserving phase screens that change the propagated diffraction pattern.

`GET /api/health` returns engine status. `POST /api/wave` accepts:

```json
{
  "wavelength_um": 1.064,
  "grid_size": 128,
  "window_um": 120,
  "z_range_um": 300,
  "plane_z_um": 0,
  "z_slices": 65,
  "aperture_radius_um": 0,
  "polarization": "orthogonal",
  "relative_phase": 0,
  "aberrations": {"astigmatism": 0, "coma": 0, "spherical": 0},
  "beams": [
    {"waist_um": 12, "center_um": [0,0,0], "direction": [0,0,-1], "power_mw": 500},
    {"waist_um": 12, "center_um": [0,0,0], "direction": [0,0,1], "power_mw": 500}
  ]
}
```

The response includes `xy`, `xz`, `far`, physical axes, central profiles,
independent beam power/centroid/second-moment radii, overlap, sampling metrics,
cautions and model notes. The API reports invalid requests with HTTP 400 and
concurrent calculations with HTTP 429.
