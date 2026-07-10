from __future__ import annotations

from html import escape
import logging
import time

import streamlit as st

from quickmaths.cloud_storage import (
    auth_config_from_streamlit_secrets,
    credentials_from_access_token,
    credentials_from_session,
    credentials_to_session,
    download_managed_files,
    drive_user_info,
    find_or_create_folder,
    is_google_authentication_error,
    oauth_config_status,
    oauth_flow_from_config,
    streamlit_oidc_config_problem,
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


def google_reconnect_required() -> bool:
    return bool(st.session_state.get("google_reconnect_required"))


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
        "google_reconnect_required",
        "google_oauth_error",
    ]:
        st.session_state.pop(key, None)
    if _streamlit_user_logged_in():
        st.logout()


def google_credentials():
    data = st.session_state.get("google_credentials")
    if not data:
        return None
    return credentials_from_session(data)


def render_storage_landing_gate() -> bool:
    if _streamlit_oidc_ready():
        _restore_google_drive_from_streamlit_login()
    else:
        _complete_google_oauth_if_present()
    if is_google_drive_storage() or local_storage_selected():
        return True

    st.subheader("Storage")
    oauth_error = st.session_state.pop("google_oauth_error", None)
    if oauth_error:
        st.error(str(oauth_error))
    st.write("Use Google Drive for persistent progress across Streamlit restarts, or continue locally for temporary storage.")
    if _streamlit_oidc_ready():
        if google_reconnect_required() and _streamlit_user_logged_in():
            st.warning(
                "Your Google identity is still signed in, but its temporary Drive access token expired. "
                "Reconnect to resume syncing; your downloaded Quick Maths data remains on this server."
            )
            if st.button("Reconnect Google Drive", width="stretch", type="primary"):
                st.logout()
        elif st.button("Sign in with Google Drive", width="stretch", type="primary"):
            st.login()
    else:
        auth_section = st.secrets.get("auth", {})
        if auth_section:
            st.warning(streamlit_oidc_config_problem(st.secrets))
        status = oauth_config_status(st.secrets)
        if status == "ready":
            _same_tab_google_sign_in(_google_oauth_url())
            st.caption("Persistent sign-in requires the Streamlit [auth] configuration described in the README.")
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
    try:
        downloaded = download_managed_files(credentials, str(folder_id))
    except Exception as exc:
        if is_google_authentication_error(exc):
            _mark_google_reconnect_required()
            st.error("Google Drive access expired. Reconnect from the profile screen before continuing.")
            return
        raise
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
    try:
        uploaded = upload_managed_files(credentials, str(folder_id))
    except Exception as exc:
        if is_google_authentication_error(exc):
            _mark_google_reconnect_required()
            st.error("Saved locally, but Google Drive access expired. Reconnect to resume syncing.")
            return
        raise
    st.session_state["google_credentials"] = credentials_to_session(credentials)
    st.session_state["google_last_sync_at"] = time.time()
    if uploaded:
        st.toast(label)


def storage_label() -> str:
    if google_reconnect_required():
        return "Google Drive (reconnect required)"
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


def _streamlit_oidc_ready() -> bool:
    return streamlit_oidc_config_problem(st.secrets) is None


def _streamlit_user_logged_in() -> bool:
    if not _streamlit_oidc_ready():
        return False
    return bool(getattr(st.user, "is_logged_in", False))


def _restore_google_drive_from_streamlit_login() -> None:
    if not _streamlit_user_logged_in() or is_google_drive_storage():
        return
    access_token = st.user.tokens.get("access")
    if not access_token:
        st.session_state["google_oauth_error"] = "Google sign-in did not provide a Drive access token."
        return
    credentials = credentials_from_access_token(str(access_token))
    try:
        folder = find_or_create_folder(credentials)
    except Exception as exc:
        if is_google_authentication_error(exc):
            LOGGER.info("Google Drive access token expired; learner must reconnect.")
            _mark_google_reconnect_required()
            return
        raise
    user_info = {
        "id": str(st.user.get("sub") or ""),
        "email": str(st.user.get("email") or ""),
        "name": str(st.user.get("name") or ""),
        "picture": str(st.user.get("picture") or ""),
    }
    st.session_state["storage_mode"] = "google_drive"
    st.session_state["google_credentials"] = credentials_to_session(credentials)
    st.session_state["google_user"] = user_info
    st.session_state["google_drive_folder_id"] = folder.id
    st.session_state["google_drive_folder_name"] = folder.name
    st.session_state.pop("google_reconnect_required", None)
    sync_from_google_drive()


def _mark_google_reconnect_required() -> None:
    for key in [
        "storage_mode",
        "google_credentials",
        "google_drive_folder_id",
        "google_drive_folder_name",
    ]:
        st.session_state.pop(key, None)
    st.session_state["google_reconnect_required"] = True
    st.session_state["google_oauth_error"] = "Google Drive access expired. Reconnect to continue using persistent storage."


def _same_tab_google_sign_in(auth_url: str) -> None:
    st.markdown(
        f"""
        <a href="{escape(auth_url, quote=True)}" target="_self" class="qm-google-sign-in">
            Sign in with Google Drive
        </a>
        <style>
        .qm-google-sign-in {{
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 0.48rem 0.75rem;
            border-radius: 6px;
            background: #ff4b4b;
            color: white !important;
            font-weight: 600;
            text-align: center;
            text-decoration: none !important;
        }}
        .qm-google-sign-in:hover {{ background: #e63f3f; }}
        </style>
        """,
        unsafe_allow_html=True,
    )


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
