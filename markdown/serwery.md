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
| lokalny Django (5) | plik `.env` |
| Azure App Service (1) | Application Settings w Portalu |

**`.env` NIE jedzie na Azure** — jest w `.dockerignore`. To plik tylko na moją maszynę. Dlatego zmiana portu czy hosta bazy w `.env` nigdy nie wpływa na Azure i nie trzeba jej tam powtarzać.

Dwie flagi mają default bezpieczny dla Azure, więc w Portalu **nie trzeba ich ustawiać** — nadpisuje je tylko lokalny `.env`:

| Zmienna | Azure (default) | Lokalnie |
|---|---|---|
| `DB_SSLMODE` | `require` | `disable` (kontener nie ma SSL) |
| `DJANGO_USE_PROXY_SSL_HEADER` | `true` | `false` (brak proxy przed serwerem) |

`.env.example` = lista wymaganych kluczy (dokumentacja dla kolegi), bez wartości.

Jeśli chcę lokalnie wycelować w bazę Azure: `cp .env.azure-backup .env`.

## Pułapki

- **Port 8000 jest zajęty** przez inny mój projekt — samo `runserver` bez portu się wywali. Dlatego 8001.
- **Nowa zmienna czytana przez `settings.py`** wymaga *dwóch* rzeczy na Azure: dodania jej w Application Settings **i** rebuildu obrazu. Sam App Setting nie wystarczy, jeśli kod jeszcze jej nie czyta.
- **Migracje to dwie komendy**, bo są dwie bazy:
  ```bash
  python backend/manage.py migrate --database=default
  python backend/manage.py migrate --database=medical
  ```
- **Coś działa lokalnie, ale nie na Azure?** Normalne. Azure ma reverse proxy i HTTPS, `runserver` nie — cała klasa błędów (CSRF, HTTPS, `DEBUG=False`, statyki) ujawnia się tylko tam. Po deployu zrobić szybki smoke test na Azure.
- **Lokalny Postgres jest na 5433, nie 5432**, bo 5432 zajmuje systemowy PostgreSQL. Port siedzi w `.env`, więc na codzień go nie widać.

## Odtworzenie lokalnej bazy od zera

Kontener nie ma wolumenu — usunięcie go = utrata danych. Odtworzenie:

```bash
docker run -d --name mediculus-pg \
  -e POSTGRES_USER=mediculus_admin -e POSTGRES_PASSWORD=local_dev_only \
  -p 5433:5432 postgres:16

docker exec -i mediculus-pg psql -U mediculus_admin -d postgres < scripts/database_setup.sql
docker exec -i mediculus-pg psql -U mediculus_admin -d postgres < scripts/mock_data.sql

python backend/manage.py migrate --database=default --fake-initial
python backend/manage.py migrate --database=medical --fake-initial
python backend/manage.py createsuperuser
```

`--fake-initial` jest konieczne, bo schemat tworzy `database_setup.sql`, a nie migracje. Ważne: `mock_data.sql` działa **tylko** na schemacie z tego SQL-a — nie na tabelach stworzonych przez `migrate`, bo Django nie daje kolumnom `created_at`/`updated_at` defaultów w bazie.
