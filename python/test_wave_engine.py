import copy
import math
import unittest

import numpy as np
from scipy import fft

from wave_engine import angular_spectrum, calculate, combine_intensity, gaussian_field, plane_metrics


class AngularSpectrumTests(unittest.TestCase):
    def setUp(self):
        self.n, self.dx, self.wavelength, self.waist = 256, .8, 1.064, 14.
        axis = (np.arange(self.n)-self.n//2)*self.dx
        self.x, self.y = np.meshgrid(axis, axis)
        self.field = gaussian_field(self.x, self.y, self.waist)

    def test_gaussian_matches_analytic_propagation(self):
        zr = np.pi*self.waist**2/self.wavelength
        for distance in [0, zr*.5, zr]:
            field = angular_spectrum(self.field, self.dx, self.wavelength, distance)
            metrics = plane_metrics(abs(field)**2, self.x, self.y, self.dx)
            expected = self.waist*math.sqrt(1+(distance/zr)**2)
            self.assertAlmostEqual(metrics["radius_um"][0]/expected, 1, delta=.002)
            self.assertAlmostEqual(metrics["radius_um"][1]/expected, 1, delta=.002)

    def test_lossless_power_conservation(self):
        expected = np.sum(abs(self.field)**2)
        for sign in [-1, 1]:
            actual = angular_spectrum(self.field, self.dx, self.wavelength, 800, sign)
            self.assertAlmostEqual(float(np.sum(abs(actual)**2)/expected), 1, places=12)

    def test_backward_propagation_reciprocity(self):
        for sign in [-1, 1]:
            forward = angular_spectrum(self.field, self.dx, self.wavelength, 378, sign)
            backward = angular_spectrum(forward, self.dx, self.wavelength, -378, sign)
            np.testing.assert_allclose(backward, self.field, atol=1e-14)
        positive = angular_spectrum(self.field, self.dx, self.wavelength, 378, 1)
        negative = angular_spectrum(self.field, self.dx, self.wavelength, -378, -1)
        np.testing.assert_allclose(positive, negative, atol=1e-14)

    def test_direction_changes_longitudinal_phase(self):
        uniform = np.ones((64,64), dtype=complex)
        distance = self.wavelength/8
        a = angular_spectrum(uniform, self.dx, self.wavelength, distance, 1)
        b = angular_spectrum(uniform, self.dx, self.wavelength, distance, -1)
        self.assertAlmostEqual(float(np.angle(a[0,0])), np.pi/4, places=12)
        self.assertAlmostEqual(float(np.angle(b[0,0])), -np.pi/4, places=12)

    def test_clipping_transmission(self):
        radius = self.waist
        clipped = self.field * (self.x**2+self.y**2 <= radius**2)
        transmission = float(np.sum(abs(clipped)**2)/np.sum(abs(self.field)**2))
        self.assertAlmostEqual(transmission, 1-math.exp(-2), delta=.005)
        propagated = angular_spectrum(clipped, self.dx, self.wavelength, 100)
        self.assertAlmostEqual(float(np.sum(abs(propagated)**2)/np.sum(abs(clipped)**2)), 1, places=12)

    def test_orthogonal_polarizations_do_not_interfere(self):
        first = combine_intensity(self.field, self.field, "orthogonal", 0)
        second = combine_intensity(self.field, self.field, "orthogonal", np.pi)
        np.testing.assert_array_equal(first, second)
        np.testing.assert_allclose(first, 2*abs(self.field)**2)
        parallel = combine_intensity(self.field, self.field, "parallel", np.pi)
        self.assertLess(float(np.max(parallel)), 1e-28)

    def test_evanescent_modes_discarded_without_reverse_growth(self):
        n, dx = 64, .1
        # Alternating samples contain only a transverse mode beyond k=2π/λ.
        field = np.tile((-1.)**np.arange(n), (n,1)).astype(complex)
        for distance in [0, 10, -10]:
            result = angular_spectrum(field, dx, self.wavelength, distance)
            self.assertTrue(np.all(np.isfinite(result)))
            self.assertLess(float(np.max(abs(result))), 1e-12)


class RequestTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"grid_size": 128, "window_um": 120, "z_range_um": 80, "z_slices": 9,
                        "beams": [{"waist_um": 12, "power_mw": 1, "direction": [0,0,-1]},
                                  {"waist_um": 12, "power_mw": 2, "direction": [0,0,1]}]}

    def test_result_shapes_overlap_and_power(self):
        result = calculate(self.payload)
        self.assertEqual(np.array(result["xy"]).shape, (128,128))
        self.assertEqual(np.array(result["xz"]).shape, (9,128))
        self.assertAlmostEqual(result["metrics"]["overlap"], 1, places=10)
        self.assertAlmostEqual(result["metrics"]["independent_power_mw"], 3, places=10)

    def test_separated_beams_have_lower_overlap(self):
        self.payload["beams"][1]["center_um"] = [18,0,0]
        result = calculate(self.payload)
        expected = math.exp(-18**2/(12**2))
        self.assertAlmostEqual(result["metrics"]["overlap"], expected, delta=.001)

    def test_phase_screen_changes_propagated_pattern_and_preserves_power(self):
        self.payload["plane_z_um"] = 200
        reference = calculate(self.payload)
        self.payload["aberrations"] = {"astigmatism": .3, "coma": .1, "spherical": .05}
        changed = calculate(self.payload)
        self.assertGreater(float(np.max(abs(np.array(reference["xy"])-np.array(changed["xy"])))), .02)
        self.assertAlmostEqual(reference["metrics"]["independent_power_mw"], changed["metrics"]["independent_power_mw"], places=10)

    def test_invalid_inputs(self):
        for name, value in [("grid_size", 2048), ("grid_size", 128.1), ("window_um", float("nan")),
                            ("wavelength_um", -1), ("z_slices", 100000), ("polarization", "unknown")]:
            request = copy.deepcopy(self.payload)
            request[name] = value
            with self.assertRaises(ValueError, msg=name):
                calculate(request)
        request = copy.deepcopy(self.payload)
        request["beams"][0]["direction"] = [0,0,0]
        with self.assertRaises(ValueError):
            calculate(request)


if __name__ == "__main__":
    unittest.main()
