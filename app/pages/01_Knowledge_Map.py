from __future__ import annotations

from app.knowledge_map import render_fullscreen_knowledge_map
from app.page_helpers import app_context, set_page_config

set_page_config()
_track, skills, _warnings, progress = app_context()
render_fullscreen_knowledge_map(skills, progress)
