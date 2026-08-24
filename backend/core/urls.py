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
    path('dashboard/home/', views.HomeDashboardView.as_view(), name='home-dashboard'),
]
