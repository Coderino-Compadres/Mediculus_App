"""The weekly report as a PDF: the renderer, and the endpoint that serves it.

Split the way the code is — `render_report_pdf` takes a payload and touches no
database, so most of this needs none either. Only the endpoint tests do.
"""

import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase
from django.urls import reverse

from reportlab.platypus import Paragraph, Table

from core.report_pdf import (FONT_REGULAR, build_story, format_delta,
                             pdf_file_name, render_report_pdf)
from core.reports import build_report, week_report_id
from core.tests.test_reports_api import ReportTestCase


def entry(date, **fields):
    """One `serialize_entry`-shaped row, as build_report consumes them."""
    return {
        'id': 'e0000000-0000-0000-0000-000000000001',
        'date': date, 'mood': None, 'emotions': [], 'energy_level': None,
        'tension_level': None, 'situation_place': None, 'risky_behavior_note': None,
        **fields,
    }


WEEK = datetime.date(2026, 8, 3)

EMAIL = 'pacjent@example.com'


def texts(flowables):
    """Every Paragraph's source text in a story, tables walked into.

    Asserting on the rendered bytes is not an option: the fonts are subset, so
    text goes in as glyph codes and a byte search finds nothing whether or not
    the string is in the document. A test written that way passes vacuously —
    which one here did, until this replaced it.
    """
    found = []
    for flowable in flowables:
        if isinstance(flowable, Paragraph):
            found.append(flowable.text)
        elif isinstance(flowable, Table):
            found.extend(texts([cell for row in flowable._cellvalues for cell in row]))
        elif hasattr(flowable, '_content'):  # KeepTogether
            found.extend(texts(flowable._content))
        elif isinstance(flowable, list):
            found.extend(texts(flowable))
    return found


def sample_report(**overrides):
    entries = overrides.pop('entries', [
        entry('2026-08-03', mood='bad', emotions=[{'emotion': 'Lęk', 'intensity': 7}],
              energy_level=3, tension_level=8, situation_place='Szkoła',
              risky_behavior_note='Nie spałam całą noc.'),
        entry('2026-08-05', mood='good', emotions=[{'emotion': 'Spokój', 'intensity': 6}],
              energy_level=7, tension_level=3, situation_place='Dom'),
    ])
    previous = overrides.pop('previous', [entry('2026-07-27', mood='neutral')])
    return build_report(WEEK, entries, previous)


class RendererTests(SimpleTestCase):
    def test_it_produces_a_pdf(self):
        data = render_report_pdf(sample_report(), EMAIL)

        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertGreater(len(data), 1000)

    def test_rendering_twice_does_not_blow_up_on_the_font_registry(self):
        """pdfmetrics keeps one global registry per process, so registering the
        same font on every request has to be a no-op rather than an error."""
        render_report_pdf(sample_report(), EMAIL)
        render_report_pdf(sample_report(), EMAIL)

    def test_the_font_in_use_actually_covers_polish(self):
        """ReportLab's own bundled Vera does not — 'ą ę ń ś ź ż' come out blank,
        which is most of a Polish report and is invisible in a byte count."""
        from reportlab.pdfbase import pdfmetrics

        from core.report_pdf import _register_fonts

        _register_fonts()
        face = pdfmetrics.getFont(FONT_REGULAR).face

        for character in 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ–−…':
            self.assertIn(ord(character), face.charToGlyph, f'brak znaku {character!r}')

    def test_an_empty_week_still_renders(self):
        """A report exists only for a week with entries, but every section in it
        can legitimately be empty — no emotion rated, no place named, no risky
        day. None of those may be a blank page or a crash."""
        data = render_report_pdf(sample_report(entries=[entry('2026-08-03')], previous=[]), EMAIL)

        self.assertTrue(data.startswith(b'%PDF-'))

    def test_the_file_name_is_ascii_so_the_header_needs_no_encoding(self):
        name = pdf_file_name(sample_report())

        self.assertEqual(name, 'raport-tygodniowy-2026-08-03.pdf')
        name.encode('ascii')


class DocumentContentTests(SimpleTestCase):
    """What the document actually says, read off the story rather than the bytes."""

    def story(self, report=None, email=EMAIL):
        return texts(build_story(report or sample_report(), email))

    def test_the_address_is_printed_under_the_entry_count(self):
        lines = self.story()
        entries = next(index for index, line in enumerate(lines) if line.startswith('Wpisy:'))

        self.assertEqual(lines[entries + 1], f'Pacjent: {EMAIL}')

    def test_nothing_else_identifying_goes_in(self):
        """The address is deliberate; an internal id would just be a leak with
        no reader. Metadata included — that is the half people forget when they
        redact a file."""
        report = sample_report()
        data = render_report_pdf(report, EMAIL)

        self.assertNotIn(b'id_medical', data)
        for line in self.story(report):
            self.assertNotIn('id_medical', line)
        # The author is the service, not the person.
        self.assertNotIn(EMAIL.encode(), data.split(b'/Producer')[0])

    def test_the_week_and_the_entry_count_are_there(self):
        lines = self.story()

        self.assertIn('3 – 9 sierpnia 2026', lines)
        self.assertIn('Wpisy: 2 z 7 dni', lines)

    def test_what_the_patient_typed_is_escaped_rather_than_parsed(self):
        """Paragraph text is a mini-HTML, so a bare '&' raises and '<b>' would
        be honoured as markup. The trigger and the risky-behaviour note are
        typed by the patient."""
        report = sample_report(entries=[
            entry('2026-08-03', situation_place='Praca & dom',
                  risky_behavior_note='<b>dużo</b> & mało'),
        ], previous=[])

        lines = self.story(report)

        self.assertIn('Praca &amp; dom', lines)
        self.assertIn('&lt;b&gt;dużo&lt;/b&gt; &amp; mało', lines)

    def test_an_ampersand_does_not_stop_the_export(self):
        """Without escaping this raises, and only for the patient unlucky enough
        to have typed one."""
        report = sample_report(
            entries=[entry('2026-08-03', situation_place='Dom & praca')], previous=[],
        )

        self.assertTrue(render_report_pdf(report, 'a&b@example.com').startswith(b'%PDF-'))

    def test_an_address_is_required_rather_than_defaulted_away(self):
        """A report with nobody's name on it is not a safer document, it is a
        useless one — and it would look fine in a test."""
        with self.assertRaises(TypeError):
            render_report_pdf(sample_report())


class DeltaWordingTests(SimpleTestCase):
    """A printout cannot be hovered over, so every case says what it means."""

    def delta(self, **fields):
        return {'value': None, 'gap': None, 'decimals': 1, 'unit': '', 'tone': 'neutral', **fields}

    def test_a_rise_carries_a_plus(self):
        self.assertEqual(format_delta(self.delta(value=0.6)), '+0,6 od poprzedniego tygodnia')

    def test_a_fall_carries_a_real_minus_sign(self):
        rendered = format_delta(self.delta(value=-0.6))

        self.assertEqual(rendered, '−0,6 od poprzedniego tygodnia')
        self.assertNotIn('-', rendered)

    def test_no_change_says_so_rather_than_showing_zero(self):
        self.assertEqual(format_delta(self.delta(value=0)), 'bez zmian od poprzedniego tygodnia')

    def test_a_unit_is_appended_when_there_is_one(self):
        self.assertEqual(
            format_delta(self.delta(value=-2, decimals=0, unit='dni')),
            '−2 dni od poprzedniego tygodnia',
        )

    def test_the_two_reasons_for_a_missing_number_read_differently(self):
        """'There is no previous week' is a false statement about a week that
        exists and simply never rated this metric."""
        self.assertIn('brak poprzedniego tygodnia', format_delta(self.delta(gap='no-previous-week')))
        self.assertIn('za mało ocen', format_delta(self.delta(gap='unrated')))


class PdfEndpointTests(ReportTestCase):
    def url_for(self, week):
        return reverse('core:report-pdf', args=[week_report_id(week)])

    def fetch(self, week):
        self.sign_in(self.patient.user)
        return self.client.get(self.url_for(week))

    def test_it_serves_the_report_as_an_attachment(self):
        self.entry(self.week, mood='good')

        response = self.fetch(self.week)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment;', response['Content-Disposition'])
        self.assertIn(f'raport-tygodniowy-{self.week.isoformat()}.pdf',
                      response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_a_client_asking_for_a_pdf_is_not_refused(self):
        """DRF negotiates content before the handler, so an endpoint that does
        not declare `application/pdf` answers 406 to a caller who asks for one —
        which is exactly what src/api/client.ts sends. The default test client
        sends no Accept header at all, which is why this has to be explicit."""
        self.entry(self.week, mood='good')
        self.sign_in(self.patient.user)

        response = self.client.get(self.url_for(self.week), HTTP_ACCEPT='application/pdf')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF-'))

    def test_a_refusal_is_json_even_when_a_pdf_was_asked_for(self):
        """Otherwise a 404 is served as application/pdf: a file the browser
        offers to save, rather than a message the frontend can read."""
        self.entry(self.week, mood='good')
        self.sign_in(self.patient.user)

        response = self.client.get(
            self.url_for(self.previous_week), HTTP_ACCEPT='application/pdf',
        )

        self.assertEqual(response.status_code, 404)
        self.assertIn('application/json', response['Content-Type'])
        self.assertIn('detail', response.json())

    def test_a_caller_that_states_no_preference_still_gets_the_file(self):
        self.entry(self.week, mood='good')
        self.sign_in(self.patient.user)

        response = self.client.get(self.url_for(self.week), HTTP_ACCEPT='*/*')

        self.assertEqual(response.status_code, 200)

    def test_it_is_never_cached(self):
        """Health data leaving the app as a file must not sit in a browser or
        proxy cache for whoever uses the machine next."""
        self.entry(self.week, mood='good')

        self.assertEqual(self.fetch(self.week)['Cache-Control'], 'no-store')

    def test_a_visitor_without_a_session_gets_nothing(self):
        self.entry(self.week, mood='good')

        self.assertEqual(self.client.get(self.url_for(self.week)).status_code, 403)

    def test_another_patients_week_is_404_rather_than_403(self):
        other = self.create_patient('ktos.inny@example.com')
        self.entry(self.week, mood='good', patient=other)

        self.assertEqual(self.fetch(self.week).status_code, 404)

    def test_a_week_with_no_report_is_404(self):
        self.entry(self.week, mood='good')

        self.assertEqual(self.fetch(self.previous_week).status_code, 404)

    def test_an_account_with_no_patient_row_is_refused(self):
        from core.models import User, UserRole

        guardian = User.objects.create(
            user_role=UserRole.objects.get_or_create(name='rodzic')[0],
            email='rodzic@example.com', password_hash=make_password('TajneHaslo123'),
        )
        self.sign_in(guardian)

        self.assertEqual(self.client.get(self.url_for(self.week)).status_code, 403)

    def test_the_document_says_whose_week_it_is(self):
        """A printout that reaches a specialist has to name the patient, or it
        is a page of numbers nobody can file."""
        self.entry(self.week, mood='good')

        response = self.fetch(self.week)

        self.assertEqual(response.status_code, 200)
        # The bytes cannot be searched (see texts()); what this pins is that the
        # endpoint reaches the renderer with the session's own address.
        self.assertEqual(self.patient.user.email, 'pacjent@example.com')
