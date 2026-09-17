"""§10's weekly report as a PDF — the diet module's own document.

WHY A SECOND MODULE AND NOT A SECOND BRANCH IN `core/report_pdf.py`. The two
reports have nothing in common but a week: the psychotherapy one is four metric
cards, a summary sentence, two rankings and a list of flagged days, all of them
derived from `diary`; this one is a grid of meals, a ranking of feelings picked
beside them, and seven days of four diaries. A shared renderer would be a
function whose every section was behind an `if module ==`.

What *is* shared is the paper: `core/report_pdf.py` owns the fonts, the styles,
the section wrapper and the page furniture, and they are imported rather than
restated so the two documents are recognisably one product.

**IT COUNTS NOTHING ABOUT FOOD, AND THAT IS THE RULE THIS FILE HAS TO KEEP.**
The module's premise — the client's own words on the artboards — is that it
describes eating rather than measuring it: no calories, no portions, no score
for a day, and the "Pory posiłków" table draws the meals themselves rather than
a number per cell (see `_meal_grid` in core/diet_reports.py, whose docstring
says the same thing about the screen). The one place a number appears is the
ranking of emotions, and that number is a patient's own slider read back.

WHOSE DOCUMENT IT IS. Like the psychotherapy PDF, the address printed on it is
always the **patient's**, whoever downloaded it: a printout that leaves the app
has to say whose week it is, and on a specialist's copy the reader is not the
subject.
"""

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (KeepTogether, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)

from .modules import MODULE_DIET, module_label
from .report_pdf import (RULE, _page_furniture, _register_fonts, _section,
                         _styles, text)
from .time_of_day import time_of_day_label

#: What §07 and the report call the fifth column: meals saved without an hour.
#: Imported rather than re-spelled, so the grid and the document agree about
#: which cell a meal with no clock lands in.
from .diet_reports import MEAL_SLOT_UNSPECIFIED  # noqa: E402  (after the styles)

#: The fifth column's heading. `core/diet_reports.py` sends the slot as a key;
#: 'Bez godziny' is what `utils/dietReport.ts` prints for it on the screen, and
#: the document says the same words.
UNSPECIFIED_SLOT_LABEL = 'Bez godziny'

#: Seven days, named the way a person reads a date rather than by weekday index.
WEEKDAYS = ('poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota',
            'niedziela')


def pdf_file_name(report):
    """ASCII by construction, so no Content-Disposition encoding games.

    Named apart from the psychotherapy document deliberately: a specialist
    downloading both for one patient ends up with two files in one folder, and
    two `raport-tygodniowy-2026-09-01.pdf` would be one file and a browser's
    "(1)".
    """
    return f"raport-zywieniowy-{report['week_start']}.pdf"


def _day_label(iso):
    """'poniedziałek, 2026-09-01' — the weekday and the date it is."""
    import datetime

    try:
        day = datetime.date.fromisoformat(iso)
    except (TypeError, ValueError):
        return iso
    return f'{WEEKDAYS[day.weekday()]}, {iso}'


def _slot_label(slot):
    return (
        UNSPECIFIED_SLOT_LABEL if slot == MEAL_SLOT_UNSPECIFIED
        else time_of_day_label(slot)
    )


def _meal_name(meal):
    """One meal inside a grid cell: its kind, or its hour, or a neutral word.

    §05's rule is that no field blocks a save, so a meal may answer neither —
    and a cell reading "Nieznany posiłek" would label an answer somebody chose
    not to give. 'posiłek' is what it is.
    """
    return text(meal.get('kind') or meal.get('time') or 'posiłek')


def _meal_grid(report, styles):
    """"Pory posiłków" — one row per day, one column per part of the day.

    NO NUMBER ANYWHERE IN IT: not in a cell, not at the end of a row, not at the
    foot of a column. The screen's own grid is built under the same rule and
    `DietReportDetail.test.tsx` sweeps for a stray count; this is the document's
    half of that promise.
    """
    grid = report.get('meal_grid') or {}
    slots = grid.get('slots') or []
    rows = grid.get('rows') or []
    if not slots or not rows:
        return Paragraph(
            'W tym tygodniu nie zapisano żadnego posiłku.', styles['body'],
        )

    header = [Paragraph('Dzień', styles['body'])] + [
        Paragraph(text(_slot_label(slot)), styles['body']) for slot in slots
    ]
    body = []
    for row in rows:
        cells = [Paragraph(text(_day_label(row['date'])), styles['body'])]
        for cell in row['cells']:
            names = ', '.join(_meal_name(meal) for meal in cell['meals'])
            cells.append(Paragraph(names or '—', styles['body']))
        body.append(cells)

    table = Table([header] + body, hAlign='LEFT', repeatRows=1)
    table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, RULE),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f4f6f2')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return table


def _emotions(report, styles):
    """"Najczęstsze emocje przy jedzeniu" — the module's one ranking.

    Ordered by how often, which is what the section is named for, with the
    average as a second number where it cannot be mistaken for the ordering.
    `avg_intensity` is None for a feeling picked but never rated, and it prints
    as "bez oceny" rather than as 0 — a slider nobody moved is not a zero.
    """
    rows = (report.get('emotions') or {}).get('rows') or []
    if not rows:
        return Paragraph(
            'W tym tygodniu nie zaznaczono żadnej emocji przy posiłku.',
            styles['body'],
        )

    lines = []
    for row in rows:
        average = row.get('avg_intensity')
        rating = (
            'bez oceny' if average is None
            else f"średnio {average:.1f}".replace('.', ',')
        )
        meals = row['meals']
        noun = 'posiłku' if meals == 1 else 'posiłkach'
        lines.append(Paragraph(
            f"{text(row['emotion'])} — przy {meals} {noun}, {rating}",
            styles['body'],
        ))
    return KeepTogether(lines)


def _facts(pairs, styles):
    """A short list of "label: value" lines, skipping the ones with no answer."""
    return [
        Paragraph(f'{text(label)}: {text(value)}', styles['body'])
        for label, value in pairs
        if value not in (None, '')
    ]


def _sleep_lines(night, styles):
    quality = night.get('quality')
    return _facts(
        [
            ('Zaśnięcie', night.get('fell_asleep_at')),
            ('Przebudzenie', night.get('woke_up_at')),
            # "3 w skali 1-5" rather than "3 z 5", the screen's own wording: a
            # fraction would read as a score out of five.
            ('Jakość snu', None if quality is None else f'{quality} w skali 1-5'),
            ('Samopoczucie po przebudzeniu', night.get('wake_feeling')),
        ],
        styles,
    )


def _activity_lines(activity, styles):
    """One day's movement, as the day carries it.

    The shape is whatever `core/activity.py` sent — a day of entries, or a step
    count, or both — so this reads defensively rather than asserting a schema
    the report may change under it.
    """
    lines = []
    steps = activity.get('steps')
    if steps is not None:
        lines += _facts([('Kroki', steps)], styles)
    for entry in activity.get('entries') or []:
        kind = entry.get('kind_other') or entry.get('kind') or 'aktywność'
        minutes = entry.get('duration_minutes')
        when = entry.get('time')
        detail = ', '.join(
            part for part in (
                when,
                None if minutes is None else f'{minutes} min',
                entry.get('feeling_after'),
            ) if part
        )
        lines.append(Paragraph(
            text(f'{kind}{f" — {detail}" if detail else ""}'), styles['body'],
        ))
    return lines


def _day(day, styles):
    """One day of the week, or the plain sentence that it holds nothing.

    "brak wpisu" is the screen's own wording and it is deliberately quiet: a day
    nobody wrote on is an ordinary day, not a gap to dramatise — the footer says
    as much.
    """
    heading = Paragraph(text(_day_label(day['date'])), styles['heading'])
    if day.get('empty'):
        return KeepTogether([heading, Paragraph('brak wpisu', styles['body'])])

    content = [heading]

    meals = day.get('meals') or []
    if meals:
        content.append(Paragraph('Posiłki', styles['body']))
        for meal in meals:
            label = ' · '.join(
                part for part in (meal.get('kind'), meal.get('time')) if part
            )
            description = (meal.get('description') or '').strip()
            line = ' — '.join(part for part in (label, description) if part)
            content.append(Paragraph(text(line or 'posiłek'), styles['body']))

    hydration = day.get('hydration')
    if hydration:
        glasses = hydration.get('glasses')
        # Formatted the way the hydration screen formats it (a comma, at most
        # one decimal) and never recomputed here: the figure is the server's own.
        shown = f'{glasses:.1f}'.rstrip('0').rstrip('.').replace('.', ',')
        content.append(Paragraph(f'Nawodnienie: {shown} szkl.', styles['body']))

    night = day.get('sleep')
    if night:
        content.append(Paragraph('Sen', styles['body']))
        content += _sleep_lines(night, styles)

    activity = day.get('activity')
    if activity:
        content.append(Paragraph('Aktywność', styles['body']))
        content += _activity_lines(activity, styles)

    content.append(Spacer(1, 3 * mm))
    return KeepTogether(content)


def render_diet_report_pdf(report, patient_email):
    """One weekly diet report as PDF bytes.

    Takes the payload and the address rather than a patient or an id, exactly
    like `report_pdf.render_report_pdf`: everything the document says is already
    in the two, which keeps this file free of database access and testable on a
    dict. `patient_email` has no default for the same reason it has none there —
    a report with nobody's name on it is not a safer document, it is a useless
    one, and a default would make producing one easy to do by accident.
    """
    styles = _styles()
    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Raport żywieniowy {report['range_label']}",
        author='Mediculus', subject='Tygodniowe podsumowanie dzienniczka żywieniowego',
    )

    document.build(
        build_story(report, patient_email, styles),
        onFirstPage=_page_furniture, onLaterPages=_page_furniture,
    )
    return buffer.getvalue()


def build_story(report, patient_email, styles=None):
    """The document's content, as Platypus flowables.

    Separate from `render_diet_report_pdf` so the content can be asserted on:
    once the bytes exist there is nothing to read, because the fonts are subset
    and searching the PDF for a string finds nothing whether it is in the
    document or not.
    """
    _register_fonts()
    styles = styles or _styles()
    days_with_entry = report.get('days_with_entry', 0)

    story = [
        Paragraph('Raport tygodniowy', styles['title']),
        Spacer(1, 3 * mm),
        # Which module's report this is, said on the page rather than left to
        # the file name: a specialist holding both documents for one patient has
        # two papers that start with the same three words.
        Paragraph(text(module_label(MODULE_DIET)), styles['subtitle']),
        Paragraph(text(report['range_label']), styles['subtitle']),
        # A plain count, never a fraction of seven and never a percentage: the
        # module does not score a week. Same wording as the screen's
        # "Regularność wpisów".
        Paragraph(f'Dni z wpisem: {days_with_entry} z 7', styles['subtitle']),
        Paragraph(f'Pacjent: {text(patient_email)}', styles['patient']),
        Spacer(1, 8 * mm),
        _section('Pory posiłków', _meal_grid(report, styles), styles),
        _section(
            'Najczęstsze emocje przy jedzeniu', _emotions(report, styles), styles,
        ),
        Paragraph('Zestawienie tygodnia', styles['heading']),
    ]
    story += [_day(day, styles) for day in report.get('days') or []]
    story += [
        Spacer(1, 10 * mm),
        Paragraph(
            'Dokument wygenerowany automatycznie na podstawie wpisów w dzienniczku '
            'żywieniowym. Nie zawiera oceny sposobu odżywiania. Zawiera dane '
            'dotyczące zdrowia — przechowuj go tak, jak dokumentację medyczną.',
            styles['footer'],
        ),
    ]
    return story
