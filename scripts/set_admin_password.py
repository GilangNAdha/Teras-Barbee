#!/usr/bin/env python3
"""Set an Auth user's password privately from a trusted, interactive terminal.

The Supabase secret/service-role key and password are read without echo and are
never accepted as arguments or written to disk. This calls the Supabase Auth
Admin API, not a direct update of the auth.users table.
"""

import getpass
import hmac
import json
import re
import sys
import uuid
import warnings
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class RefuseRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "Redirect refused", headers, fp)


def validate_target(project_ref, user_id):
    if not re.fullmatch(r"[a-z0-9]{20}", project_ref):
        raise ValueError("Project ref must be the 20-character Supabase project reference.")
    try:
        user_id = str(uuid.UUID(user_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("User ID must be the Auth user's UUID.") from exc
    return project_ref, user_id


def update_password(project_ref, user_id, key, password):
    project_ref, user_id = validate_target(project_ref, user_id)
    url = f"https://{project_ref}.supabase.co/auth/v1/admin/users/{user_id}"
    request = Request(
        url,
        data=json.dumps({"password": password}).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="PUT",
    )
    # Do not forward privileged credentials to a proxy or a redirect target.
    opener = build_opener(ProxyHandler({}), RefuseRedirects())
    with opener.open(request, timeout=20) as response:
        return 200 <= response.status < 300


def main(args):
    if len(args) != 2:
        print("Usage: python3 scripts/set_admin_password.py PROJECT_REF AUTH_USER_UUID", file=sys.stderr)
        return 2
    try:
        project_ref, user_id = validate_target(*args)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    if not sys.stdin.isatty():
        print("Run this tool in a trusted interactive terminal; secret input must not be echoed.", file=sys.stderr)
        return 2

    print(f"Updating Auth user {user_id} in project {project_ref}. Verify both identifiers first.")
    warnings.simplefilter("error", getpass.GetPassWarning)
    try:
        key = getpass.getpass("Supabase secret or service-role key: ")
        password = getpass.getpass("New password (at least 12 characters): ")
        confirmation = getpass.getpass("Confirm new password: ")
    except (EOFError, KeyboardInterrupt, getpass.GetPassWarning):
        print("\nCancelled or unable to hide input; no request was sent.", file=sys.stderr)
        return 1

    if not re.fullmatch(r"(?:sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)", key):
        print("Enter a Supabase secret key or legacy service-role key.", file=sys.stderr)
        return 2
    try:
        password_bytes = password.encode("utf-8")
        confirmation_bytes = confirmation.encode("utf-8")
    except UnicodeError:
        print("The password contains invalid characters; no request was sent.", file=sys.stderr)
        return 2
    if len(password) < 12 or len(password_bytes) > 72:
        print("Use at least 12 characters and no more than 72 UTF-8 bytes.", file=sys.stderr)
        return 2
    if not hmac.compare_digest(password_bytes, confirmation_bytes):
        print("Passwords did not match; no change was made.", file=sys.stderr)
        return 2
    try:
        if not update_password(project_ref, user_id, key, password):
            print("Supabase did not confirm the update; verify before retrying.", file=sys.stderr)
            return 1
    except HTTPError as exc:
        print(f"Supabase returned HTTP {exc.code}; check the key, user ID, and Auth password policy.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, OSError, KeyboardInterrupt):
        print("The request's outcome is unknown; verify before retrying.", file=sys.stderr)
        return 1

    print("Password updated. Sign in and enroll an authenticator immediately.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
