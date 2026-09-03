from __future__ import annotations

import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle
from reportlab.platypus.tableofcontents import TableOfContents

from build_educator_guide_pdf import (
    CORAL,
    PAGE_H,
    PAGE_W,
    PINE,
    PINE_2,
    MUTED,
    EducatorDocTemplate,
    inline_markup,
    parse_markdown,
    styles,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "STUDENT_GUIDE.md"
OUTPUT = ROOT / "output" / "pdf" / "QuickMaths-Student-Guide.pdf"
PUBLIC = ROOT / "docs" / "QuickMaths-Student-Guide.pdf"


class StudentDocTemplate(EducatorDocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename)
        self.title = "QuickMaths Student Guide"
        self.subject = "Complete learner workspace and study workflow documentation"

    def draw_page(self, canvas, doc):
        canvas.saveState()
        if doc.page == 1:
            canvas.setFillColor(PINE_2)
            canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#3A7FC4"))
            canvas.circle(PAGE_W - 25 * mm, PAGE_H - 28 * mm, 42 * mm, fill=1, stroke=0)
            canvas.setFillColor(PINE)
            canvas.circle(PAGE_W - 15 * mm, 23 * mm, 54 * mm, fill=1, stroke=0)
        else:
            canvas.setFillColor(colors.HexColor("#FEFCF7"))
            canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
            canvas.setStrokeColor(colors.HexColor("#D8D0C2"))
            canvas.line(18 * mm, PAGE_H - 13 * mm, PAGE_W - 18 * mm, PAGE_H - 13 * mm)
            canvas.setFont("Helvetica-Bold", 7.5)
            canvas.setFillColor(PINE)
            canvas.drawString(18 * mm, PAGE_H - 9.5 * mm, "QUICKMATHS STUDENT GUIDE")
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(colors.HexColor("#5C6965"))
            canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 9.5 * mm, "APP VERSION 26")
            canvas.setStrokeColor(colors.HexColor("#D8D0C2"))
            canvas.line(18 * mm, 12 * mm, PAGE_W - 18 * mm, 12 * mm)
            canvas.setFont("Helvetica", 7.5)
            canvas.drawString(18 * mm, 8 * mm, "quickmathematics.github.io/QuickMaths")
            canvas.drawRightString(PAGE_W - 18 * mm, 8 * mm, f"{doc.page}")
        canvas.restoreState()


def cover_story() -> list:
    prompt = (
        "Open QuickMaths in the ChatGPT/Codex in-app browser. Call "
        "get_agent_guide with section summary through WebMCP."
    )
    info = Table([
        [Paragraph("LEARNER REFERENCE", styles["CoverKicker"]), Paragraph("AGENT START", styles["CoverKicker"])],
        [Paragraph("Every visible learner control, study workflow, review state, safety boundary, and recovery path.", styles["CoverSub"]), Paragraph(inline_markup(prompt), styles["CoverSub"])],
    ], colWidths=[76 * mm, 76 * mm], hAlign="LEFT")
    info.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), .8, colors.HexColor("#61857F")),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (0, -1), 16),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [
        Spacer(1, 52 * mm),
        Paragraph("QUICKMATHS / STUDENT EDITION", styles["CoverKicker"]),
        Paragraph("The complete<br/>student guide", styles["CoverTitle"]),
        Paragraph("Learn deliberately. Show your reasoning.<br/>Keep your progress yours.", styles["CoverSub"]),
        Spacer(1, 15 * mm),
        info,
        Spacer(1, 18 * mm),
        Paragraph("Version 26 / September 2026", styles["CoverKicker"]),
        PageBreak(),
    ]


def student_toc_story() -> list:
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="StudentTOC0", fontName="Helvetica-Bold", fontSize=9, leading=14, leftIndent=0, firstLineIndent=0, textColor=PINE_2, spaceBefore=4),
        ParagraphStyle(name="StudentTOC1", fontName="Helvetica", fontSize=7.8, leading=11, leftIndent=12, firstLineIndent=0, textColor=MUTED),
    ]
    return [
        Paragraph("Contents", styles["TOCTitleQM"]),
        Paragraph("A complete reference to the learner workspace, study workflow, and portable progress model.", styles["BodyQM"]),
        Spacer(1, 7),
        toc,
    ]


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    markdown = SOURCE.read_text(encoding="utf-8")
    story = cover_story() + student_toc_story() + parse_markdown(markdown)
    doc = StudentDocTemplate(str(OUTPUT))
    doc.multiBuild(story)
    shutil.copyfile(OUTPUT, PUBLIC)
    print(f"Built {OUTPUT}")
    print(f"Published {PUBLIC}")


if __name__ == "__main__":
    build()
