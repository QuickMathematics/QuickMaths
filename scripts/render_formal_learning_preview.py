"""Offline layout check of the actual workspace using REAL HTTP fixture data.

First run test_formal_learning_http.py with the same --output-dir. This script
uses set_content, not browser navigation, and does not test application events.
No verifier status or successful certificate is fabricated for the screenshot.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    from playwright.sync_api import sync_playwright
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    css = (ROOT / "docs/challenge.css").read_text()
    css = re.sub(r"@import[^;]+;", "", css)
    css += "\n" + (ROOT / "docs/math-display.css").read_text()
    # The surrounding standalone preview frame is intentionally not a mock
    # of the full application's navigation or state-changing event handlers.
    css += "\n.preview-frame{max-width:1250px;margin:0 auto;padding:24px 16px;}@media(max-width:600px){.preview-frame{padding:10px;}}"
    output = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which("chromium") or shutil.which("chromium-browser"), args=["--no-sandbox"])
        for state in ["obligation", "repaired"]:
            content = (args.output_dir / f"formal-learning-{state}.html").read_text()
            for name, width, height in [("desktop", 1440, 1100), ("mobile", 390, 844)]:
                page = browser.new_page(viewport={"width": width, "height": height})
                page.set_content(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{css}</style></head><body><main class="preview-frame">{content}</main></body></html>')
                page.wait_for_timeout(100)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"{state}/{name} overflow"
                assert page.locator(".kernel-verified").count() == 0, "Preview expects uncertified candidate data."
                assert page.get_by_label("Socratic proof guidance").count() == 1
                path = args.output_dir / f"formal-learning-{state}-{name}.png"
                page.screenshot(path=str(path), full_page=True)
                output.append(str(path))
                page.close()
        browser.close()
    print(json.dumps({"status": "passed", "scope": "isolated real workspace layout, not full native-browser interaction", "widths": [1440, 390], "screenshots": output}, indent=2))


if __name__ == "__main__":
    main()
