"""Local scalar angular-spectrum calculations; all internal lengths are micrometres.

The input is an approximate Gaussian near-waist boundary, not a high-NA lens pupil.
Longitudinal z is world X in the browser; transverse (x,y) is world (Y,Z).
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import fft


def number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a finite number") from None
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f"{name} must be between {low:g} and {high:g}")
    return result


def spectrum_geometry(shape: tuple[int, int], spacing: float, wavelength: float):
    fy = fft.fftfreq(shape[0], spacing)
    fx = fft.fftfreq(shape[1], spacing)
    k = 2 * np.pi / wavelength
    kx, ky = np.meshgrid(2 * np.pi * fx, 2 * np.pi * fy)
    kz2 = k * k - kx * kx - ky * ky
    propagating = kz2 >= 0
    return np.sqrt(np.maximum(kz2, 0)), propagating


def propagate_spectrum(spectrum, kz, propagating, distance: float, sign: int = 1):
    # The sign is the physical beam direction, independent of the plane ordering.
    # Evanescent components are discarded, never exponentially amplified in reverse.
    transfer = np.exp(1j * sign * kz * distance) * propagating
    return fft.ifft2(spectrum * transfer, workers=1)


def angular_spectrum(field, spacing: float, wavelength: float, distance: float, sign: int = 1):
    """Exact scalar kz transfer for the propagating spatial spectrum.

    Numerical reverse propagation is reciprocal for propagating modes. Evanescent
    content is intentionally discarded, so its removal is not reversible.
    """
    if sign not in (-1, 1):
        raise ValueError("sign must be -1 or +1")
    kz, propagating = spectrum_geometry(field.shape, spacing, wavelength)
    return propagate_spectrum(fft.fft2(field, workers=1), kz, propagating, distance, sign)


def gaussian_field(x, y, waist: float, power: float = 1.0, center=(0.0, 0.0)):
    return np.sqrt(2 * power / (np.pi * waist * waist)) * np.exp(
        -((x - center[0]) ** 2 + (y - center[1]) ** 2) / waist ** 2
    ).astype(np.complex128)


def combine_intensity(a, b, polarization="orthogonal", relative_phase=0.0):
    if polarization == "parallel":
        return np.abs(a + b * np.exp(1j * relative_phase)) ** 2
    return np.abs(a) ** 2 + np.abs(b) ** 2


def plane_metrics(intensity, x, y, spacing):
    total = float(np.sum(intensity) * spacing * spacing)
    if total <= 1e-30:
        return {"power_mw": 0.0, "centroid_um": [0.0, 0.0], "radius_um": [0.0, 0.0]}
    cx = float(np.sum(intensity * x) * spacing * spacing / total)
    cy = float(np.sum(intensity * y) * spacing * spacing / total)
    wx = 2 * math.sqrt(max(0.0, float(np.sum(intensity * (x-cx)**2) * spacing*spacing / total)))
    wy = 2 * math.sqrt(max(0.0, float(np.sum(intensity * (y-cy)**2) * spacing*spacing / total)))
    return {"power_mw": total, "centroid_um": [cx, cy], "radius_um": [wx, wy]}


def calculate(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Request must be an object")
    grid = number(payload.get("grid_size", 128), "grid_size", 128, 512)
    if grid not in (128, 256, 512):
        raise ValueError("grid_size must be 128, 256 or 512")
    n = int(grid)
    wavelength = number(payload.get("wavelength_um", 1.064), "wavelength_um", .2, 5)
    window = number(payload.get("window_um", 120), "window_um", 2, 50000)
    z_range = number(payload.get("z_range_um", 300), "z_range_um", .01, 100000)
    plane_z = number(payload.get("plane_z_um", 0), "plane_z_um", -100000, 100000)
    slices = int(number(payload.get("z_slices", 65), "z_slices", 9, 129))
    aperture = number(payload.get("aperture_radius_um", 0), "aperture_radius_um", 0, 50000)
    phase = number(payload.get("relative_phase", 0), "relative_phase", -100*np.pi, 100*np.pi)
    polarization = payload.get("polarization", "orthogonal")
    if polarization not in ("orthogonal", "parallel"):
        raise ValueError("polarization must be orthogonal or parallel")
    aberrations = payload.get("aberrations", {})
    if not isinstance(aberrations, dict):
        raise ValueError("aberrations must be an object")
    astig = number(aberrations.get("astigmatism", 0), "astigmatism", -2, 2)
    coma = number(aberrations.get("coma", 0), "coma", -2, 2)
    spherical = number(aberrations.get("spherical", 0), "spherical", -2, 2)
    beams = payload.get("beams")
    if not isinstance(beams, list) or len(beams) != 2:
        raise ValueError("Exactly two beams are required")

    spacing = window / n
    axis = (np.arange(n) - n//2) * spacing
    x, y = np.meshgrid(axis, axis)
    kz, propagating = spectrum_geometry((n, n), spacing, wavelength)
    z_axis = np.linspace(-z_range, z_range, slices)
    spectra, inputs, notices = [], [], []
    boundary_powers, discarded = [], []
    for i, raw in enumerate(beams):
        if not isinstance(raw, dict):
            raise ValueError(f"beam {i+1} must be an object")
        waist = number(raw.get("waist_um"), f"beam {i+1} waist", .2, 5000)
        power = number(raw.get("power_mw", 1), f"beam {i+1} power", 0, 1000000)
        center_raw = raw.get("center_um", [0, 0, 0])
        direction_raw = raw.get("direction", [0, 0, 1 if i == 0 else -1])
        if not isinstance(center_raw, list) or len(center_raw) != 3:
            raise ValueError("center_um must contain three numbers")
        if not isinstance(direction_raw, list) or len(direction_raw) != 3:
            raise ValueError("direction must contain three numbers")
        center = [number(v, "center", -100000, 100000) for v in center_raw]
        direction = np.array([number(v, "direction", -1, 1) for v in direction_raw])
        magnitude = np.linalg.norm(direction)
        if magnitude < 1e-9:
            raise ValueError("direction cannot be zero")
        direction /= magnitude
        if abs(direction[2]) < .95:
            raise ValueError("Near-waist input requires propagation within 18 degrees of the z axis")
        sign = 1 if direction[2] > 0 else -1
        field = gaussian_field(x, y, waist, power, center[:2])
        field *= np.exp(1j * 2*np.pi/wavelength * (direction[0]*(x-center[0]) + direction[1]*(y-center[1])))
        # A physical common centered aperture is applied at each input waist plane.
        # Aberrations are independent phase screens on those boundary planes.
        pupil_radius = aperture if aperture > 0 else 2*waist
        u, v = x / pupil_radius, y / pupil_radius
        r2 = u*u + v*v
        phase_screen = astig*(u*u-v*v) + coma*(3*r2-2)*u + spherical*(6*r2*r2-6*r2+1)
        field *= np.exp(2j*np.pi*phase_screen)
        if aperture > 0:
            field *= x*x+y*y <= aperture*aperture
        boundary_powers.append(float(np.sum(abs(field)**2)*spacing**2))
        spectrum = fft.fft2(field, workers=1)
        spec_total = float(np.sum(abs(spectrum)**2))
        discarded.append(float(np.sum(abs(spectrum[~propagating])**2))/max(spec_total, 1e-30))
        spectra.append(spectrum)
        inputs.append({"waist": waist, "power": power, "center": center, "direction": direction, "sign": sign})
        if waist / spacing < 6:
            notices.append(f"Beam {'AB'[i]} waist has only {waist/spacing:.1f} pixels per radius; increase grid size or reduce field of view.")
        if math.hypot(direction[0], direction[1]) / wavelength > .4/spacing:
            notices.append(f"Beam {'AB'[i]} tilt approaches the transverse Nyquist limit; increase grid size.")
        if waist < 2*wavelength:
            notices.append(f"Beam {'AB'[i]} waist is below two wavelengths; its paraxial Gaussian boundary is not a reliable high-NA focus model.")
        if max(abs(center[0]), abs(center[1]))+3*waist > window/2:
            notices.append(f"Beam {'AB'[i]} input approaches the grid boundary; increase field of view.")

    def fields_at(z):
        return [propagate_spectrum(spectra[i], kz, propagating, z-info["center"][2], info["sign"]) for i, info in enumerate(inputs)]

    fields = fields_at(plane_z)
    intensities = [abs(f)**2 for f in fields]
    combined = combine_intensity(*fields, polarization, phase)
    metrics = [plane_metrics(im, x, y, spacing) for im in intensities]
    p_a, p_b = [m["power_mw"] for m in metrics]
    overlap = float(np.sum(np.sqrt(intensities[0]*intensities[1]))*spacing**2 / math.sqrt(p_a*p_b)) if p_a*p_b > 1e-30 else 0.
    xz_rows, edge_fraction = [], 0.
    rim = np.maximum(abs(x), abs(y)) > window*.43
    for z in z_axis:
        af, bf = fields_at(float(z))
        intensity = combine_intensity(af, bf, polarization, phase)
        # x-z is the transverse y=0 section, not a projection.
        xz_rows.append(intensity[n//2, :])
        incoherent = abs(af)**2 + abs(bf)**2
        edge_fraction = max(edge_fraction, float(np.sum(incoherent[rim]))/max(float(np.sum(incoherent)), 1e-30))
    xz = np.array(xz_rows)
    if edge_fraction > .005:
        notices.append(f"Up to {edge_fraction:.1%} of power lies at the grid edge; periodic FFT wrap-around can contaminate this propagation. Enlarge field of view.")
    min_dx = min(info["waist"] for info in inputs)
    if abs(astig)+abs(coma)+abs(spherical) > .8 and spacing > min_dx/12:
        notices.append("Strong phase screens need finer sampling; compare with a higher grid resolution.")
    # Carrier-resolved counterpropagating fringes require sub-wavelength z spacing.
    if polarization == "parallel" and 2*z_range/(slices-1) > wavelength/4:
        notices.append("Axial samples do not resolve λ/2 standing-wave fringes. The X/Z map is sampled intensity and can alias; reduce z range to inspect fringes.")
    if max(discarded) > 1e-6:
        notices.append(f"Evanescent spectral power discarded: A {discarded[0]:.2%}, B {discarded[1]:.2%}; reverse propagation is only reciprocal for propagating modes.")
    total_input = sum(info["power"] for info in inputs)
    peak = float(np.max(combined))
    xz_peak = float(np.max(xz))
    normalization = max(peak, 1e-30)
    far_maps = []
    for spectrum in spectra:
        far_maps.append(abs(fft.fftshift(spectrum * propagating))**2)
    far = sum(far_maps)
    far_axis = fft.fftshift(fft.fftfreq(n, spacing))*wavelength
    return {
        "model": "Scalar angular spectrum · Gaussian near-waist boundaries",
        "grid_size": n, "axis_um": axis.tolist(), "z_axis_um": z_axis.tolist(),
        "xy": np.round(combined/normalization, 6).tolist(),
        "xz": np.round(xz/max(xz_peak, 1e-30), 6).tolist(),
        "far": np.round(far/max(float(np.max(far)), 1e-30), 6).tolist(),
        "far_axis_direction_cosine": far_axis.tolist(),
        "profiles": {"x": (combined[n//2,:]/normalization).tolist(), "y": (combined[:,n//2]/normalization).tolist()},
        "metrics": {"beams": metrics, "overlap": max(0., min(1., overlap*overlap)),
                    "independent_power_mw": p_a+p_b, "transmission": (p_a+p_b)/total_input if total_input else 0.,
                    "peak_mw_per_um2": peak, "boundary_power_mw": boundary_powers,
                    "edge_fraction": edge_fraction, "spacing_um": spacing,
                    "evanescent_fraction": discarded},
        "cautions": notices,
        "notes": ["XY and XZ panels are independently peak-normalized. Profiles are central sections at x=0 or y=0.",
                  "Far field shows the sum of independent angular spectra (direction cosines); opposite output directions are distinct channels.",
                  "Phase screens and aperture act at each near-waist input boundary, not at the physical focusing lens.",
                  "Scalar, monochromatic, coherent within each beam. Finite periodic FFT grid; no vector polarization focusing, material dispersion, full lens prescription, or force calculation."]
    }
