from __future__ import annotations

import html

import streamlit as st


def analog_clock(width: int = 150, height: int = 150, enabled: bool = True) -> None:
    if not enabled:
        return
    st.iframe(_analog_clock_html(width=width, height=height), width=width, height=height)


def _analog_clock_html(width: int = 150, height: int = 150) -> str:
    safe_width = max(96, int(width))
    safe_height = max(96, int(height))
    component_id = f"qm-analog-clock-{safe_width}-{safe_height}"
    escaped_id = html.escape(component_id, quote=True)
    return f"""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {{
    margin: 0;
    padding: 0;
    background: transparent;
    overflow: hidden;
  }}
  .qm-clock-wrap {{
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
  }}
  .qm-clock {{
    width: min(100vw, 100vh, 100%);
    height: min(100vw, 100vh, 100%);
    display: block;
  }}
  .qm-face {{
    fill: #ffffff;
    stroke: #1f2937;
    stroke-width: 4;
  }}
  .qm-hour-mark {{
    stroke: #1f2937;
    stroke-width: 4;
    stroke-linecap: round;
  }}
  .qm-minute-mark {{
    stroke: #64748b;
    stroke-width: 1.5;
    stroke-linecap: round;
  }}
  .qm-hand-hour {{
    stroke: #111827;
    stroke-width: 6;
    stroke-linecap: round;
  }}
  .qm-hand-minute {{
    stroke: #111827;
    stroke-width: 4;
    stroke-linecap: round;
  }}
  .qm-hand-second {{
    stroke: #dc2626;
    stroke-width: 2;
    stroke-linecap: round;
  }}
  .qm-center {{
    fill: #111827;
  }}
</style>
</head>
<body>
<div class="qm-clock-wrap">
  <svg id="{escaped_id}" class="qm-clock" viewBox="0 0 120 120" role="img" aria-label="Analog clock">
    <circle class="qm-face" cx="60" cy="60" r="55"></circle>
    <g id="{escaped_id}-minute-marks"></g>
    <g id="{escaped_id}-hour-marks"></g>
    <line id="{escaped_id}-hour" class="qm-hand-hour" x1="60" y1="60" x2="60" y2="33"></line>
    <line id="{escaped_id}-minute" class="qm-hand-minute" x1="60" y1="60" x2="60" y2="22"></line>
    <line id="{escaped_id}-second" class="qm-hand-second" x1="60" y1="66" x2="60" y2="17"></line>
    <circle class="qm-center" cx="60" cy="60" r="4"></circle>
  </svg>
</div>
<script>
(function() {{
  const rootId = "{escaped_id}";
  const svgNS = "http://www.w3.org/2000/svg";
  const minuteMarks = document.getElementById(rootId + "-minute-marks");
  const hourMarks = document.getElementById(rootId + "-hour-marks");

  function polarPoint(angleDeg, radius) {{
    const angle = (angleDeg - 90) * Math.PI / 180;
    return {{
      x: 60 + radius * Math.cos(angle),
      y: 60 + radius * Math.sin(angle)
    }};
  }}

  for (let i = 0; i < 60; i += 1) {{
    const angle = i * 6;
    const isHour = i % 5 === 0;
    const outer = polarPoint(angle, 50);
    const inner = polarPoint(angle, isHour ? 42 : 47);
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", inner.x.toFixed(2));
    line.setAttribute("y1", inner.y.toFixed(2));
    line.setAttribute("x2", outer.x.toFixed(2));
    line.setAttribute("y2", outer.y.toFixed(2));
    line.setAttribute("class", isHour ? "qm-hour-mark" : "qm-minute-mark");
    (isHour ? hourMarks : minuteMarks).appendChild(line);
  }}

  function setHand(id, angleDeg) {{
    const hand = document.getElementById(rootId + "-" + id);
    hand.setAttribute("transform", "rotate(" + angleDeg + " 60 60)");
  }}

  function updateClock() {{
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    setHand("second", seconds * 6);
    setHand("minute", minutes * 6);
    setHand("hour", hours * 30);
    window.requestAnimationFrame(updateClock);
  }}

  updateClock();
}})();
</script>
</body>
</html>
""".strip()
