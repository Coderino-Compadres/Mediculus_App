# Serwery — co na jakim

## Szybki przegląd

| # | Serwer | Adres | Co tam jest |
|---|---|---|---|
| 1 | **Azure App Service** `mediculus-dev` | `mediculus-dev-gxgvhndscqdxa5d0.polandcentral-01.azurewebsites.net` | backend Django (wspólne dev, widzi je kolega) |
| 2 | **Azure Postgres** | `mediculus.postgres.database.azure.com:5432` | bazy `user_db` + `medical_db` — wspólne dane |
| 3 | **ACR** (rejestr obrazów) | `mediculusback.azurecr.io` | obraz `mediculus-backend:latest` |
| 4 | **Lokalny Postgres** (kontener `mediculus-pg`) | `localhost:5433` | te same 2 bazy, ale moja piaskownica |
| 5 | **Lokalny Django** (`runserver`) | `127.0.0.1:8001` | kod z dysku, odpalam na żądanie |
| 6 | **Lokalny Vite** (frontend) | `localhost:5173` | React PWA, odpalam na żądanie |

3 zdalne (1–3) + 3 lokalne (4–6). Serwery 5 i 6 to procesy na czas pracy, nie stałe usługi.

## Gdzie co robić

**Codzienna praca → lokalnie (5 + 4)**

```bash
source .venv/bin/activate
python backend/manage.py runserver 8001
```

Zmiany widać od razu (auto-reload). Baza to lokalny kontener, więc mogę psuć dane bez konsekwencji.
Panel: `http://127.0.0.1:8001/admin/` — login `admin`, hasło `admin`.

**Jak działa → wypchnąć na Azure (1)**

```bash
docker build -t mediculusback.azurecr.io/mediculus-backend:latest .
docker push mediculusback.azurecr.io/mediculus-backend:latest
```
Potem Restart w Portalu Azure. Robić to **świadomie**, gdy kolega ma zobaczyć zmiany — nie po każdej edycji.

**Zmiana samej konfiguracji (bez kodu)** → Portal Azure → App Service → Application Settings. Bez rebuildu.

## Skąd każdy serwer bierze konfigurację

| Serwer | Źródło configu |
|---|---|
| lokalny Django (5) | `.env.local` (default) albo `.env.azure` |
| Azure App Service (1) | Application Settings w Portalu |

Lokalnie są **dwa pliki env**, różnią się blokiem bazy i `DB_SSLMODE`:

| Plik | Baza | `DB_SSLMODE` |
|---|---|---|
| `.env.local` | kontener `localhost:5433` | `disable` |
| `.env.azure` | `mediculus.postgres.database.azure.com:5432` | `require` |

`settings.py` czyta `.env.local`, chyba że wskażę inny plik zmienną `DJANGO_ENV_FILE`:

```bash
python backend/manage.py runserver 8001                                    # lokalna baza
DJANGO_ENV_FILE=.env.azure python backend/manage.py runserver 8001               # baza na Azure
```

Prawdziwe zmienne środowiskowe wygrywają z plikiem, więc jednorazowa podmianka jednego klucza to `DB_SSLMODE=require python backend/manage.py ...` — bez edycji plików.

**Żaden z tych plików nie jedzie na Azure** — `.dockerignore` blokuje `.env*` (poza `.env.example`). To pliki tylko na moją maszynę, więc zmiana hosta czy portu bazy nigdy nie wpływa na Azure i nie trzeba jej tam powtarzać.

Dwie flagi mają default bezpieczny dla Azure, więc w Portalu **nie trzeba ich ustawiać** — nadpisują je tylko pliki lokalne:

| Zmienna | Azure (default) | Lokalnie |
|---|---|---|
| `DB_SSLMODE` | `require` | `disable` w `.env.local`, `require` w `.env.azure` |
| `DJANGO_USE_PROXY_SSL_HEADER` | `true` | `false` w obu (brak proxy przed runserverem) |

`.env.example` = lista wymaganych kluczy (dokumentacja dla kolegi), bez wartości. Skopiować do `.env.local` i `.env.azure`, potem uzupełnić hasła.

## pgAdmin

| Pole | Azure | Lokalnie |
|---|---|---|
| Host | `mediculus.postgres.database.azure.com` | `localhost` |
| Port | `5432` | `5433` |
| Username | `mediculus_admin` | `mediculus_admin` |
| Maintenance DB | `user_db` | `user_db` |
| SSL mode | `Require` | `Disable` |

Hasła: w `.env.azure` / `.env.local`. Jedno połączenie pokazuje **obie** bazy w drzewku Databases — siedzą na tym samym serwerze, więc nie trzeba rejestrować dwóch. Timeout na Azure = prawie zawsze firewall: Portal → zasób Postgres → Networking → „Add current client IP address" (przy zmianie IP trzeba powtórzyć).

## Pułapki

- **Port 8000 jest zajęty** przez inny mój projekt — samo `runserver` bez portu się wywali. Dlatego 8001.
- **Nowa zmienna czytana przez `settings.py`** wymaga *dwóch* rzeczy na Azure: dodania jej w Application Settings **i** rebuildu obrazu. Sam App Setting nie wystarczy, jeśli kod jeszcze jej nie czyta.
- **Migracje to dwie komendy**, bo są dwie bazy:
  ```bash
  python backend/manage.py migrate --database=default
  python backend/manage.py migrate --database=medical
  ```
  Zapomniana druga komenda nie daje żadnego sygnału: import przechodzi, testy przechodzą, a pierwsze żądanie do `/api/dashboard/home/` wywala 500 z `column diary.tension_level does not exist`. Dlatego jest `scripts/setup_dev.sh` — robi obie i na końcu weryfikuje. Samą weryfikację (read-only, bezpieczna wszędzie, też przeciw Azure) daje:
  ```bash
  python backend/manage.py check_databases
  DJANGO_ENV_FILE=.env.azure python backend/manage.py check_databases
  ```
- **Coś działa lokalnie, ale nie na Azure?** Normalne. Azure ma reverse proxy i HTTPS, `runserver` nie — cała klasa błędów (CSRF, HTTPS, `DEBUG=False`, statyki) ujawnia się tylko tam. Po deployu zrobić szybki smoke test na Azure.
- **Zanik prądu albo twardy reset ubija kontener** (`Exited (255)`) — pgAdmin i Django pokazują wtedy *connection timeout*. Dane przeżywają, bo siedzą w warstwie zapisywalnej kontenera, więc wystarczy `docker start mediculus-pg`. Kasuje je dopiero `docker rm`. Kontener ma już `--restart unless-stopped`, a demon `docker` jest `enabled` w systemd, więc powinien wstawać sam.
- **Timeout na Azure po restarcie routera** = nowe publiczne IP i stara reguła firewalla. Portal → zasób Postgres → Networking → *Add current client IP address* → Save, odczekać kilkadziesiąt sekund, potem reconnect. Poznaje się to po tym, że firewall Azure **gubi** pakiety (timeout), a nie odrzuca połączenia (*refused*).
- **Lokalny Postgres jest na 5433, nie 5432**, bo 5432 zajmuje systemowy PostgreSQL. Port siedzi w `.env.local`, więc na codzień go nie widać.
- **`DB_SSLMODE=disable` przy azurowym hoście = brak połączenia.** Azure Postgres odrzuca plaintext. Dlatego host i `DB_SSLMODE` muszą przestawiać się razem — po to są dwa pliki zamiast ręcznej edycji jednego.
- **`migrate --database=medical` wypisuje `Applying auth.0001_initial... OK` — i to nie znaczy, że coś powstało.** `allow_migrate` w `core/routers.py:19` blokuje apki inne niż `core` poza `default`, więc Django zapisuje tylko wpis w `django_migrations`, bez tworzenia tabel. W `medical_db` są wyłącznie `diary`, `mood_scale`, `raport`, `technique` + `django_migrations` — tak ma być.
- **Nie mogę się zalogować do `/admin/`?** Najpierw sprawdzić, czy konto w ogóle jest tam, gdzie celuje serwer: `docker exec mediculus-pg psql -U mediculus_admin -d user_db -c "SELECT username, is_staff FROM auth_user;"`. Konta Django (`auth_user`) są tylko w bazie `default`, więc przy `DJANGO_ENV_FILE=.env.azure` obowiązują konta z Azure, nie lokalne. Reset hasła: `python backend/manage.py changepassword <login>`.

## Odtworzenie lokalnej bazy od zera

Kontener nie ma wolumenu — usunięcie go = utrata danych. Odtworzenie:

```bash
docker run -d --name mediculus-pg \
  -e POSTGRES_USER=mediculus_admin -e POSTGRES_PASSWORD=123 \
  -p 5433:5432 postgres:16

docker exec -i mediculus-pg psql -v ON_ERROR_STOP=1 -U mediculus_admin -d postgres < scripts/database_setup.sql
docker exec -i mediculus-pg psql -v ON_ERROR_STOP=1 -U mediculus_admin -d postgres < scripts/mock_data.sql

scripts/setup_dev.sh          # oba migrate --fake-initial + check_databases
python backend/manage.py createsuperuser
```

Po utworzeniu od razu polityka restartu, żeby kontener wstawał po reboocie czy zaniku prądu:

```bash
docker update --restart unless-stopped mediculus-pg
```

`POSTGRES_PASSWORD` musi się zgadzać z `USER_DB_PASSWORD`/`MEDICAL_DB_PASSWORD` w `.env.local` (teraz `123`) — inaczej Django dostanie *password authentication failed*.

Stan po odtworzeniu: 7 × `user`, 4 × `patient` w `user_db`; 5 × `diary`, 5 × `mood_scale`, 3 × `technique`, 4 × `raport` w `medical_db`. Migracje: `core.0001` FAKED, `0002`–`0008` zaaplikowane w obu bazach (`scripts/setup_dev.sh` to potwierdzi).

`--fake-initial` jest konieczne, bo schemat tworzy `database_setup.sql`, a nie migracje. Ważne: `mock_data.sql` działa **tylko** na schemacie z tego SQL-a — nie na tabelach stworzonych przez `migrate`, bo Django nie daje kolumnom `created_at`/`updated_at` defaultów w bazie.
