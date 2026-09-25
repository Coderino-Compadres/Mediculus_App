# Mediculus

Mediculus to aplikacja webowa do monitorowania zdrowia psychicznego. Łączy
pacjentów (także niepełnoletnich), specjalistów i opiekunów. Pacjent prowadzi
dzienniczek, a specjalista, któremu pacjent dał dostęp, widzi na tej podstawie
cotygodniowe raporty.

## Moduły

- **Psychoterapia**: dzienniczek emocji i samopoczucia, tygodniowe raporty
  (tydzień od poniedziałku do niedzieli) i katalog technik DBT.
- **Dietetyka i psychodietetyka**: dzienniczek posiłków razem z emocjami przy
  jedzeniu, nawodnienie, suplementy i leki, aktywność i sen, raporty żywieniowe
  z analizą oraz techniki psychodietetyczne. Moduł jest celowo jakościowy:
  nie liczy kalorii, nie waży porcji i nie ocenia jedzenia.

## Role i dostęp

- **Pacjent** prowadzi dzienniczki i sam decyduje, kto zobaczy jego dane.
- **Specjalista** (psychoterapeuta albo psychodietetyk) widzi dane pacjenta
  dopiero po przyjęciu zaproszenia, osobno dla każdego modułu.
- **Opiekun** musi zatwierdzić powiązanie z niepełnoletnim pacjentem, zanim
  ten zacznie korzystać z części klinicznej (RODO, art. 8).

Korzystanie z aplikacji wymaga zgód RODO. Dane identyfikujące i dane
kliniczne leżą w dwóch osobnych bazach PostgreSQL: `user_db` i
pseudonimizowanej `medical_db`.

## Technologie

| Warstwa  | Stos                                                 |
|----------|------------------------------------------------------|
| Backend  | Python 3.12, Django 6, Django REST Framework         |
| Frontend | React 19, TypeScript, Vite, React Router             |
| Baza     | PostgreSQL 16 (dwie bazy)                            |
| Testy    | Django test runner, Vitest + Testing Library         |
| Wdrożenie| Docker, Gunicorn                                     |

## Struktura repozytorium

```
backend/    API w Django (aplikacja core, migracje, testy)
frontend/   aplikacja React (Vite)
scripts/    skrypty SQL tworzące schemat i dane demo, setup_dev.sh
ERD/        diagram bazy danych
markdown/   dokumentacja robocza
```

## Uruchomienie lokalne

1. Uruchom PostgreSQL 16 i utwórz schemat skryptem `scripts/database_setup.sql`.
   Dane demo są opcjonalne: `scripts/mock_data.sql`.
2. Skopiuj `.env.example` do `.env.local` i uzupełnij dane dostępowe do baz.
3. Backend:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   scripts/setup_dev.sh              # migruje obie bazy i sprawdza schemat
   python backend/manage.py runserver
   ```
4. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Obie bazy migruje się osobno, bo `migrate` bez parametrów obejmuje tylko
`default`. Skrypt `scripts/setup_dev.sh` robi to za ciebie.

## Testy

```bash
python backend/manage.py test core    # backend
cd frontend && npm run test           # frontend
```
