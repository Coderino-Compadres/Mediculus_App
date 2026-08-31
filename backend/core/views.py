"""Authentication endpoints backing the frontend's /login and /register pages.

Every response body is JSON. Validation failures come back as DRF's usual
`{"field": ["message", ...]}` with status 400, plus a `"detail"` key for errors
that belong to the request as a whole rather than to one field — the frontend's
`src/api/client.ts` splits them apart on exactly that convention.
"""

from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import (NotFound, PermissionDenied,
                                       ValidationError)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import BaseRenderer, JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone

from .authentication import end_session, start_session
from .dashboard import build_home_dashboard
from .frequency import build_year_frequency, years_with_entries
from .diary import (DiaryEntrySerializer, load_entry, load_history,
                    load_today_entry, save_today_entry)
from .guardian import (STATUS_ACCEPTED, accept_invitation, cancel_invitation,
                       guardian_status, pending_invitations, reject_invitation)
from .models import Patient
from .report_pdf import pdf_file_name, render_report_pdf
from .reports import build_weekly_reports, find_report
from .serializers import (GuardianLinkSerializer, LoginSerializer,
                          RegisterSerializer, UserSerializer)
from .throttling import (AuthThrottle, GuardianLinkThrottle,
                         LoginAccountThrottle, ReportPdfThrottle,
                         attempts_warning)


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfView(APIView):
    """Issues the CSRF token the frontend has to echo back in `X-CSRFToken`.

    The token is both set as a cookie and returned in the body. The body copy is
    what makes this work when the frontend is served from another site, where
    JavaScript cannot read the API's cookies at all — the browser still sends the
    cookie, and Django compares the two. Handing the token out is safe: CORS
    stops any origin we have not allowed from reading this response.
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'csrf_token': get_token(request)})


@method_decorator(csrf_protect, name='dispatch')
class RegisterView(APIView):
    """POST /api/auth/register/ — create an account and log straight into it.

    `csrf_protect` is applied by hand because DRF marks every APIView as
    csrf_exempt, and the usual CSRF enforcement lives in the authentication class
    — which does nothing here, since the caller has no session yet. Without it,
    another site could quietly create accounts in a visitor's browser.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        start_session(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    """POST /api/auth/login/ — exchange credentials for a session cookie.

    Two caps, and they answer different attacks: `AuthThrottle` bounds one
    caller, `LoginAccountThrottle` bounds attempts against one account no matter
    how many callers they come from. DRF runs both, so both counters move.

    The account cap is silent until `WARN_AT_ATTEMPTS_LEFT` remain — announcing
    it earlier would only tell an attacker how much room they have, while the
    person it is meant for is someone who has forgotten which password they
    used and is about to lock themselves out of a deployment with no password
    reset in it.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle, LoginAccountThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            raise ValidationError(self._with_warning(serializer.errors, request))

        user = serializer.validated_data['user']
        # The counter bounds guessing, and this was not a guess.
        LoginAccountThrottle().reset(request)
        start_session(request, user)
        return Response(UserSerializer(user).data)

    @staticmethod
    def _with_warning(errors, request):
        """Adds the remaining-attempts sentence to whatever refused the login.

        Folded into `detail` rather than sent as its own key: the frontend reads
        `detail` as the message above the form and treats every other key as a
        field error, so a new key would be attributed to an input that does not
        exist and shown nowhere. Joined into one string rather than appended as
        a second list entry for the same reason — `firstMessage` in
        src/api/client.ts renders the first entry of a list and drops the rest.
        """
        warning = attempts_warning(request)
        if warning is None:
            return errors
        detail = errors.get('detail') or []
        message = f'{detail[0]} {warning}' if detail else warning
        return {**errors, 'detail': [message]}


class LogoutView(APIView):
    """POST /api/auth/logout/ — drop the session server-side, not just the cookie."""

    def post(self, request):
        end_session(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """GET /api/auth/me/ — who the session cookie belongs to.

    The frontend calls this on start-up to decide whether to show the login page
    or the app, so a rejection here is the expected answer for a visitor rather
    than an error. DRF answers 403 rather than 401 for session authentication
    (there is no auth scheme to advertise in WWW-Authenticate), which is why
    src/api/client.ts treats both as "not logged in".
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


def _require_patient(request, refusal, *, require_guardian_link=True):
    """The `patient` row behind the session, or a refusal.

    Shared by every endpoint that reads or writes clinical data: the session is
    the only identity input, so there is never a patient id in a URL for someone
    to tamper with. A guardian or a specialist has no `patient` row and is turned
    away rather than handed an empty diary — an empty diary would be a
    misleading answer to a question that does not apply to them.

    A minor whose guardian has not accepted is refused as well, and
    `require_guardian_link` defaults to True for the same reason
    `IsAuthenticated` is the default permission: a clinical endpoint added later
    that forgets to think about the gate is closed rather than accidentally
    open. The one caller that opts out is `GuardianLinkView`, which is how the
    child asks for the acceptance in the first place — gating it would leave
    them with no way out of the gate.

    The rule mirrors `needsGuardianLink` in src/api/auth.ts exactly
    (`is_child` *and* not accepted), because until now the frontend route guard
    was the only thing enforcing it: a hand-made request reached the data, and
    RODO art. 8 makes a minor's consent the guardian's to give. Nothing enforces
    that the two definitions stay in step, so change them together.
    """
    patient = (
        Patient.objects.filter(user=request.user).only('id_medical', 'is_child').first()
    )
    if patient is None:
        raise PermissionDenied(refusal)
    # Only a minor is asked the question, so an adult patient costs no extra
    # query — `is_child` came back with the row above.
    if (
        require_guardian_link
        and patient.is_child is True
        and guardian_status(request.user) != STATUS_ACCEPTED
    ):
        raise PermissionDenied(GUARDIAN_GATE_REFUSAL)
    return patient


DIARY_REFUSAL = 'Dzienniczek jest dostępny tylko dla konta pacjenta.'

GUARDIAN_LINK_REFUSAL = (
    'Powiązanie z opiekunem dotyczy tylko konta pacjenta małoletniego.'
)

# One message for every clinical endpoint, because the reason is a fact about
# the account rather than about the thing being asked for: naming the diary here
# would suggest the reports are reachable.
GUARDIAN_GATE_REFUSAL = (
    'To konto czeka na akceptację opiekuna. '
    'Poproś opiekuna o zatwierdzenie zaproszenia, aby korzystać z aplikacji.'
)

INVITATION_NOT_FOUND = 'Nie znaleziono zaproszenia oczekującego na odpowiedź.'

REPORT_REFUSAL = 'Raporty są dostępne tylko dla konta pacjenta.'

REPORT_NOT_FOUND = 'Nie znaleziono raportu dla tego tygodnia.'


class GuardianLinkView(APIView):
    """POST/DELETE /api/auth/guardian/ — the minor's half of the invitation.

    POST names the guardian whose account is being asked to vouch for this one;
    it creates a *request*, not a link. `GuardianLinkSerializer` is where the
    rules live: the address has to belong to an account whose role is `rodzic`,
    and an address that is not one gets the same answer as an address nobody
    registered. The child stays blocked until the guardian accepts on their own
    home screen — being named is not consenting.

    DELETE withdraws a pending invitation, so a mistyped address is not a dead
    end. It cannot touch an accepted link: undoing that is not the child's
    decision to make, or the guardian's oversight would last exactly as long as
    the child allowed it.

    Both answer with the updated user, whose `guardian_status` is what the
    frontend's route guard reads — so the screen can redraw without re-asking
    /api/auth/me/.
    """

    throttle_classes = [GuardianLinkThrottle]

    def post(self, request):
        self._require_minor(request)
        serializer = GuardianLinkSerializer(
            data=request.data, context={'child': request.user},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        self._require_minor(request)
        if not cancel_invitation(request.user):
            raise NotFound('Nie masz zaproszenia oczekującego na odpowiedź.')
        return Response(UserSerializer(request.user).data)

    def _require_minor(self, request):
        # The one endpoint that must stay reachable from behind the gate: this
        # is where the child asks for the acceptance that opens it.
        patient = _require_patient(
            request, GUARDIAN_LINK_REFUSAL, require_guardian_link=False,
        )
        # An adult patient is not stuck and has nothing to link; refusing keeps
        # `parent_child` meaning what it says rather than becoming a general
        # "these two accounts know each other" table.
        if patient.is_child is not True:
            raise PermissionDenied(GUARDIAN_LINK_REFUSAL)


class GuardianInvitationsView(APIView):
    """GET /api/guardian/invitations/ — who has asked this account to be their guardian.

    The guardian's home screen calls this to decide whether to show the
    accept/refuse card at all. No permission beyond being signed in: the list is
    filtered by `parent=request.user`, so an account nobody named simply gets an
    empty one — and there is no id in the URL to point somewhere else.
    """

    def get(self, request):
        return Response(pending_invitations(request.user))


class GuardianInvitationAcceptView(APIView):
    """POST /api/guardian/invitations/<id>/accept/ — the consent the child cannot give.

    Accepting is what turns the invitation into a link and unblocks the child's
    account. An invitation addressed to somebody else answers exactly like one
    that does not exist (404, nothing leaked about whether it does), the same
    convention as /api/diary/<id>/.
    """

    def post(self, request, id_parent_child):
        if not accept_invitation(request.user, id_parent_child):
            raise NotFound(INVITATION_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GuardianInvitationRejectView(APIView):
    """POST /api/guardian/invitations/<id>/reject/ — refuse to vouch for that account.

    The row is deleted rather than marked refused, which puts the child back to
    "no guardian named" and lets them ask someone else. Already-accepted links
    are not refusable here — withdrawing one is a different decision, with a
    child's live account behind it, and belongs to the parent panel.
    """

    def post(self, request, id_parent_child):
        if not reject_invitation(request.user, id_parent_child):
            raise NotFound(INVITATION_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class HomeDashboardView(APIView):
    """GET /api/dashboard/home/ — the logged-in patient's own home screen.

    The session says who is asking (user_db); everything returned is aggregated
    from medical_db through that patient's `id_medical`, so one account can only
    ever see its own numbers — there is no id in the URL to tamper with.

    An account with no `patient` row (a guardian, a specialist) is refused rather
    than answered with zeroes: they are not a clinical subject, so an empty diary
    would be a misleading answer to a question that does not apply to them.
    Guardians reach a child's data through the parent panel, once it exists.
    """

    def get(self, request):
        patient = _require_patient(
            request, 'Panel pacjenta jest dostępny tylko dla konta pacjenta.',
        )
        return Response(build_home_dashboard(patient.id_medical))


class TodayDiaryEntryView(APIView):
    """GET/PUT /api/diary/today/ — the logged-in patient's entry for today.

    Only today is addressable, and that is the whole enforcement of the product
    rule: one entry per day, editable on the day it was written, everything
    older read-only. There is no entry id in the URL, so no request can reach
    yesterday's row or another patient's.

    PUT rather than POST because the call is idempotent — it sets what today's
    entry is, whether or not one already exists. The form submits its complete
    state every time, so a second save replaces the first instead of merging
    into it: a field left out is an answer taken back.
    """

    def get(self, request):
        patient = _require_patient(request, DIARY_REFUSAL)
        return Response(load_today_entry(patient.id_medical, timezone.localdate()))

    def put(self, request):
        patient = _require_patient(request, DIARY_REFUSAL)
        serializer = DiaryEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = save_today_entry(
            patient.id_medical, serializer.validated_data, timezone.localdate(),
        )
        return Response(entry)


class DiaryHistoryView(APIView):
    """GET /api/diary/ — every entry the signed-in patient has written.

    Read-only, and not because a permission says so: there is no write verb on
    this URL and the only endpoint that writes (`/api/diary/today/`) cannot
    address any day but today. Past entries being immutable is the point — a
    report a therapist reads has to describe what the patient wrote then, not
    what they would rather have written since.

    Newest first, because that is the order the archive screen lists them in.
    """

    def get(self, request):
        patient = _require_patient(request, DIARY_REFUSAL)
        return Response(load_history(patient.id_medical))


class DiaryEntryDetailView(APIView):
    """GET /api/diary/<id>/ — one past entry, opened from the archive.

    This is the only diary URL carrying an id, so it is the only one where a
    caller can name a row that is not theirs. `load_entry` filters on the
    session's `id_medical` as well as on the id, which makes somebody else's
    entry answer exactly like a nonexistent one: 404, with nothing leaked about
    whether it exists.
    """

    def get(self, request, id_diary):
        patient = _require_patient(request, DIARY_REFUSAL)
        entry = load_entry(patient.id_medical, id_diary)
        if entry is None:
            raise NotFound('Nie znaleziono tego wpisu.')
        return Response(entry)


class ReportListView(APIView):
    """GET /api/reports/ — every weekly report this patient's diary supports.

    Read-only by construction, like the diary archive it is derived from: a
    report is generated, not written, so there is no verb here but GET and no
    id in the URL naming somebody else's week. The session resolves to one
    `id_medical` and `core/reports.py` never sees anything else.

    Newest first, and the week in progress is absent — a report covers a week
    that has ended. Empty is the normal answer for a diary younger than that.
    """

    def get(self, request):
        patient = _require_patient(request, REPORT_REFUSAL)
        return Response(build_weekly_reports(patient.id_medical, timezone.localdate()))


class ReportDetailView(APIView):
    """GET /api/reports/<week-id>/ — one weekly report.

    The only report URL carrying an id, so the only one where a caller can name
    a week that is not theirs — and it cannot, because the reports are built
    from the session's own `id_medical` before the id is matched against them.
    A week nobody has entries for answers 404, exactly like a malformed id and
    exactly like somebody else's week would: the same convention as
    /api/diary/<id>/.

    Building every report to return one is the honest cost of deriving them:
    a week's numbers are meaningless without the week before it, so there is no
    single-week shortcut that would not just re-read the same rows.
    """

    def get(self, request, report_id):
        patient = _require_patient(request, REPORT_REFUSAL)
        reports = build_weekly_reports(patient.id_medical, timezone.localdate())
        report = find_report(reports, report_id)
        if report is None:
            raise NotFound(REPORT_NOT_FOUND)
        return Response(report)


class PdfRenderer(BaseRenderer):
    """Lets content negotiation say yes to `Accept: application/pdf`.

    DRF negotiates before the handler runs, and with only JSONRenderer
    configured a client that honestly asks for a PDF is answered 406 — "Nie
    można zaspokoić nagłówka Accept żądania" — without the view being called at
    all. Nothing is ever rendered through this: the view returns an HttpResponse
    of bytes ReportLab already produced. It exists so the endpoint can advertise
    the type it actually serves.
    """

    media_type = 'application/pdf'
    format = 'pdf'
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class ReportPdfView(APIView):
    """GET /api/reports/<week-id>/pdf/ — the same report as a file.

    Rendered from the payload `ReportDetailView` answers with, not from a second
    reading of the diary, so the document and the screen cannot drift apart.

    Three things the JSON endpoints do not need:

    - `Content-Disposition: attachment`, with an ASCII filename by construction
      (`pdf_file_name`), so there is no header encoding to get wrong.
    - `Cache-Control: no-store`. This is health data leaving the app as a file;
      it must not be left in a browser or proxy cache for the next person on the
      machine.
    - a throttle. Laying out a document is CPU on a synchronous worker, which
      makes an unthrottled URL a way to occupy the deployment.
    """

    throttle_classes = [ReportPdfThrottle]
    renderer_classes = [PdfRenderer, JSONRenderer]

    def finalize_response(self, request, response, *args, **kwargs):
        """A refusal is JSON even when the caller asked for a PDF.

        Only DRF `Response` objects come through here — the success path returns
        a plain HttpResponse, which DRF passes through untouched. Without this,
        negotiation has already picked PdfRenderer and a 404 would be served as
        `application/pdf`: a file the browser offers to save, instead of a
        message `src/api/client.ts` can read the reason out of.

        Set on the *request*: `finalize_response` copies the renderer from there
        onto the response, so assigning it to the response first is overwritten.
        """
        if isinstance(response, Response):
            request.accepted_renderer = JSONRenderer()
            request.accepted_media_type = 'application/json'
        return super().finalize_response(request, response, *args, **kwargs)

    def get(self, request, report_id):
        patient = _require_patient(request, REPORT_REFUSAL)
        reports = build_weekly_reports(patient.id_medical, timezone.localdate())
        report = find_report(reports, report_id)
        if report is None:
            raise NotFound(REPORT_NOT_FOUND)

        # The address is the only thing in the document that comes from user_db;
        # it is read here, from the session, so core/reports.py can go on
        # aggregating medical_db without ever seeing one.
        document = render_report_pdf(report, request.user.email)
        response = HttpResponse(document, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{pdf_file_name(report)}"'
        response['Cache-Control'] = 'no-store'
        return response


#: Refusal for an account that is not a clinical subject, worded for this screen.
ANALYSIS_REFUSAL = 'Analiza jest dostępna tylko dla konta pacjenta.'

#: How far either side of the present a year may be asked for. Not a policy —
#: just a guard so a parsed integer cannot become `datetime.date(999999, 1, 1)`.
MIN_YEAR = 1900
MAX_YEAR = 2200


class FrequencyView(APIView):
    """GET /api/analysis/frequency/?year=2026 — one bucket per month of that year.

    The analysis screen computes its 30- and 90-day views in the browser, out of
    the entry list it already has. This endpoint exists for the one question that
    list cannot answer: a *named* year, which for a long-standing patient is past
    the 1000-row cap on `/api/diary/` — see `core/frequency.py` for why that
    makes it a backend question rather than one more period chip.

    `years_with_entries` rides along on every response because the picker has to
    be populated from somewhere, and the same cap rules out deriving it in the
    browser. It is cheap (one DISTINCT) and it keeps the screen to one request
    rather than two.

    `year` is optional: without it the answer covers the current year, which is
    what the screen opens on. Anything unparseable is a 400 rather than a silent
    fallback — a chart quietly showing a different year than the one selected is
    worse than an error.
    """

    def get(self, request):
        patient = _require_patient(request, ANALYSIS_REFUSAL)
        today = timezone.localdate()

        raw = request.query_params.get('year')
        if raw is None:
            year = today.year
        else:
            try:
                year = int(raw)
            except ValueError:
                raise ValidationError({'year': 'Rok musi być liczbą.'})
            if not MIN_YEAR <= year <= MAX_YEAR:
                raise ValidationError({'year': f'Rok musi być z zakresu {MIN_YEAR}-{MAX_YEAR}.'})

        return Response({
            'year': year,
            'bucket': 'month',
            'years_with_entries': years_with_entries(patient.id_medical),
            'buckets': build_year_frequency(patient.id_medical, year, today),
        })
