# Na jutro

## 1. Utworzyć superusera Django

Backend na Azure już działa (`mediculus-dev`), ale nie ma jeszcze żadnego konta admina.

```bash
cd /home/debian/Desktop/Mediculus_App
source .venv/bin/activate
cd backend
python manage.py createsuperuser
```

`.env` wskazuje na produkcyjną bazę `user_db` na Azure, więc konto stworzone lokalnie od razu działa na:
`https://mediculus-dev-gxgvhndscqdxa5d0.polandcentral-01.azurewebsites.net/admin/`

Po utworzeniu — zalogować się i sprawdzić, że panel faktycznie działa.

## 2. Plan udostępnienia dostępu koledze (frontend/PWA)

Do przemyślenia i ustalenia, ile dostępu faktycznie potrzebuje:

- [ ] **Backend API** — jak już będą pierwsze endpointy (DRF), przekazać mu base URL + docs (Swagger/Redoc), niekoniecznie dostęp do samego Azure.
- [ ] **Azure Portal (opcjonalnie)** — jeśli ma widzieć logi/status appki: dodać go w **Access control (IAM)** na resource group (`Mediculus_backend` i/lub `Mediculus_DB`) z rolą **Reader** (podglad) albo **Contributor** (jeśli ma też coś konfigurować). Nie dawać Owner bez potrzeby.
- [ ] **Baza danych** — prawdopodobnie NIE potrzebuje bezpośredniego dostępu do Postgresa, jeśli cała komunikacja idzie przez API. Jeśli jednak potrzebuje (np. do debugowania), rozważyć osobnego, ograniczonego usera Postgresa (nie admina) zamiast dzielenia się `mediculus_admin`.
- [ ] **Repo/git** — dostęp do repozytorium (branch, PR flow).

## 3. Do zrobienia po drodze (bezpieczeństwo)

- [ ] **Zrotować hasło admina Postgresa i ACR** — oba były wklejane w rozmowie z Claude (żywe sekrety w historii czatu), warto je zmienić w portalu przy najbliższej okazji.
- [ ] Ustawić `DJANGO_DEBUG=False` na Azure (potwierdzone że appka działa stabilnie po fixie portu 80→8000).
- [ ] Rozważyć docelowo przeniesienie sekretów (hasła DB, ACR) z gołego `.env` do czegoś w stylu Azure Key Vault, zanim dojdzie więcej osób do zespołu.
