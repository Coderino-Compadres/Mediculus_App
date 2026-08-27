"""URLs for the `core` app, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

app_name = 'core'

urlpatterns = [
    path('auth/csrf/', views.CsrfView.as_view(), name='csrf'),
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/me/', views.MeView.as_view(), name='me'),
    path('auth/guardian/', views.GuardianLinkView.as_view(), name='guardian-link'),
    path(
        'guardian/invitations/',
        views.GuardianInvitationsView.as_view(), name='guardian-invitations',
    ),
    path(
        'guardian/invitations/<uuid:id_parent_child>/accept/',
        views.GuardianInvitationAcceptView.as_view(), name='guardian-invitation-accept',
    ),
    path(
        'guardian/invitations/<uuid:id_parent_child>/reject/',
        views.GuardianInvitationRejectView.as_view(), name='guardian-invitation-reject',
    ),
    path('dashboard/home/', views.HomeDashboardView.as_view(), name='home-dashboard'),
    path('diary/', views.DiaryHistoryView.as_view(), name='diary-history'),
    # Before the '<uuid>' route, so 'today' is never read as an id.
    path('diary/today/', views.TodayDiaryEntryView.as_view(), name='diary-today'),
    path('diary/<uuid:id_diary>/', views.DiaryEntryDetailView.as_view(), name='diary-entry'),
    path('reports/', views.ReportListView.as_view(), name='report-list'),
    # 'week-2026-08-03' — a slug, so it can never swallow the trailing segment
    # of the PDF route below.
    path('reports/<slug:report_id>/', views.ReportDetailView.as_view(), name='report-detail'),
    path('reports/<slug:report_id>/pdf/', views.ReportPdfView.as_view(), name='report-pdf'),
]
