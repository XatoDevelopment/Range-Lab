"""Pruebas de humo: comprueban que la aplicación arranca y sirve sus páginas básicas.

Se ejecutan contra una base de datos temporal, nunca contra datos reales.
"""
import os
import sys
import tempfile
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

# Aislar la prueba: base de datos y clave temporales antes de importar la app.
_tmp_dir = tempfile.mkdtemp(prefix="rangelab-test-")
os.environ["RANGELAB_DB_PATH"] = os.path.join(_tmp_dir, "test.db")
os.environ["RANGELAB_SECRET_KEY"] = "test-only-secret-key"

import app as rangelab  # noqa: E402


class SmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = rangelab.app.test_client()

    def test_health_endpoint(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_login_redirects_to_setup_before_install(self):
        # Sin instalar, cualquier página de acceso redirige al asistente de instalación.
        res = self.client.get("/login")
        self.assertEqual(res.status_code, 302)
        self.assertTrue(res.headers["Location"].endswith("/setup"))

    def test_setup_page_responds(self):
        res = self.client.get("/setup")
        self.assertIn(res.status_code, (200, 302))

    def test_unknown_route_does_not_crash(self):
        res = self.client.get("/ruta-que-no-existe-xyz")
        self.assertLess(res.status_code, 500)

    def test_security_headers_present(self):
        res = self.client.get("/setup")
        self.assertIn("X-Content-Type-Options", res.headers)


if __name__ == "__main__":
    unittest.main()
