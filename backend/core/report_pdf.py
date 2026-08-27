"""The weekly report as a PDF.

Rendered on the server, from the same `build_report` payload the JSON endpoint
answers with, so the document a specialist reads and the screen the patient sees
are the same report rather than two derivations of it.

ReportLab rather than WeasyPrint, which was the first instinct: WeasyPrint turns
HTML into PDF and would match the web design more closely, but it needs Pango,
Cairo and gdk-pixbuf — roughly 150 MB of apt packages on top of `python:3.12-slim`
and a Dockerfile change on a deployment that is already behind. What this
document actually is — a heading, four figures, two rankings, a list and a
paragraph — is tables and paragraphs, which is exactly what Platypus does with
no system dependencies at all.

Deliberately not a copy of the screen: no colour-coded tones, no chips. A tone
is a nudge that belongs next to an interface a patient is reading, not in a
document that will be printed, filed, and read months later by somebody who was
not there.

The one thing the document carries that the screen does not is the patient's
address, under the entry count. It is what makes the file a record rather than
an anonymous page of numbers — a printout that reaches a specialist has to say
whose week it is. Note where the join happens: `core/reports.py` aggregates
medical_db and never sees an address, and the two halves only meet here, at
render time, on a value the view read out of the session.
"""

import io
import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

from .reports import DAYS_IN_WEEK, format_number, plural_days

#: Committed to the repository — see core/fonts/README.md. ReportLab's bundled
#: Vera has no 'ą ę ń ś ź ż', which is most of a Polish report.
FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
FONT_REGULAR = 'LiberationSans'
FONT_BOLD = 'LiberationSans-Bold'

#: Borrowed from frontend/src/styles/theme.css so the document is recognisably
#: the same product, in the two places a PDF can carry colour without becoming
#: a verdict: the heading and the table rules.
GRAPHITE = colors.HexColor('#2C3833')
GRAPHITE_MUTED = colors.HexColor('#5B6A63')
SAGE = colors.HexColor('#4F7A64')
RULE = colors.HexColor('#DCE2DF')

def text(value):
    """Whatever is going into a Paragraph, made safe to put there.

    ReportLab parses a mini-HTML in paragraph text, so a bare '&' raises and a
    stray '<b>' would be honoured as markup. Some of what this document prints
    is typed by the patient — the 'Inne' trigger and the risky-behaviour note —
    so an entry containing an ampersand would otherwise fail to export at all,
    and only for the patient unlucky enough to have written one.

    Applied to every string rather than only the user-typed ones: escaping text
    that holds no markup costs nothing, and one rule survives the next field
    somebody adds.
    """
    return escape(str(value))


_fonts_registered = False


def _register_fonts():
    """Idempotent: pdfmetrics keeps one global registry per process."""
    global _fonts_registered
    if _fonts_registered:
        return
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, os.path.join(FONTS_DIR, 'LiberationSans-Regular.ttf')))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(FONTS_DIR, 'LiberationSans-Bold.ttf')))
    _fonts_registered = True


def _styles():
    base = ParagraphStyle(
        'base', fontName=FONT_REGULAR, fontSize=10, leading=14,
        textColor=GRAPHITE, alignment=TA_LEFT,
    )
    return {
        'title': ParagraphStyle('title', parent=base, fontName=FONT_BOLD, fontSize=18, leading=23),
        'subtitle': ParagraphStyle('subtitle', parent=base, fontSize=11, textColor=GRAPHITE_MUTED),
        'heading': ParagraphStyle('heading', parent=base, fontName=FONT_BOLD, fontSize=12, leading=16, spaceBefore=14, spaceAfter=6),
        'body': base,
        'muted': ParagraphStyle('muted', parent=base, textColor=GRAPHITE_MUTED),
        'metricLabel': ParagraphStyle('metricLabel', parent=base, fontSize=8, textColor=GRAPHITE_MUTED),
        'metricValue': ParagraphStyle('metricValue', parent=base, fontName=FONT_BOLD, fontSize=15, leading=19),
        'metricDelta': ParagraphStyle('metricDelta', parent=base, fontSize=8, textColor=GRAPHITE_MUTED),
        # Bolder than the range above it: on a printed page this is the line a
        # reader looks for first to know whose document they are holding.
        'patient': ParagraphStyle('patient', parent=base, fontName=FONT_BOLD, fontSize=11, spaceBefore=2),
        'footer': ParagraphStyle('footer', parent=base, fontSize=8, textColor=GRAPHITE_MUTED),
    }


def format_delta(delta):
    """A change as a direction and a value, never as a verdict.

    The same three cases as `formatDelta` in frontend/src/utils/reports.ts, and
    the same U+2212 minus, which lines up with the plus at equal optical weight.
    A gap is spelled out here rather than left blank: a reader holding a printout
    cannot hover over anything to find out why a number is missing.
    """
    if delta['value'] is None:
        return ('za mało ocen, żeby porównać z poprzednim tygodniem'
                if delta['gap'] == 'unrated'
                else 'brak poprzedniego tygodnia do porównania')
    if delta['value'] == 0:
        return 'bez zmian od poprzedniego tygodnia'
    sign = '+' if delta['value'] > 0 else '−'
    magnitude = format_number(abs(delta['value']), delta['decimals'])
    unit = f" {delta['unit']}" if delta['unit'] else ''
    return f'{sign}{magnitude}{unit} od poprzedniego tygodnia'


def _metric_cards(report, styles):
    """The four figures, two per row, as a bordered 2x2 table."""
    cells = [
        [
            Paragraph(text(metric['label']), styles['metricLabel']),
            Paragraph(text(metric['value']), styles['metricValue']),
            Paragraph(text(format_delta(metric['delta'])), styles['metricDelta']),
        ]
        for metric in report['metrics']
    ]
    stacked = [Table([[cell] for cell in card], style=[
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]) for card in cells]

    rows = [stacked[index:index + 2] for index in range(0, len(stacked), 2)]
    table = Table(rows, colWidths=[85 * mm, 85 * mm])
    table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, RULE),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return table


def _ranking(rows, styles, empty_message):
    """A ranking as 'name … N dni' lines. Bars would need a colour per emotion,
    and colour here is what the module docstring says it will not do."""
    if not rows:
        return Paragraph(empty_message, styles['muted'])
    table = Table(
        [[Paragraph(text(label), styles['body']),
          Paragraph(f'{days} {plural_days(days)}', styles['body'])]
         for label, days in rows],
        colWidths=[130 * mm, 40 * mm],
    )
    table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, RULE),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def _risky_days(report, styles):
    if not report['risky_days']:
        return Paragraph(
            'W tym tygodniu nie oznaczono żadnego dnia jako ryzykownego.', styles['muted'],
        )
    rows = []
    for day in report['risky_days']:
        # An empty preview is a day flagged with no description — a real state,
        # and saying nothing next to the date would read as a rendering fault.
        note = day['note_preview'] or 'bez opisu'
        rows.append([Paragraph(text(day['date']), styles['body']), Paragraph(text(note), styles['body'])])
    table = Table(rows, colWidths=[30 * mm, 140 * mm])
    table.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def _section(title, content, styles):
    """A heading and its content, kept on one page where they fit."""
    return KeepTogether([Paragraph(text(title), styles['heading']), content])


def pdf_file_name(report):
    """ASCII by construction, so no Content-Disposition encoding games."""
    return f"raport-tygodniowy-{report['week_start']}.pdf"


def render_report_pdf(report, patient_email):
    """One weekly report as PDF bytes.

    Takes the payload and the address rather than a patient or an id: everything
    the document says is already in the two, which keeps this file free of
    database access and testable on a dict.

    `patient_email` has no default on purpose. A report with nobody's name on it
    is not a safer document, it is a useless one — but it would look fine in a
    test, so the only way to produce one has to be to say so out loud.

    Nothing *else* identifying goes in: no `id_medical`, no user id, and nothing
    in the PDF metadata either, which is the half people forget when they redact
    a file.
    """
    styles = _styles()
    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
        title=f"Raport tygodniowy {report['range_label']}",
        author='Mediculus', subject='Tygodniowe podsumowanie dzienniczka',
    )

    document.build(
        build_story(report, patient_email, styles),
        onFirstPage=_page_furniture, onLaterPages=_page_furniture,
    )
    return buffer.getvalue()


def build_story(report, patient_email, styles=None):
    """The document's content, as Platypus flowables.

    Separate from `render_report_pdf` so the content can be asserted on. Once
    the bytes exist there is nothing to read: the fonts are subset, so text is
    written as glyph codes and searching the PDF for a string finds nothing
    whether it is in the document or not — a test written against the bytes
    passes either way and proves nothing.
    """
    _register_fonts()
    styles = styles or _styles()
    entry_count = report['entry_count']
    return [
        Paragraph('Raport tygodniowy', styles['title']),
        Spacer(1, 3 * mm),
        Paragraph(text(report['range_label']), styles['subtitle']),
        Paragraph(
            f'Wpisy: {entry_count} z {DAYS_IN_WEEK} dni', styles['subtitle'],
        ),
        Paragraph(f'Pacjent: {text(patient_email)}', styles['patient']),
        Spacer(1, 8 * mm),
        _metric_cards(report, styles),
        _section('Podsumowanie', Paragraph(text(report['summary']), styles['body']), styles),
        _section(
            'Najczęściej odczuwane emocje',
            _ranking(
                [(row['emotion'], row['days']) for row in report['emotions']],
                styles, 'W tym tygodniu nie oceniono żadnej emocji.',
            ),
            styles,
        ),
        _section(
            'Najczęstsze wyzwalacze',
            _ranking(
                [(row['trigger'], row['days']) for row in report['triggers']],
                styles, 'W tym tygodniu nie zapisano żadnego miejsca ani wyzwalacza.',
            ),
            styles,
        ),
        _section('Dni z zachowaniem ryzykownym', _risky_days(report, styles), styles),
        Spacer(1, 10 * mm),
        Paragraph(
            'Dokument wygenerowany automatycznie na podstawie wpisów w dzienniczku. '
            'Zawiera dane dotyczące zdrowia — przechowuj go tak, jak dokumentację medyczną.',
            styles['footer'],
        ),
    ]


def _page_furniture(canvas, document):
    """A rule under the header and a page number, on every page."""
    canvas.saveState()
    canvas.setStrokeColor(SAGE)
    canvas.setLineWidth(1)
    y = A4[1] - 14 * mm
    canvas.line(20 * mm, y, A4[0] - 20 * mm, y)
    canvas.setFont(FONT_REGULAR, 8)
    canvas.setFillColor(GRAPHITE_MUTED)
    canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f'Strona {document.page}')
    canvas.drawString(20 * mm, 10 * mm, 'Mediculus')
    canvas.restoreState()
