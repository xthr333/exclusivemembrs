import importlib.util
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("validate_site", Path(__file__).resolve().parents[1] / "tools/validate-site.py")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.page = self.root / "404.html"

    def test_root_relative_css_is_inside_site(self):
        self.assertEqual(validator.resolve_reference(self.root, self.page, "/style.css"), self.root / "style.css")

    def test_root_contact_is_inside_site(self):
        self.assertEqual(validator.resolve_reference(self.root, self.page, "/contact.html"), self.root / "contact.html")

    def test_home_is_index(self):
        self.assertEqual(validator.resolve_reference(self.root, self.page, "/"), self.root / "index.html")

    def test_query_fragment_and_encoded_path(self):
        actual = validator.resolve_reference(self.root, self.page, "/assets/Front%20(6).png?v=1#image")
        self.assertEqual(actual, self.root / "assets/Front (6).png")

    def test_nested_relative_link(self):
        actual = validator.resolve_reference(self.root, self.root / "nested/page.html", "../style.css")
        self.assertEqual(actual, self.root / "style.css")

    def test_external_references_are_not_files(self):
        for ref in ["https://example.com/file", "//cdn.example.com/file", "mailto:test@example.com", "#main"]:
            self.assertIsNone(validator.resolve_reference(self.root, self.page, ref))

    def test_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            validator.resolve_reference(self.root, self.page, "../../outside.txt")

    def test_javascript_link_is_rejected(self):
        with self.assertRaises(ValueError):
            validator.resolve_reference(self.root, self.page, "javascript:alert(1)")

    def test_missing_file_still_fails(self):
        for name in ["updates.json", "songwars-public.json", "wrangler.jsonc"]:
            (self.root / name).write_text("{}", encoding="utf-8")
        self.page.write_text('<a href="/definitely-missing.css">Missing</a>', encoding="utf-8")
        with patch.object(validator, "REQUIRED", []):
            with self.assertRaisesRegex(ValueError, "Broken local references"):
                validator.validate(self.root)


if __name__ == "__main__":
    unittest.main()
