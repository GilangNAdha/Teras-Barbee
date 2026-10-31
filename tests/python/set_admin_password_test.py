import importlib.util
import io
import json
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "set_admin_password.py"
spec = importlib.util.spec_from_file_location("set_admin_password", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

PROJECT_REF = "abcdefghijklmnopqrst"
USER_ID = "123e4567-e89b-12d3-a456-426614174000"
FAKE_KEY = "sb_secret_fake_key_for_testing"
FAKE_PASSWORD = "example passphrase 123"


class PasswordSetupTests(unittest.TestCase):
    def test_rejects_invalid_project_and_user_identifiers(self):
        with self.assertRaises(ValueError):
            module.validate_target("attacker.example", USER_ID)
        with self.assertRaises(ValueError):
            module.validate_target(PROJECT_REF, "../other")

    def test_sends_admin_api_request_only_to_project_over_https(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.status = 200
        with patch.object(module, "build_opener", return_value=opener) as build_opener:
            self.assertTrue(module.update_password(PROJECT_REF, USER_ID, FAKE_KEY, FAKE_PASSWORD))
        handlers = build_opener.call_args.args
        self.assertEqual(handlers[0].proxies, {})
        self.assertIsInstance(handlers[1], module.RefuseRedirects)
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, f"https://{PROJECT_REF}.supabase.co/auth/v1/admin/users/{USER_ID}")
        self.assertEqual(request.get_method(), "PUT")
        self.assertEqual(request.get_header("Apikey"), FAKE_KEY)
        self.assertEqual(request.get_header("Authorization"), f"Bearer {FAKE_KEY}")
        self.assertEqual(json.loads(request.data), {"password": FAKE_PASSWORD})
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 20)

    def test_rejects_redirects_before_forwarding_credentials(self):
        with self.assertRaises(HTTPError):
            module.RefuseRedirects().redirect_request(
                MagicMock(full_url="https://example.supabase.co"), None, 302, "Found", {}, "https://attacker.example"
            )

    def test_refuses_noninteractive_input_without_prompting(self):
        with patch.object(module.sys.stdin, "isatty", return_value=False), patch.object(module.getpass, "getpass") as prompt, redirect_stderr(io.StringIO()):
            self.assertEqual(module.main([PROJECT_REF, USER_ID]), 2)
            prompt.assert_not_called()

    def test_passwords_must_match_without_echoing_secrets(self):
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(module.sys.stdin, "isatty", return_value=True), patch.object(module.getpass, "getpass", side_effect=[FAKE_KEY, FAKE_PASSWORD, "different passphrase"]), patch.object(module, "update_password") as update, redirect_stdout(output), redirect_stderr(errors):
            self.assertEqual(module.main([PROJECT_REF, USER_ID]), 2)
            update.assert_not_called()
        self.assertIn("did not match", errors.getvalue())
        self.assertNotIn(FAKE_KEY, output.getvalue() + errors.getvalue())
        self.assertNotIn(FAKE_PASSWORD, output.getvalue() + errors.getvalue())

    def test_updates_with_unicode_password_and_never_prints_credentials(self):
        password = "a unique café password"
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(module.sys.stdin, "isatty", return_value=True), patch.object(module.getpass, "getpass", side_effect=[FAKE_KEY, password, password]), patch.object(module, "update_password", return_value=True) as update, redirect_stdout(output), redirect_stderr(errors):
            self.assertEqual(module.main([PROJECT_REF, USER_ID]), 0)
            update.assert_called_once_with(PROJECT_REF, USER_ID, FAKE_KEY, password)
        self.assertIn("Password updated", output.getvalue())
        self.assertNotIn(FAKE_KEY, output.getvalue() + errors.getvalue())
        self.assertNotIn(password, output.getvalue() + errors.getvalue())

    def test_short_password_does_not_send_request(self):
        with patch.object(module.sys.stdin, "isatty", return_value=True), patch.object(module.getpass, "getpass", side_effect=[FAKE_KEY, "short", "short"]), patch.object(module, "update_password") as update, redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(module.main([PROJECT_REF, USER_ID]), 2)
            update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
