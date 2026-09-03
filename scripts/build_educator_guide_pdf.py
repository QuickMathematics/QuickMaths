from __future__ import annotations

import re
import shutil
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    LongTable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "EDUCATOR_GUIDE.md"
OUTPUT = ROOT / "output" / "pdf" / "QuickMaths-Educator-Guide.pdf"
PUBLIC = ROOT / "docs" / "QuickMaths-Educator-Guide.pdf"

PAGE_W, PAGE_H = A4
PINE = colors.HexColor("#123F3A")
PINE_2 = colors.HexColor("#0B2F2B")
MINT = colors.HexColor("#E2F0EB")
LIME = colors.HexColor("#DDF19B")
CORAL = colors.HexColor("#D8755B")
INK = colors.HexColor("#14211E")
MUTED = colors.HexColor("#5C6965")
PAPER = colors.HexColor("#F6F1E7")
PAPER_LIGHT = colors.HexColor("#FEFCF7")
LINE = colors.HexColor("#D8D0C2")


def inline_markup(text: str) -> str:
    value = escape(text.strip())
    value = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#123F3A">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"(?<![\"'=])(https://[^\s<]+)", r'<link href="\1" color="#0B625A"><u>\1</u></link>', value)
    return value


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverKicker", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9,
    leading=12, textColor=LIME, uppercase=True, spaceAfter=10, letterSpacing=1.4,
))
styles.add(ParagraphStyle(
    name="CoverTitle", parent=styles["Title"], fontName="Times-Roman", fontSize=42,
    leading=39, textColor=colors.white, alignment=TA_LEFT, spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="CoverSub", parent=styles["Normal"], fontName="Helvetica", fontSize=14,
    leading=21, textColor=colors.HexColor("#D8E7E2"), spaceAfter=18,
))
styles.add(ParagraphStyle(
    name="H1QM", parent=styles["Heading1"], fontName="Times-Roman", fontSize=28,
    leading=31, textColor=PINE_2, spaceBefore=14, spaceAfter=10, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="H2QM", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15,
    leading=19, textColor=PINE, spaceBefore=12, spaceAfter=7, keepWithNext=True,
))
styles.add(ParagraphStyle(
    name="BodyQM", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.25,
    leading=14, textColor=INK, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="SmallQM", parent=styles["BodyText"], fontName="Helvetica", fontSize=8,
    leading=11.5, textColor=MUTED, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BulletQM", parent=styles["BodyQM"], leftIndent=14, firstLineIndent=-8,
    bulletIndent=2, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="CodeQM", parent=styles["BodyQM"], fontName="Courier", fontSize=7.6,
    leading=11, leftIndent=10, rightIndent=10, textColor=PINE_2, backColor=MINT,
    borderPadding=8, borderColor=LINE, borderWidth=.5, borderRadius=5, spaceBefore=4, spaceAfter=9,
))
styles.add(ParagraphStyle(
    name="CalloutQM", parent=styles["BodyQM"], leftIndent=12, rightIndent=12,
    textColor=PINE_2, backColor=LIME, borderPadding=10, borderColor=PINE,
    borderWidth=.7, borderRadius=6, spaceBefore=6, spaceAfter=11,
))
styles.add(ParagraphStyle(
    name="TOCTitleQM", parent=styles["Heading1"], fontName="Times-Roman", fontSize=30,
    leading=34, textColor=PINE_2, spaceAfter=18,
))


class EducatorDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            rightMargin=18 * mm,
            leftMargin=18 * mm,
            topMargin=20 * mm,
            bottomMargin=18 * mm,
            title="QuickMaths Educator Guide",
            author="QuickMaths",
            subject="Complete educator and curriculum design documentation",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="content")
        self.addPageTemplates(PageTemplate(id="main", frames=[frame], onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        if doc.page == 1:
            canvas.setFillColor(PINE_2)
            canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
            canvas.setFillColor(CORAL)
            canvas.circle(PAGE_W - 26 * mm, PAGE_H - 28 * mm, 42 * mm, fill=1, stroke=0)
            canvas.setFillColor(PINE)
            canvas.circle(PAGE_W - 15 * mm, 23 * mm, 54 * mm, fill=1, stroke=0)
        else:
            canvas.setFillColor(PAPER_LIGHT)
            canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
            canvas.setStrokeColor(LINE)
            canvas.line(18 * mm, PAGE_H - 13 * mm, PAGE_W - 18 * mm, PAGE_H - 13 * mm)
            canvas.setFont("Helvetica-Bold", 7.5)
            canvas.setFillColor(PINE)
            canvas.drawString(18 * mm, PAGE_H - 9.5 * mm, "QUICKMATHS EDUCATOR GUIDE")
            canvas.setFont("Helvetica", 7.5)
            canvas.setFillColor(MUTED)
            canvas.drawRightString(PAGE_W - 18 * mm, PAGE_H - 9.5 * mm, "APP VERSION 26")
            canvas.setStrokeColor(LINE)
            canvas.line(18 * mm, 12 * mm, PAGE_W - 18 * mm, 12 * mm)
            canvas.setFont("Helvetica", 7.5)
            canvas.drawString(18 * mm, 8 * mm, "quickmathematics.github.io/QuickMaths")
            canvas.drawRightString(PAGE_W - 18 * mm, 8 * mm, f"{doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            if flowable.style.name == "H1QM":
                key = f"section-{self.seq.nextf('section')}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(flowable.getPlainText(), key, level=0, closed=False)
                self.notify("TOCEntry", (0, flowable.getPlainText(), self.page, key))
            elif flowable.style.name == "H2QM":
                key = f"subsection-{self.seq.nextf('subsection')}"
                self.canv.bookmarkPage(key)
                self.notify("TOCEntry", (1, flowable.getPlainText(), self.page, key))


def parse_table(lines: list[str]) -> LongTable:
    rows = []
    for index, line in enumerate(lines):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if index == 1 and all(re.fullmatch(r"[-: ]+", cell) for cell in cells):
            continue
        style = styles["SmallQM"]
        rows.append([Paragraph(inline_markup(cell), style) for cell in cells])
    count = max(len(row) for row in rows)
    widths = [((PAGE_W - 36 * mm) / count)] * count
    table = LongTable(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PINE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (-1, -1), PAPER_LIGHT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PAPER_LIGHT, colors.HexColor("#EEF4F0")]),
        ("GRID", (0, 0), (-1, -1), .45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def parse_markdown(markdown: str) -> list:
    source = markdown.splitlines()
    start = next(index for index, line in enumerate(source) if line.startswith("## 1."))
    lines = source[start:]
    story = []
    index = 0
    first_chapter = True
    while index < len(lines):
        raw = lines[index].rstrip()
        stripped = raw.strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("## "):
            story.append(PageBreak() if first_chapter else CondPageBreak(58 * mm))
            story.append(Paragraph(inline_markup(stripped[3:]), styles["H1QM"]))
            first_chapter = False
            index += 1
            continue
        if stripped.startswith("### "):
            story.append(CondPageBreak(28 * mm))
            story.append(Paragraph(inline_markup(stripped[4:]), styles["H2QM"]))
            index += 1
            continue
        if stripped.startswith("| "):
            table_lines = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            story.extend([parse_table(table_lines), Spacer(1, 8)])
            continue
        if stripped.startswith("> "):
            story.append(Paragraph(inline_markup(stripped[2:]), styles["CalloutQM"]))
            index += 1
            continue
        if stripped.startswith("- "):
            items = []
            while index < len(lines) and lines[index].strip().startswith("- "):
                items.append(Paragraph(inline_markup(lines[index].strip()[2:]), styles["BulletQM"], bulletText="-"))
                index += 1
            if len(items) <= 4:
                story.append(KeepTogether(items))
            else:
                story.append(KeepTogether(items[:2]))
                story.extend(items[2:])
            continue
        if re.match(r"^\d+\. ", stripped):
            while index < len(lines) and re.match(r"^\d+\. ", lines[index].strip()):
                match = re.match(r"^(\d+)\. (.*)", lines[index].strip())
                story.append(Paragraph(inline_markup(match.group(2)), styles["BulletQM"], bulletText=f"{match.group(1)}."))
                index += 1
            continue
        if stripped.startswith("`") and stripped.endswith("`"):
            story.append(Paragraph(inline_markup(stripped), styles["CodeQM"]))
            index += 1
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate or candidate.startswith(("## ", "### ", "|", "> ", "- ")) or re.match(r"^\d+\. ", candidate):
                break
            paragraph.append(candidate)
            index += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph)), styles["BodyQM"]))
    return story


def cover_story() -> list:
    prompt = (
        "Open QuickMaths in the ChatGPT/Codex in-app browser. Call "
        "get_educator_agent_manifest through WebMCP."
    )
    info = Table([
        [Paragraph("HUMAN GUIDE", styles["CoverKicker"]), Paragraph("AGENT ENTRY", styles["CoverKicker"])],
        [Paragraph("Every visible control, workflow, file, safety boundary, and recovery path.", styles["CoverSub"]), Paragraph(inline_markup(prompt), styles["CoverSub"])],
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
        Paragraph("QUICKMATHS / EDUCATOR EDITION", styles["CoverKicker"]),
        Paragraph("The complete<br/>educator guide", styles["CoverTitle"]),
        Paragraph("Design curricula. Preserve human judgment.<br/>Give agents clear boundaries.", styles["CoverSub"]),
        Spacer(1, 15 * mm),
        info,
        Spacer(1, 18 * mm),
        Paragraph("Version 26 / September 2026", styles["CoverKicker"]),
        PageBreak(),
    ]


def toc_story() -> list:
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontName="Helvetica-Bold", fontSize=9, leading=14, leftIndent=0, firstLineIndent=0, textColor=PINE_2, spaceBefore=4),
        ParagraphStyle(name="TOC1", fontName="Helvetica", fontSize=7.8, leading=11, leftIndent=12, firstLineIndent=0, textColor=MUTED),
    ]
    return [
        Paragraph("Contents", styles["TOCTitleQM"]),
        Paragraph("A complete reference to the educator workspace and the learner experience it creates.", styles["BodyQM"]),
        Spacer(1, 7),
        toc,
    ]


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    markdown = SOURCE.read_text(encoding="utf-8")
    story = cover_story() + toc_story() + parse_markdown(markdown)
    doc = EducatorDocTemplate(str(OUTPUT))
    doc.multiBuild(story)
    shutil.copyfile(OUTPUT, PUBLIC)
    print(f"Built {OUTPUT}")
    print(f"Published {PUBLIC}")


if __name__ == "__main__":
    build()
