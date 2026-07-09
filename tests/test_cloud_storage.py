from quickmaths.cloud_storage import (
    DEFAULT_DRIVE_FOLDER_NAME,
    auth_config_from_streamlit_secrets,
    credentials_from_access_token,
    oauth_config_problem,
    oauth_flow_from_config,
    streamlit_oidc_config_problem,
)


def test_streamlit_native_auth_runtime_dependencies_import():
    from authlib.integrations import starlette_client

    assert starlette_client is not None


def test_auth_config_from_streamlit_secrets_requires_core_fields():
    assert auth_config_from_streamlit_secrets({}) == {}
    assert auth_config_from_streamlit_secrets({"google_oauth": {"client_id": "id"}}) == {}


def test_auth_config_from_streamlit_secrets_builds_web_client_config():
    config = auth_config_from_streamlit_secrets(
        {
            "google_oauth": {
                "client_id": "123456789-test.apps.googleusercontent.com",
                "client_secret": "client-secret",
                "redirect_uri": "https://example.streamlit.app",
            }
        }
    )

    assert config["web"]["client_id"] == "123456789-test.apps.googleusercontent.com"
    assert config["web"]["client_secret"] == "client-secret"
    assert config["redirect_uri"] == "https://example.streamlit.app"
    assert config["folder_name"] == DEFAULT_DRIVE_FOLDER_NAME


def test_oauth_config_problem_rejects_placeholder_client_id():
    problem = oauth_config_problem(
        {
            "google_oauth": {
                "client_id": "your-google-oauth-client-id",
                "client_secret": "client-secret",
                "redirect_uri": "https://example.streamlit.app",
            }
        }
    )

    assert "placeholder" in problem


def test_oauth_config_problem_rejects_malformed_client_id():
    problem = oauth_config_problem(
        {
            "google_oauth": {
                "client_id": "not-a-google-client",
                "client_secret": "client-secret",
                "redirect_uri": "https://example.streamlit.app",
            }
        }
    )

    assert "apps.googleusercontent.com" in problem


def test_oauth_flow_uses_persisted_pkce_verifier():
    config = auth_config_from_streamlit_secrets(
        {
            "google_oauth": {
                "client_id": "123456789-test.apps.googleusercontent.com",
                "client_secret": "client-secret",
                "redirect_uri": "https://example.streamlit.app/",
            }
        }
    )

    flow = oauth_flow_from_config(config, state="state", code_verifier="verifier")

    assert flow.code_verifier == "verifier"


def test_streamlit_oidc_config_requires_access_token_and_drive_scope():
    base = {
        "redirect_uri": "https://example.streamlit.app/oauth2callback",
        "cookie_secret": "cookie-secret",
        "client_id": "123.apps.googleusercontent.com",
        "client_secret": "client-secret",
        "server_metadata_url": "https://accounts.google.com/.well-known/openid-configuration",
    }

    assert "expose_tokens" in streamlit_oidc_config_problem({"auth": base})
    base["expose_tokens"] = "access"
    assert "drive.file" in streamlit_oidc_config_problem({"auth": base})
    base["client_kwargs"] = {
        "scope": "openid profile email https://www.googleapis.com/auth/drive.file"
    }
    assert streamlit_oidc_config_problem({"auth": base}) is None


def test_access_token_credentials_can_call_drive_without_browser_storage():
    credentials = credentials_from_access_token("access-token")

    assert credentials.token == "access-token"
    assert credentials.refresh_token is None
