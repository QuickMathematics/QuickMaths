from quickmaths.ui_components import _analog_clock_html


def test_analog_clock_html_is_vector_and_client_side():
    markup = _analog_clock_html(width=150, height=150)

    assert "<svg" in markup
    assert "new Date()" in markup
    assert "requestAnimationFrame" in markup
    assert "qm-hand-second" in markup
    assert "PNG" not in markup.upper()
    assert "JPG" not in markup.upper()
    assert "position: fixed" not in markup
