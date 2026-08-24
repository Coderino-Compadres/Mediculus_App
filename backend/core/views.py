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
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .authentication import end_session, start_session
from .dashboard import build_home_dashboard
from .models import Patient
from .serializers import LoginSerializer, RegisterSerializer, UserSerializer


class AuthThrottle(AnonRateThrottle):
    """Per-IP cap on the credential-accepting endpoints (rate in settings.py)."""

    scope = 'auth'


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
        patient = Patient.objects.filter(user=request.user).only('id_medical').first()
        if patient is None:
            raise PermissionDenied('Panel pacjenta jest dostępny tylko dla konta pacjenta.')
        return Response(build_home_dashboard(patient.id_medical))
