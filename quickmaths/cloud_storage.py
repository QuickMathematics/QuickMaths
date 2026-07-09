from __future__ import annotations

import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from quickmaths.config import DB_PATH, EXPORT_DIR


DRIVE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
]
DEFAULT_DRIVE_FOLDER_NAME = "Quick Maths"
MANAGED_FILES = [
    DB_PATH,
    EXPORT_DIR / "progress.csv",
    EXPORT_DIR / "attempts.csv",
    EXPORT_DIR / "reviews.csv",
    EXPORT_DIR / "latest_tutor_summary.md",
    EXPORT_DIR / "latest_review_packet.md",
]


@dataclass
class DriveFile:
    id: str
    name: str


def optional_google_import_error() -> str | None:
    try:
        import google.auth.transport.requests  # noqa: F401
        import google.oauth2.credentials  # noqa: F401
        import google_auth_oauthlib.flow  # noqa: F401
        import googleapiclient.discovery  # noqa: F401
        import googleapiclient.http  # noqa: F401
    except ImportError as exc:
        return str(exc)
    return None


def credentials_from_session(data: dict[str, Any]):
    from google.oauth2.credentials import Credentials

    return Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes", DRIVE_SCOPES),
    )


def credentials_to_session(credentials) -> dict[str, Any]:
    return {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes or DRIVE_SCOPES),
    }


def refresh_credentials(credentials) -> None:
    if credentials.expired and credentials.refresh_token:
        from google.auth.transport.requests import Request

        credentials.refresh(Request())


def build_drive_service(credentials):
    from googleapiclient.discovery import build

    refresh_credentials(credentials)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def drive_user_info(credentials) -> dict[str, str]:
    from googleapiclient.discovery import build

    refresh_credentials(credentials)
    service = build("oauth2", "v2", credentials=credentials, cache_discovery=False)
    return service.userinfo().get().execute()


def find_or_create_folder(credentials, folder_name: str = DEFAULT_DRIVE_FOLDER_NAME) -> DriveFile:
    service = build_drive_service(credentials)
    safe_name = folder_name.replace("'", "\\'")
    query = (
        "mimeType='application/vnd.google-apps.folder' "
        f"and name='{safe_name}' and trashed=false"
    )
    results = service.files().list(q=query, spaces="drive", fields="files(id,name)", pageSize=10).execute()
    files = results.get("files", [])
    if files:
        return DriveFile(id=files[0]["id"], name=files[0]["name"])
    metadata = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder"}
    created = service.files().create(body=metadata, fields="id,name").execute()
    return DriveFile(id=created["id"], name=created["name"])


def download_managed_files(credentials, folder_id: str, local_files: list[Path] | None = None) -> list[str]:
    from googleapiclient.http import MediaIoBaseDownload

    service = build_drive_service(credentials)
    downloaded = []
    for path in local_files or MANAGED_FILES:
        remote = _find_file(service, folder_id, path.name)
        if not remote:
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        request = service.files().get_media(fileId=remote.id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)
        done = False
        while not done:
            _status, done = downloader.next_chunk()
        path.write_bytes(buffer.getvalue())
        downloaded.append(path.name)
    return downloaded


def upload_managed_files(credentials, folder_id: str, local_files: list[Path] | None = None) -> list[str]:
    from googleapiclient.http import MediaFileUpload

    service = build_drive_service(credentials)
    uploaded = []
    for path in local_files or MANAGED_FILES:
        if not path.exists() or path.is_dir():
            continue
        remote = _find_file(service, folder_id, path.name)
        media = MediaFileUpload(str(path), resumable=False)
        if remote:
            service.files().update(fileId=remote.id, media_body=media).execute()
        else:
            metadata = {"name": path.name, "parents": [folder_id]}
            service.files().create(body=metadata, media_body=media, fields="id").execute()
        uploaded.append(path.name)
    return uploaded


def auth_config_from_streamlit_secrets(secrets: Any) -> dict[str, Any]:
    section = secrets.get("google_oauth", {}) if hasattr(secrets, "get") else {}
    client_id = section.get("client_id", "")
    client_secret = section.get("client_secret", "")
    redirect_uri = section.get("redirect_uri", "")
    if not client_id or not client_secret or not redirect_uri:
        return {}
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        },
        "redirect_uri": redirect_uri,
        "folder_name": section.get("folder_name", DEFAULT_DRIVE_FOLDER_NAME),
    }


def oauth_config_problem(secrets: Any) -> str | None:
    if optional_google_import_error():
        return "Google Drive dependencies are not installed."
    section = secrets.get("google_oauth", {}) if hasattr(secrets, "get") else {}
    client_id = str(section.get("client_id", "")).strip()
    client_secret = str(section.get("client_secret", "")).strip()
    redirect_uri = str(section.get("redirect_uri", "")).strip()
    if not client_id or not client_secret or not redirect_uri:
        return "Google Drive sign-in needs app secrets: google_oauth.client_id, client_secret, and redirect_uri."
    if "your-google-oauth" in client_id or "..." in client_id:
        return "Google Drive client_id is still a placeholder. Use the OAuth 2.0 Client ID from Google Cloud."
    if not client_id.endswith(".apps.googleusercontent.com"):
        return "Google Drive client_id does not look like a Google OAuth client ID. It should end with .apps.googleusercontent.com."
    if "your-google-oauth" in client_secret or "..." in client_secret:
        return "Google Drive client_secret is still a placeholder. Use the OAuth 2.0 Client Secret from Google Cloud."
    if not (redirect_uri.startswith("http://localhost") or redirect_uri.startswith("https://")):
        return "Google Drive redirect_uri must be a localhost URL for local testing or an https:// Streamlit app URL."
    return None


def oauth_flow_from_config(config: dict[str, Any], state: str | None = None):
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_config(config, scopes=DRIVE_SCOPES, state=state)
    flow.redirect_uri = config["redirect_uri"]
    return flow


def oauth_config_status(secrets: Any) -> str:
    return oauth_config_problem(secrets) or "ready"


def managed_files_summary() -> str:
    return json.dumps([str(path) for path in MANAGED_FILES], indent=2)


def _find_file(service, folder_id: str, name: str) -> DriveFile | None:
    safe_name = name.replace("'", "\\'")
    query = f"name='{safe_name}' and '{folder_id}' in parents and trashed=false"
    results = service.files().list(q=query, spaces="drive", fields="files(id,name)", pageSize=10).execute()
    files = results.get("files", [])
    if not files:
        return None
    return DriveFile(id=files[0]["id"], name=files[0]["name"])
