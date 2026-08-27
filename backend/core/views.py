"""Authentication endpoints backing the frontend's /login and /register pages.

Every response body is JSON. Validation failures come back as DRF's usual
`{"field": ["message", ...]}` with status 400, plus a `"detail"` key for errors
that belong to the request as a whole rather than to one field — the frontend's
`src/api/client.ts` splits them apart on exactly that convention.
"""

from django.utils.decorators import method_decorator
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone

from .authentication import end_session, start_session
from .dashboard import build_home_dashboard
from .diary import (DiaryEntrySerializer, load_entry, load_history,
                    load_today_entry, save_today_entry)
from .guardian import (accept_invitation, cancel_invitation, pending_invitations,
                       reject_invitation)
from .models import Patient
from .serializers import (GuardianLinkSerializer, LoginSerializer,
                          RegisterSerializer, UserSerializer)
from .throttling import AuthThrottle, GuardianLinkThrottle


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
    """POST /api/auth/login/ — exchange credentials for a session cookie."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        start_session(request, user)
        return Response(UserSerializer(user).data)


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


def _require_patient(request, refusal):
    """The `patient` row behind the session, or a refusal.

    Shared by every endpoint that reads or writes clinical data: the session is
    the only identity input, so there is never a patient id in a URL for someone
    to tamper with. A guardian or a specialist has no `patient` row and is turned
    away rather than handed an empty diary — an empty diary would be a
    misleading answer to a question that does not apply to them.
    """
    patient = (
        Patient.objects.filter(user=request.user).only('id_medical', 'is_child').first()
    )
    if patient is None:
        raise PermissionDenied(refusal)
    return patient


DIARY_REFUSAL = 'Dzienniczek jest dostępny tylko dla konta pacjenta.'

GUARDIAN_LINK_REFUSAL = (
    'Powiązanie z opiekunem dotyczy tylko konta pacjenta małoletniego.'
)

INVITATION_NOT_FOUND = 'Nie znaleziono zaproszenia oczekującego na odpowiedź.'


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
        patient = _require_patient(request, GUARDIAN_LINK_REFUSAL)
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
