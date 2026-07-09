from quickmaths.cloud_storage import DEFAULT_DRIVE_FOLDER_NAME, auth_config_from_streamlit_secrets, oauth_config_problem


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
