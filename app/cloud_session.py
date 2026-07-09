from __future__ import annotations

import logging
import time

import streamlit as st

from quickmaths.cloud_storage import (
    auth_config_from_streamlit_secrets,
    credentials_from_session,
    credentials_to_session,
    download_managed_files,
    drive_user_info,
    find_or_create_folder,
    oauth_config_status,
    oauth_flow_from_config,
    upload_managed_files,
)
from quickmaths.oauth_state import consume_oauth_state_with_pkce, issue_oauth_state_with_pkce


LOGGER = logging.getLogger(__name__)


def storage_mode() -> str:
    return str(st.session_state.get("storage_mode") or "")


def is_google_drive_storage() -> bool:
    return storage_mode() == "google_drive" and bool(st.session_state.get("google_credentials"))


def local_storage_selected() -> bool:
    return storage_mode() == "local"


def select_local_storage() -> None:
    st.session_state["storage_mode"] = "local"


def logout_cloud_storage() -> None:
    for key in [
        "storage_mode",
        "google_credentials",
        "google_user",
        "google_drive_folder_id",
        "google_drive_folder_name",
        "google_last_sync_at",
    ]:
        st.session_state.pop(key, None)


def google_credentials():
    data = st.session_state.get("google_credentials")
    if not data:
        return None
    return credentials_from_session(data)


def render_storage_landing_gate() -> bool:
    _complete_google_oauth_if_present()
    if is_google_drive_storage() or local_storage_selected():
        return True

    st.subheader("Storage")
    oauth_error = st.session_state.pop("google_oauth_error", None)
    if oauth_error:
        st.error(str(oauth_error))
    st.write("Use Google Drive for persistent progress across Streamlit restarts, or continue locally for temporary storage.")
    status = oauth_config_status(st.secrets)
    if status == "ready":
        st.link_button("Sign in with Google Drive", _google_oauth_url(), width="stretch")
    else:
        st.warning(status)
        if "secrets" in status:
            st.code(
                """
[google_oauth]
client_id = "your-google-oauth-client-id"
client_secret = "your-google-oauth-client-secret"
redirect_uri = "https://your-app.streamlit.app"
folder_name = "Quick Maths"
""".strip(),
                language="toml",
            )
            st.caption("Add this in Streamlit Cloud under App settings -> Secrets, then reboot the app.")

    if st.button("Use local storage (Not recommended)", width="stretch"):
        select_local_storage()
        st.rerun()
    st.caption("Local storage is tied to the current Streamlit environment and may disappear after redeploys or restarts.")
    return False


def sync_from_google_drive() -> None:
    credentials = google_credentials()
    folder_id = st.session_state.get("google_drive_folder_id")
    if not credentials or not folder_id:
        return
    downloaded = download_managed_files(credentials, str(folder_id))
    st.session_state["google_credentials"] = credentials_to_session(credentials)
    st.session_state["google_last_sync_at"] = time.time()
    if downloaded:
        st.toast(f"Synced from Google Drive: {', '.join(downloaded)}")


def sync_to_google_drive(label: str = "Saved to Google Drive") -> None:
    if not is_google_drive_storage():
        return
    credentials = google_credentials()
    folder_id = st.session_state.get("google_drive_folder_id")
    if not credentials or not folder_id:
        return
    uploaded = upload_managed_files(credentials, str(folder_id))
    st.session_state["google_credentials"] = credentials_to_session(credentials)
    st.session_state["google_last_sync_at"] = time.time()
    if uploaded:
        st.toast(label)


def storage_label() -> str:
    if is_google_drive_storage():
        folder = st.session_state.get("google_drive_folder_name") or "Quick Maths"
        return f"Google Drive: {folder}"
    if local_storage_selected():
        return "Local storage (Not recommended)"
    return "No storage selected"


def _google_oauth_url() -> str:
    config = auth_config_from_streamlit_secrets(st.secrets)
    state, code_verifier = issue_oauth_state_with_pkce()
    flow = oauth_flow_from_config(config, state=state, code_verifier=code_verifier)
    auth_url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def _complete_google_oauth_if_present() -> None:
    params = st.query_params
    code = params.get("code")
    state = params.get("state")
    if not code or not state:
        return
    code_verifier = consume_oauth_state_with_pkce(str(state))
    if not code_verifier:
        _reset_failed_oauth("Google sign-in expired or was already used. Start a new Google sign-in below.")
        return
    config = auth_config_from_streamlit_secrets(st.secrets)
    if not config:
        _reset_failed_oauth("Google Drive sign-in is not configured.")
        return
    from oauthlib.oauth2 import OAuth2Error

    flow = oauth_flow_from_config(config, state=state, code_verifier=code_verifier)
    try:
        flow.fetch_token(code=str(code))
    except OAuth2Error as exc:
        LOGGER.warning(
            "Google OAuth code exchange failed (%s, redirect_uri=%r): %s",
            exc.__class__.__name__,
            config.get("redirect_uri"),
            exc,
        )
        _reset_failed_oauth(
            "Google rejected the one-time sign-in code. Start a new Google sign-in below; do not refresh or reuse the callback URL."
        )
        return
    credentials = flow.credentials
    user_info = drive_user_info(credentials)
    folder = find_or_create_folder(credentials, str(config.get("folder_name") or "Quick Maths"))
    st.session_state["storage_mode"] = "google_drive"
    st.session_state["google_credentials"] = credentials_to_session(credentials)
    st.session_state["google_user"] = user_info
    st.session_state["google_drive_folder_id"] = folder.id
    st.session_state["google_drive_folder_name"] = folder.name
    sync_from_google_drive()
    st.query_params.clear()
    st.rerun()


def _reset_failed_oauth(message: str) -> None:
    st.session_state["google_oauth_error"] = message
    st.query_params.clear()
    st.rerun()
