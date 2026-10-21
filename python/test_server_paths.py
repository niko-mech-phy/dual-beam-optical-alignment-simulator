import unittest
from server import STATIC_ROOT, resolve_asset

class StaticPathTests(unittest.TestCase):
    def test_traversal_is_rejected(self):
        self.assertIsNone(resolve_asset('/../package.json'))
        self.assertIsNone(resolve_asset('/%2e%2e/package.json'))
        self.assertIsNone(resolve_asset('/%2e%2e/python/server.py'))

    def test_application_is_served_only_from_dist(self):
        if (STATIC_ROOT / 'index.html').exists():
            self.assertEqual(resolve_asset('/'), STATIC_ROOT / 'index.html')
            self.assertEqual(resolve_asset('/index.html?version=1'), STATIC_ROOT / 'index.html')
        self.assertIsNone(resolve_asset('/src/App.tsx'))
