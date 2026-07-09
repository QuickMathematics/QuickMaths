from quickmaths.cloud_storage import DEFAULT_DRIVE_FOLDER_NAME, auth_config_from_streamlit_secrets


def test_auth_config_from_streamlit_secrets_requires_core_fields():
    assert auth_config_from_streamlit_secrets({}) == {}
    assert auth_config_from_streamlit_secrets({"google_oauth": {"client_id": "id"}}) == {}


def test_auth_config_from_streamlit_secrets_builds_web_client_config():
    config = auth_config_from_streamlit_secrets(
        {
            "google_oauth": {
                "client_id": "client-id",
                "client_secret": "client-secret",
                "redirect_uri": "https://example.streamlit.app",
            }
        }
    )

    assert config["web"]["client_id"] == "client-id"
    assert config["web"]["client_secret"] == "client-secret"
    assert config["redirect_uri"] == "https://example.streamlit.app"
    assert config["folder_name"] == DEFAULT_DRIVE_FOLDER_NAME
