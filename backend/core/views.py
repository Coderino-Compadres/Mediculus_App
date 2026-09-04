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

from .account import build_account_profile, build_linked_children
from .authentication import end_session, start_session
from .dashboard import build_home_dashboard
from .frequency import build_year_frequency, years_with_entries
from .diary import (DiaryEntrySerializer, load_entry, load_history,
                    load_today_entry, save_today_entry)
from .guardian import (STATUS_ACCEPTED, accept_invitation, accepted_children,
                       cancel_invitation, guardian_status, pending_invitations,
                       reject_invitation)
from .consents import SCOPES, consent_state, restore, withdraw
from .models import Patient
from .parent_invitations import (list_invitations, revoke,
                                serialize_invitation as serialize_parent_invitation)
from .permissions import CONSENT_EXEMPT
from .report_pdf import pdf_file_name, render_report_pdf
from .reports import build_weekly_reports, find_report
from .serializers import (ConsentScopeSerializer, GuardianLinkSerializer,
                          LoginSerializer, ParentInvitationCreateSerializer,
                          PasswordChangeSerializer, RegisterSerializer,
                          SpecialistPatientInviteSerializer, UserSerializer)
from . import specialist as specialist_rules
from . import techniques as technique_rules
from .throttling import (AuthThrottle, GuardianLinkThrottle,
                         LoginAccountThrottle, PasswordChangeThrottle,
                         ReportPdfThrottle, SpecialistInviteThrottle,
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

    # Exempt from the consent gate: an account that cannot use the app must
    # still be able to leave it.
    permission_classes = CONSENT_EXEMPT

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

    # Exempt from the consent gate, and load-bearing: this is how the frontend's
    # route guard learns *why* it was refused, so gating it would leave the app
    # unable to tell "log in" apart from "restore your consents".
    permission_classes = CONSENT_EXEMPT

    def get(self, request):
        return Response(UserSerializer(request.user).data)


def _require_patient(
    request, refusal, *, require_guardian_link=True, with_care=False,
    with_pending_specialist=False,
):
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
    patients = Patient.objects.filter(user=request.user)
    if with_pending_specialist:
        # The card that answers a specialist's invitation names the person
        # asking, whose name is on their own `user` row — one query instead of
        # three, the same opt-in as `with_care` and for the same reason.
        patients = patients.select_related('specjalist_pending__user')
    elif with_care:
        # The profile screen names the treating specialist, whose name lives on
        # their own `user` row — one query instead of three. Opt-in rather than
        # always, because every other caller wants the two columns below and
        # nothing else.
        patients = patients.select_related('specjalist__user')
    else:
        patients = patients.only('id_medical', 'is_child')
    patient = patients.first()
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

PROFILE_REFUSAL = (
    'Ta część profilu jest dostępna tylko dla konta pacjenta.'
)

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


class GuardianChildrenView(APIView):
    """GET /api/guardian/children/ — the accounts this guardian has vouched for.

    The parent panel's home screen. Filtered by `parent=request.user` with no
    permission of its own, exactly like the invitations list: an account nobody
    named as their guardian gets an empty list, and there is no id in the URL to
    point at somebody else's child.

    WHAT IT ANSWERS WITH IS THE WHOLE DESIGN — engagement, never content. See
    `CHILD_SUMMARY_FIELDS` in core/account.py for the list and the reasoning; the
    short version is that a minor who knows a parent reads their diary writes a
    different diary. `test_guardian_children_api.py` pins the omissions, because
    the day somebody adds `avg_mood` here it will look like an improvement.

    Only accepted links: a pending invitation is a request nobody has answered,
    and reporting on a child before their guardian agreed would be the gate
    working in one direction only.
    """

    def get(self, request):
        links = accepted_children(request.user)
        # One query for every child's patient row rather than one per child —
        # and the only place this view touches user_db's clinical side at all.
        patients = Patient.objects.filter(
            user_id__in=[link.child_id for link in links]
        ).only('user_id', 'id_medical')
        return Response(build_linked_children(
            links, {patient.user_id: patient for patient in patients},
        ))


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


class AccountProfileView(APIView):
    """GET /api/account/profile/ — the counters and the care card on "Profil".

    Only the half of that screen that is neither identity nor consent. Identity
    (name, e-mail, account type) already arrives on /api/auth/me/, and so do the
    two consent timestamps — they are columns on `user`, they are what the route
    guard's payload is for, and asking for them a second time here would be two
    endpoints that can disagree about one row.

    What is left needs medical_db, which is why it is a separate URL and why it
    is gated: `_require_patient` turns away an account with no `patient` row.
    A guardian reaching this would otherwise be told they have written 0 entries
    and have no therapist — both true of a row that does not exist, and both
    read as a clinical record rather than as "this question does not apply to
    you". The frontend does not call this for such accounts at all
    (`hasPatientProfile` in src/api/auth.ts, which mirrors the same rule); the
    refusal is here because a route guard is not enforcement.
    """

    def get(self, request):
        patient = _require_patient(request, PROFILE_REFUSAL, with_care=True)
        return Response(build_account_profile(patient))


class PasswordChangeView(APIView):
    """POST /api/account/password/ — change the signed-in account's password.

    Deliberately NOT behind `_require_patient`: every account has a password,
    including the guardians and specialists who are not clinical subjects, and a
    minor still waiting for a guardian must be able to change theirs while the
    gate is closed. `IsAuthenticated` (the project default) is the whole
    requirement.

    CSRF is enforced by `SessionUserAuthentication`, like every other
    authenticated write here — the hand-applied `@csrf_protect` on login and
    register exists only because those callers have no session yet.

    Answers 204 with no body. There is nothing to send back: the user did not
    change, and echoing anything about the password would be one more place it
    could be logged.
    """

    throttle_classes = [PasswordChangeThrottle]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={'user': request.user},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConsentWithdrawView(APIView):
    """POST /api/account/consents/withdraw/ — stop the app processing anything.

    Exempt from the consent gate so the two consent endpoints are always
    reachable; withdrawing when already withdrawn is a no-op rather than an
    error, which is what makes a double-tapped button harmless.

    THE ACCOUNT IS LOCKED, NOT DELETED. Nothing is removed here — see the module
    docstring in core/consents.py for why the harsher reading was dropped. The
    answer carries the updated user, so the frontend can send them to the
    re-consent screen without re-asking /api/auth/me/, exactly as the guardian
    link endpoint does.
    """

    permission_classes = CONSENT_EXEMPT

    def post(self, request):
        serializer = ConsentScopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        withdraw(request.user, serializer.validated_data['scope'])
        return Response(UserSerializer(request.user).data)


class ConsentRestoreView(APIView):
    """POST /api/account/consents/restore/ — grant a withdrawn consent again.

    No password, deliberately, and not an oversight. Restoring is the direction
    that *unblocks* an account, so friction here costs a user who has changed
    their mind and protects nobody: anybody who could reach this endpoint is
    already inside the session, and the worst they can do with it is give a
    consent back that its owner can withdraw again in two taps.
    """

    permission_classes = CONSENT_EXEMPT

    def post(self, request):
        serializer = ConsentScopeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        restore(request.user, serializer.validated_data['scope'])
        return Response(UserSerializer(request.user).data)


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


class ReportPdfBase(APIView):
    """What both PDF endpoints need, shared so they cannot drift apart.

    The patient's own `/api/reports/<week-id>/pdf/` and the specialist's
    `/api/specialist/patients/<id>/reports/<week-id>/pdf/` differ in exactly two
    things — whose reports are built, and whose address is printed on the
    document — and in nothing about how a PDF is served. Three of those details
    are easy to get wrong and invisible when you do:

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

    def render(self, id_medical, report_id, email):
        """The file, or a 404 for a week this diary does not support.

        `email` is the only thing in the document that comes from user_db, and
        it is always the *patient's* — a printout that reaches a specialist has
        to say whose week it is, and on the specialist's own copy that is still
        the patient, not the reader. Passed in rather than read here so
        core/reports.py can go on aggregating medical_db without ever seeing one.
        """
        reports = build_weekly_reports(id_medical, timezone.localdate())
        report = find_report(reports, report_id)
        if report is None:
            raise NotFound(REPORT_NOT_FOUND)

        document = render_report_pdf(report, email)
        response = HttpResponse(document, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{pdf_file_name(report)}"'
        response['Cache-Control'] = 'no-store'
        return response


class ReportPdfView(ReportPdfBase):
    """GET /api/reports/<week-id>/pdf/ — the patient's own report as a file.

    Rendered from the payload `ReportDetailView` answers with, not from a second
    reading of the diary, so the document and the screen cannot drift apart.
    """

    def get(self, request, report_id):
        patient = _require_patient(request, REPORT_REFUSAL)
        return self.render(patient.id_medical, report_id, request.user.email)


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
            'years_with_entries': years_with_entries(patient.id_medical, today),
            'buckets': build_year_frequency(patient.id_medical, year, today),
        })


#: Refusal for an account with no `specjalist` row, worded for the whole panel.
#:
#: One message for every specialist endpoint, like GUARDIAN_GATE_REFUSAL: the
#: reason is a fact about the account rather than about the thing being asked
#: for, so naming the patient list here would imply the reports are reachable.
SPECIALIST_REFUSAL = 'Ta część aplikacji jest dostępna tylko dla konta specjalisty.'

#: What a patient meets on the specialist's own screens, and vice versa. Both
#: exist because the two roles reach for the same nouns — "zaproszenie",
#: "raport" — and a generic refusal would leave either side unsure whether they
#: had asked the wrong thing or the wrong way.
SPECIALIST_INVITATION_NOT_FOUND = (
    'Nie masz zaproszenia od specjalisty oczekującego na odpowiedź.'
)

PATIENT_NOT_FOUND = 'Nie znaleziono takiego pacjenta.'

#: The patient's side of the same feature, worded for their screen: this one is
#: about their own account rather than about the panel.
SPECIALIST_INVITATION_REFUSAL = (
    'Zaproszenia od specjalisty dotyczą tylko konta pacjenta.'
)

PARENT_INVITATION_NOT_FOUND = (
    'Nie znaleziono zaproszenia, które można anulować.'
)

TECHNIQUE_NOT_FOUND = 'Nie znaleziono takiej techniki.'


def _require_specialist(request):
    """The `specjalist` row behind the session, or a refusal.

    The specialist half of `_require_patient`, and deliberately the same shape:
    the session is the only identity input, so there is no specialist id in any
    URL, and what authorizes is the existence of the row rather than the role
    name on `user` (a nullable text column seeded by SQL — see
    `core.specialist.specjalist_for`).

    Note what this does **not** grant. Being a specialist opens the panel and
    nothing else: which patients' reports are readable is decided per request by
    `assigned_patient`, i.e. by whose invitation was accepted. Registration is
    self-service, so this refusal is a routing decision, not the access control.
    """
    specjalist = specialist_rules.specjalist_for(request.user)
    if specjalist is None:
        raise PermissionDenied(SPECIALIST_REFUSAL)
    return specjalist


def _assigned_patient(specjalist, patient_id):
    """One of this specialist's accepted patients, or 404.

    404 rather than 403 for a patient who is somebody else's, which is the
    convention every id-carrying URL here follows (/api/diary/<id>/,
    /api/guardian/invitations/<id>/…): a 403 would confirm that the account
    exists and is a patient, which is exactly what the invitation form takes
    care not to answer.
    """
    patient = specialist_rules.assigned_patient(specjalist, patient_id)
    if patient is None:
        raise NotFound(PATIENT_NOT_FOUND)
    return patient


class SpecialistPatientsView(APIView):
    """GET/POST /api/specialist/patients/ — the caseload, and asking to join it.

    GET answers with two lists, accepted and pending, because a pending
    invitation grants nothing and a screen must not be able to render one as a
    patient by forgetting to read a status field. What each row carries is
    `PATIENT_SUMMARY_FIELDS` in core/specialist.py — identity and engagement, no
    clinical content; the content is the weekly reports, one screen further in.

    POST asks a patient, named by e-mail, to be treated by this specialist. It
    creates a *request*: `SpecialistPatientInviteSerializer` sets
    `id_specjalist_pending` and the patient answers on their own screen. Every
    way the address can fail gets the same refusal — see that serializer — and
    `SpecialistInviteThrottle` is what keeps the shared refusal worth having.

    **The cap applies to POST only**, via `get_throttles`. It is there because
    *asking about an address* is a question worth bounding; reading your own
    caseload is not, and the panel reads it on every screen it has — a cap on
    GET would lock a specialist out of their own list by the middle of a working
    day, which is a real outage in exchange for nothing.
    """

    def get_throttles(self):
        return [SpecialistInviteThrottle()] if self.request.method == 'POST' else []

    def get(self, request):
        specjalist = _require_specialist(request)
        return Response(specialist_rules.build_patient_list(specjalist))

    def post(self, request):
        specjalist = _require_specialist(request)
        serializer = SpecialistPatientInviteSerializer(
            data=request.data, context={'specjalist': specjalist},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            specialist_rules.build_patient_list(specjalist),
            status=status.HTTP_201_CREATED,
        )


class SpecialistPatientView(APIView):
    """DELETE /api/specialist/patients/<id>/ — end the relationship, or drop the request.

    THE ONLY SIDE THAT CAN DROP AN ACCEPTED LINK. That is the client's rule and
    not an oversight of the patient's screen: with eating disorders the tendency
    to hide information rises, so a patient-side "stop sharing" would switch the
    reports off exactly in the cases they exist for (see the TODO in
    frontend/src/pages/Reports.tsx, which has survived one attempt to turn this
    into an opt-in already). A patient who wants out asks the specialist.

    A patient who is not this specialist's answers 404, like every other
    id-carrying URL here.
    """

    def delete(self, request, patient_id):
        specjalist = _require_specialist(request)
        if not specialist_rules.drop_link(specjalist, patient_id):
            raise NotFound(PATIENT_NOT_FOUND)
        return Response(specialist_rules.build_patient_list(specjalist))


class SpecialistPatientReportListView(APIView):
    """GET /api/specialist/patients/<id>/reports/ — one patient's weekly reports.

    The same documents the patient sees on their own /reports, built by the same
    `build_weekly_reports` from the same rows — so a specialist and a patient
    can never be looking at two different accounts of one week, which is the
    whole reason the aggregation lives on the server.

    Two gates, in this order: a `specjalist` row (or the panel is not yours), and
    `assigned_patient` (or this is not your patient). The second is the real one
    — registration is self-service, so being a specialist means nothing until
    somebody accepts you.
    """

    def get(self, request, patient_id):
        specjalist = _require_specialist(request)
        patient = _assigned_patient(specjalist, patient_id)
        return Response(build_weekly_reports(patient.id_medical, timezone.localdate()))


class SpecialistPatientReportDetailView(APIView):
    """GET /api/specialist/patients/<id>/reports/<week-id>/ — one of them.

    Building every report to return one is the honest cost of deriving them
    (a week's numbers are meaningless without the week before it), exactly as on
    the patient's own detail endpoint.
    """

    def get(self, request, patient_id, report_id):
        specjalist = _require_specialist(request)
        patient = _assigned_patient(specjalist, patient_id)
        reports = build_weekly_reports(patient.id_medical, timezone.localdate())
        report = find_report(reports, report_id)
        if report is None:
            raise NotFound(REPORT_NOT_FOUND)
        return Response(report)


class SpecialistPatientReportPdfView(ReportPdfBase):
    """GET /api/specialist/patients/<id>/reports/<week-id>/pdf/ — as a file.

    The document carries the **patient's** address, not the specialist's: a
    printout that leaves the app has to say whose week it is, and on this copy
    the reader is not the subject. Everything else about serving it is shared
    with the patient's own endpoint — see `ReportPdfBase`.
    """

    def get(self, request, patient_id, report_id):
        specjalist = _require_specialist(request)
        patient = _assigned_patient(specjalist, patient_id)
        return self.render(patient.id_medical, report_id, patient.user.email)


class SpecialistParentInvitationsView(APIView):
    """GET/POST /api/specialist/parent-invitations/ — codes for guardian accounts.

    POST answers with the plaintext code **once**, and that is the only time it
    exists anywhere: the row holds a hash, exactly as `user.password_hash` does,
    so a database dump is not a set of usable invitations (see
    core/parent_invitations.py). A specialist who loses a code revokes the
    invitation and issues another; there is deliberately no endpoint that reads
    one back, and the list below never contains one.

    GET lists this specialist's invitations, redeemed and expired ones included:
    a specialist needs to see that the parent did register, and an expired
    invitation is the answer to "why can they not log in".

    The cap is on POST only, for the reason given on `SpecialistPatientsView`:
    issuing a code names an address, and listing your own invitations does not.
    """

    def get_throttles(self):
        return [SpecialistInviteThrottle()] if self.request.method == 'POST' else []

    def get(self, request):
        specjalist = _require_specialist(request)
        return Response(list_invitations(specjalist))

    def post(self, request):
        specjalist = _require_specialist(request)
        serializer = ParentInvitationCreateSerializer(
            data=request.data, context={'specjalist': specjalist},
        )
        serializer.is_valid(raise_exception=True)
        invitation, code = serializer.save()
        return Response(
            {
                # Once. The `invitation` half is what the list will show from
                # now on; `code` exists in this response and nowhere else.
                'code': code,
                'invitation': serialize_parent_invitation(invitation),
            },
            status=status.HTTP_201_CREATED,
        )


class SpecialistParentInvitationView(APIView):
    """DELETE /api/specialist/parent-invitations/<id>/ — withdraw an unused code.

    A redeemed invitation is not deletable: the account it created exists, and
    dropping the row would not un-create it — it would only lose the record of
    where that guardian came from. Unlinking a guardian is a different action on
    `parent_child`, and it does not exist yet.
    """

    def delete(self, request, invitation_id):
        specjalist = _require_specialist(request)
        if not revoke(specjalist, invitation_id):
            raise NotFound(PARENT_INVITATION_NOT_FOUND)
        return Response(list_invitations(specjalist))


class SpecialistTechniquesView(APIView):
    """GET/POST /api/specialist/techniques/ — the techniques this specialist wrote.

    GET includes unpublished drafts, which is the point of the panel: a technique
    is written over more than one sitting, and `description_ready` is what
    decides whether patients can open it yet.

    POST writes a catalogue entry. What a specialist writes is **visible to every
    patient**, not only their own — the decision behind this feature — which is
    why there is no per-patient assignment here and why `author_id_specjalist`
    records who to ask about the wording rather than who may read it.
    """

    def get(self, request):
        specjalist = _require_specialist(request)
        return Response([
            technique_rules.serialize_technique(technique)
            for technique in technique_rules.for_specjalist(specjalist)
        ])

    def post(self, request):
        specjalist = _require_specialist(request)
        serializer = technique_rules.TechniqueSerializer(
            data=request.data, context={'specjalist': specjalist},
        )
        serializer.is_valid(raise_exception=True)
        technique = serializer.save()
        return Response(
            technique_rules.serialize_technique(technique),
            status=status.HTTP_201_CREATED,
        )


class SpecialistTechniqueView(APIView):
    """PUT/DELETE /api/specialist/techniques/<id>/ — correct or withdraw one.

    Only the author's own: `find_for_specjalist` filters on
    `author_id_specjalist`, so a colleague's technique answers exactly like a
    nonexistent one. Clinical text corrections are expected here — the whole
    catalogue is content awaiting review — and a specialist correcting somebody
    else's wording is a conversation, not a form.

    PUT rather than PATCH: the form submits its whole state, so a field left out
    is an answer taken back rather than one left unchanged — the same rule as
    /api/diary/today/, and for the same reason (a merge would make a cleared
    field indistinguishable from an untouched one).
    """

    def put(self, request, id_technique):
        specjalist = _require_specialist(request)
        technique = technique_rules.find_for_specjalist(specjalist, id_technique)
        if technique is None:
            raise NotFound(TECHNIQUE_NOT_FOUND)
        serializer = technique_rules.TechniqueSerializer(
            technique, data=request.data, context={'specjalist': specjalist},
        )
        serializer.is_valid(raise_exception=True)
        return Response(technique_rules.serialize_technique(serializer.save()))

    def delete(self, request, id_technique):
        specjalist = _require_specialist(request)
        technique = technique_rules.find_for_specjalist(specjalist, id_technique)
        if technique is None:
            raise NotFound(TECHNIQUE_NOT_FOUND)
        # `raport.id_technique` is SET_NULL, so a report that suggested this
        # technique keeps its figures and loses the suggestion — which is the
        # honest outcome for a technique its author withdrew.
        technique.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TechniqueCatalogueView(APIView):
    """GET /api/techniques/ — the techniques a specialist has published.

    Only half the catalogue: the techniques the app ships with are still
    hardcoded in the frontend (see core/techniques.py for why they have not been
    moved), and the screen merges the two by slug.

    No `_require_patient`, deliberately. A catalogue of published techniques is
    not patient data — nothing here is about anybody — and a guardian reading the
    same descriptions their child is reading is a reasonable thing to allow.
    `published()` is what limits it: drafts and anything flagged
    'wymagaSpecjalisty' never leave the panel.
    """

    def get(self, request):
        return Response([
            technique_rules.serialize_technique(technique)
            for technique in technique_rules.published()
        ])


#: Why the three specialist-invitation endpoints opt out of the guardian gate.
#:
#: A minor waiting for a guardian is refused everywhere else, and these three are
#: the exception for the same reason `POST /api/auth/guardian/` is: gating them
#: is a deadlock. The flow the specialist panel exists to serve is a clinician
#: sitting with a family — the child registers, the specialist asks to treat
#: them, and the specialist then issues the code the *parent* registers with,
#: which is what lifts the gate. But issuing that code requires the child to be
#: this specialist's patient, and accepting is how a child becomes one. Gated,
#: the child could never accept, so the code could never be issued, so the gate
#: would never lift.
#:
#: WHAT ACCEPTING WHILE GATED ACTUALLY GRANTS: nothing. Every clinical endpoint
#: stays gated, so the child cannot write a diary entry, so the reports the
#: specialist may now read are derived from no rows at all. By the time there is
#: anything to read, a guardian has accepted the account.
#:
#: The alternative was letting a specialist issue a parent code for a merely
#: *pending* patient, and that is much worse: it needs no action from the child
#: at all, so anybody who registered as a specialist could attach a guardian
#: account they control to any minor whose address they know. Here the child has
#: to accept, which is a deliberate act by the person the account belongs to.
GUARDIAN_GATE_EXEMPT_REASON = 'specialist invitation — see the note above'


class SpecialistInvitationView(APIView):
    """GET /api/account/specialist-invitation/ — the patient's side of the ask.

    Answers `{"invitation": null}` for a patient nobody has asked, which is the
    normal case rather than an error: the card this feeds sits on the patient's
    home screen and has to know to draw nothing.

    Behind `_require_patient`, so a guardian or a specialist is refused rather
    than told they have no invitation — a true statement about a row that does
    not exist, and one that reads as a clinical record. **Not** behind the
    guardian gate: see `GUARDIAN_GATE_EXEMPT_REASON` above.
    """

    def get(self, request):
        patient = _require_patient(
            request, SPECIALIST_INVITATION_REFUSAL,
            # See GUARDIAN_GATE_EXEMPT_REASON: gating this is a deadlock, and
            # accepting while gated grants access to an empty diary.
            require_guardian_link=False, with_pending_specialist=True,
        )
        return Response({
            'invitation': specialist_rules.pending_invitation(patient),
        })


class SpecialistInvitationAcceptView(APIView):
    """POST /api/account/specialist-invitation/accept/ — agree to be treated.

    This is the consent behind the whole specialist view: from here on that
    specialist can read this patient's weekly reports. Accepting twice is the
    same answer arriving twice (a double-tapped button), not an error.

    Note what accepting gives up, because the screen says it in words: the
    patient cannot undo it. Dropping the link is the specialist's action — see
    `SpecialistPatientView` for the client's reasoning.
    """

    def post(self, request):
        patient = _require_patient(
            request, SPECIALIST_INVITATION_REFUSAL,
            # See GUARDIAN_GATE_EXEMPT_REASON: gating this is a deadlock, and
            # accepting while gated grants access to an empty diary.
            require_guardian_link=False, with_pending_specialist=True,
        )
        if not specialist_rules.accept_invitation(patient):
            raise NotFound(SPECIALIST_INVITATION_NOT_FOUND)
        return Response({
            'invitation': specialist_rules.pending_invitation(patient),
        })


class SpecialistInvitationRejectView(APIView):
    """POST /api/account/specialist-invitation/reject/ — refuse it.

    The pending column is cleared and no refusal is recorded, exactly as a
    refused guardian invitation deletes its row: a stored "no" would be a state
    nobody in the app can act on, while an absent invitation lets the specialist
    ask again after talking to them.
    """

    def post(self, request):
        patient = _require_patient(
            request, SPECIALIST_INVITATION_REFUSAL,
            # See GUARDIAN_GATE_EXEMPT_REASON: gating this is a deadlock, and
            # accepting while gated grants access to an empty diary.
            require_guardian_link=False, with_pending_specialist=True,
        )
        if not specialist_rules.reject_invitation(patient):
            raise NotFound(SPECIALIST_INVITATION_NOT_FOUND)
        return Response({
            'invitation': specialist_rules.pending_invitation(patient),
        })
