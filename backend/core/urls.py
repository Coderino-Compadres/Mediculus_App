"""URLs for the `core` app, mounted under /api/ by config/urls.py."""

from django.urls import path

from . import views

app_name = 'core'

urlpatterns = [
    path('auth/csrf/', views.CsrfView.as_view(), name='csrf'),
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    # The way back into an account whose password is gone. Under auth/ rather
    # than account/, and that is the distinction the prefix carries everywhere
    # here: account/ is what a session can do to itself, auth/ is what a visitor
    # with no session may ask for. `/confirm/` is a second endpoint rather than
    # a field on the first, because the two are answered on different days by a
    # person holding different things — an address, then a token.
    path(
        'auth/password-reset/',
        views.PasswordResetRequestView.as_view(), name='password-reset',
    ),
    path(
        'auth/password-reset/confirm/',
        views.PasswordResetConfirmView.as_view(), name='password-reset-confirm',
    ),
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
    # §13's health profile. Under account/ rather than diet/, because it is a
    # record about the person rather than an entry in a diary: it has no date,
    # no week and no history, and the diet module reads it rather than owning
    # it.
    path(
        'account/health-profile/',
        views.HealthProfileView.as_view(), name='account-health-profile',
    ),
    # §13's own profile: the diet module's counters and its psychodietitian.
    # Under diet/ rather than account/, unlike the health profile above, because
    # unlike that one it *is* module-specific — it answers "who treats me here"
    # and "how much have I written here".
    path('diet/profile/', views.DietAccountProfileView.as_view(), name='diet-profile'),
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
    # §09, "Aktywność i sen". Both address today and nothing else, the shape
    # `diary/today/` and `diet/hydration/` already have: no URL names an older
    # day, so "a day is locked once it is over" is structural rather than a
    # permission somebody can forget.
    path('diet/activity/', views.DietActivityView.as_view(), name='diet-activity'),
    # Before the '<uuid>' route, so 'steps' is never read as an id -- the same
    # ordering rule 'diary/today/' needs.
    path(
        'diet/activity/steps/',
        views.DietActivityStepsView.as_view(), name='diet-activity-steps',
    ),
    path(
        'diet/activity/<uuid:id_activity>/',
        views.DietActivityEntryView.as_view(), name='diet-activity-entry',
    ),
    path('diet/sleep/', views.DietSleepView.as_view(), name='diet-sleep'),
    # §10's weekly reports. Their own prefix rather than /reports/, which is the
    # psychotherapy module's: the two count a week differently (Monday-to-Sunday
    # there, seven days from the first entry here), so one list holding both
    # would be one list with two meanings of the word.
    path('diet/reports/', views.DietReportListView.as_view(), name='diet-report-list'),
    # 'week-2026-09-01' -- a slug, matching the psychotherapy route's shape.
    path(
        'diet/reports/<slug:report_id>/',
        views.DietReportDetailView.as_view(), name='diet-report-detail',
    ),
    # The same week as a document. A slug before the trailing segment, exactly
    # as the psychotherapy PDF route needs it.
    path(
        'diet/reports/<slug:report_id>/pdf/',
        views.DietReportPdfView.as_view(), name='diet-report-pdf',
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
    # The id names *which* invitation, which is how the module is known: since
    # 0022 a patient can be asked by a psychotherapist and a psychodietitian at
    # once, and an endpoint with no id would have had to pick one.
    path(
        'account/specialist-invitation/<uuid:invitation_id>/accept/',
        views.SpecialistInvitationAcceptView.as_view(),
        name='specialist-invitation-accept',
    ),
    path(
        'account/specialist-invitation/<uuid:invitation_id>/reject/',
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
    # §10's reports, read by the patient's psychodietitian. Their own prefix
    # rather than a module parameter on the routes above, exactly as the
    # patient's own routes are split: the two modules do not agree on what a
    # week is (Monday-to-Sunday there, seven days from the first entry here).
    path(
        'specialist/patients/<uuid:patient_id>/diet-reports/',
        views.SpecialistPatientDietReportListView.as_view(),
        name='specialist-patient-diet-reports',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/diet-reports/<slug:report_id>/',
        views.SpecialistPatientDietReportDetailView.as_view(),
        name='specialist-patient-diet-report',
    ),
    path(
        'specialist/patients/<uuid:patient_id>/diet-reports/<slug:report_id>/pdf/',
        views.SpecialistPatientDietReportPdfView.as_view(),
        name='specialist-patient-diet-report-pdf',
    ),
    # Ending one relationship: the module is in the path and is not optional,
    # because a specialist treating somebody in both modules is ending one of
    # two.
    #
    # **DECLARED LAST OF THE `patients/<id>/…` ROUTES, AND THAT IS LOAD-BEARING**
    # rather than tidy: `<slug:module>` matches 'reports' and 'diet-reports'
    # perfectly well, so higher up it swallowed both report routes and every GET
    # to them answered 405. Django resolves in declaration order; anything more
    # specific has to come first.
    path(
        'specialist/patients/<uuid:patient_id>/<slug:module>/',
        views.SpecialistPatientView.as_view(), name='specialist-patient',
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
