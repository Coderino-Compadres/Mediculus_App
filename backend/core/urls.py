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
    path('guardian/children/', views.GuardianChildrenView.as_view(), name='guardian-children'),
    path(
        'guardian/invitations/<uuid:id_parent_child>/accept/',
        views.GuardianInvitationAcceptView.as_view(), name='guardian-invitation-accept',
    ),
    path(
        'guardian/invitations/<uuid:id_parent_child>/reject/',
        views.GuardianInvitationRejectView.as_view(), name='guardian-invitation-reject',
    ),
    path('account/profile/', views.AccountProfileView.as_view(), name='account-profile'),
    path('account/password/', views.PasswordChangeView.as_view(), name='account-password'),
    path(
        'account/consents/withdraw/',
        views.ConsentWithdrawView.as_view(), name='account-consents-withdraw',
    ),
    path(
        'account/consents/restore/',
        views.ConsentRestoreView.as_view(), name='account-consents-restore',
    ),
    path('dashboard/home/', views.HomeDashboardView.as_view(), name='home-dashboard'),
    path('analysis/frequency/', views.FrequencyView.as_view(), name='analysis-frequency'),
    path('diary/', views.DiaryHistoryView.as_view(), name='diary-history'),
    # Before the '<uuid>' route, so 'today' is never read as an id.
    path('diary/today/', views.TodayDiaryEntryView.as_view(), name='diary-today'),
    path('diary/<uuid:id_diary>/', views.DiaryEntryDetailView.as_view(), name='diary-entry'),
    # The diet module's hydration screen (mockups §08). Its own prefix rather
    # than /diary/: a glass of water is not a diary entry, and the two modules
    # keep their own vocabulary.
    path('diet/hydration/', views.HydrationView.as_view(), name='diet-hydration'),
    path(
        'diet/hydration/<uuid:id_hydration>/',
        views.HydrationEntryView.as_view(), name='diet-hydration-entry',
    ),
    # The food diary. Read-only for now — the form that writes a meal is §04 of
    # the mockups and is not built (the photo in it would be the first file this
    # deployment ever stored). 'today' before any '<uuid>' route, the same
    # ordering rule the diary follows.
    path('diet/today/', views.DietDayView.as_view(), name='diet-today'),
    path('diet/meals/', views.DietMealHistoryView.as_view(), name='diet-meals'),
    # Correcting or dropping today's meal. Declared after the bare history, the
    # same ordering `diary/today/` needs before `diary/<uuid:...>/`.
    path(
        'diet/meals/<uuid:id_meal>/',
        views.DietMealView.as_view(), name='diet-meal',
    ),
    # One day of the food diary — §07's history opened out. Its own prefix
    # rather than `diet/meals/<date>/`, so a date and a meal id never compete
    # for one pattern; it is a sibling of `diet/today/`, which is the same
    # shape for the day that is today.
    path(
        'diet/days/<str:entry_date>/',
        views.DietJournalDayView.as_view(), name='diet-journal-day',
    ),
    # §08's second half, "Suplementy i leki".
    path('diet/supplements/', views.SupplementsView.as_view(), name='diet-supplements'),
    path(
        'diet/supplements/<uuid:id_supplement>/',
        views.SupplementView.as_view(), name='diet-supplement',
    ),
    path(
        'diet/supplements/<uuid:id_supplement>/intake/',
        views.SupplementIntakeView.as_view(), name='diet-supplement-intake',
    ),
    path('reports/', views.ReportListView.as_view(), name='report-list'),
    # 'week-2026-08-03' — a slug, so it can never swallow the trailing segment
    # of the PDF route below.
    path('reports/<slug:report_id>/', views.ReportDetailView.as_view(), name='report-detail'),
    path('reports/<slug:report_id>/pdf/', views.ReportPdfView.as_view(), name='report-pdf'),
    # The catalogue's database half. The techniques the app ships with are still
    # hardcoded in the frontend, so this list is only what specialists wrote —
    # see core/techniques.py.
    path('techniques/', views.TechniqueCatalogueView.as_view(), name='technique-catalogue'),
    # The patient's side of a specialist's invitation. Under account/ rather than
    # specialist/ because it is a decision about their own account, and because
    # everything under specialist/ refuses an account that is not one.
    path(
        'account/specialist-invitation/',
        views.SpecialistInvitationView.as_view(), name='specialist-invitation',
    ),
    path(
        'account/specialist-invitation/accept/',
        views.SpecialistInvitationAcceptView.as_view(),
        name='specialist-invitation-accept',
    ),
    path(
        'account/specialist-invitation/reject/',
        views.SpecialistInvitationRejectView.as_view(),
        name='specialist-invitation-reject',
    ),
    # The specialist's panel. Every one of these refuses an account with no
    # `specjalist` row, and the ones carrying a patient id refuse a patient who
    # has not accepted this specialist — see _require_specialist.
    path(
        'specialist/patients/',
        views.SpecialistPatientsView.as_view(), name='specialist-patients',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/',
        views.SpecialistPatientView.as_view(), name='specialist-patient',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/reports/',
        views.SpecialistPatientReportListView.as_view(),
        name='specialist-patient-reports',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/reports/<slug:report_id>/',
        views.SpecialistPatientReportDetailView.as_view(),
        name='specialist-patient-report',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/reports/<slug:report_id>/pdf/',
        views.SpecialistPatientReportPdfView.as_view(),
        name='specialist-patient-report-pdf',
    ),
    path(
        'specialist/parent-invitations/',
        views.SpecialistParentInvitationsView.as_view(),
        name='specialist-parent-invitations',
    ),
    path(
        'specialist/parent-invitations/<uuid:invitation_id>/',
        views.SpecialistParentInvitationView.as_view(),
        name='specialist-parent-invitation',
    ),
    # Where a specialist account comes from, now that registration cannot make
    # one — see core/colleagues.py.
    path(
        'specialist/colleagues/',
        views.SpecialistColleaguesView.as_view(), name='specialist-colleagues',
    ),
    path(
        'specialist/techniques/',
        views.SpecialistTechniquesView.as_view(), name='specialist-techniques',
    ),
    path(
        'specialist/techniques/<int:id_technique>/',
        views.SpecialistTechniqueView.as_view(), name='specialist-technique',
    ),
]
