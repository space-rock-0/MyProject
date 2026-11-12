import base64
import os
from email.message import EmailMessage

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from . import config

# Local http://localhost redirect is fine for a personal desktop app.
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

# Create drafts / send only. No permission to read your inbox.
SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]
CRED = config.ROOT / "credentials.json"
TOKEN = config.ROOT / "token.json"
REDIRECT = f"http://localhost:{config.PORT}/auth/google/callback"
_flow = None  # single-user local app: keep the flow (and its PKCE verifier) between login and callback


def _creds():
    if not TOKEN.exists():
        return None
    c = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if c.valid:
        return c
    if c.expired and c.refresh_token:
        try:
            c.refresh(Request())
            TOKEN.write_text(c.to_json())
            return c
        except Exception:
            return None
    return None


def status() -> dict:
    out = {"configured": CRED.exists(), "connected": False, "email": ""}
    c = _creds() if out["configured"] else None
    if c:
        try:
            svc = build("gmail", "v1", credentials=c, cache_discovery=False)
            out["email"] = svc.users().getProfile(userId="me").execute().get("emailAddress", "")
            out["connected"] = True
        except Exception:
            pass
    return out


def login_url() -> str:
    global _flow
    _flow = Flow.from_client_secrets_file(str(CRED), scopes=SCOPES, redirect_uri=REDIRECT)
    url, _ = _flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
    return url


def finish_login(full_url: str) -> None:
    if _flow is None:
        raise RuntimeError("Login session expired. Click Connect Gmail again.")
    _flow.fetch_token(authorization_response=full_url)
    TOKEN.write_text(_flow.credentials.to_json())


def disconnect() -> None:
    if TOKEN.exists():
        TOKEN.unlink()


def create_draft(to: str, subject: str, body: str, pdf_path=None, pdf_name: str = "Resume.pdf") -> dict:
    c = _creds()
    if not c:
        raise PermissionError("Gmail is not connected.")
    msg = EmailMessage()
    if to:
        msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if pdf_path:
        msg.add_attachment(pdf_path.read_bytes(), maintype="application", subtype="pdf", filename=pdf_name)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    svc = build("gmail", "v1", credentials=c, cache_discovery=False)
    d = svc.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
    mid = d.get("message", {}).get("id", "")
    return {"draft_id": d.get("id"), "url": f"https://mail.google.com/mail/u/0/#drafts?compose={mid}" if mid else "https://mail.google.com/mail/u/0/#drafts"}
