# Przegląd kodu — cały projekt

**Data:** 1 września 2026 · **Gałąź:** `pr_35_check` · **Zakres:** backend, frontend, skrypty

Kod jest w bardzo dobrym stanie — przemyślany, gęsto udokumentowany tam, gdzie decyzja
nie jest oczywista, i obudowany testami w skali, jakiej zwykle nie widuje się na tym
etapie. Problem nie leży w kodzie, tylko w tym, że nic tego nie pilnuje: 17,5 tysiąca
linii testów nie uruchamia się automatycznie ani razu.

## Projekt w liczbach

| | |
|---|---|
| Kod produkcyjny | **15 921** linii (backend 4 572 + frontend 11 349) |
| Testy | **17 474** linii w **65** plikach (backend 23, frontend 42) |
| Uruchomienia w CI | **0** — nie ma `.github/workflows` |
| `manage.py check --deploy` | **1 błąd, 2 ostrzeżenia** |
| Endpointy API | **17** · migracje: **9** |
| Ekrany bez backendu | **4** |

---

## Co jest naprawdę mocne

Wymieniam to nie z uprzejmości — te rzeczy trzeba znać, żeby ich przypadkiem nie „uprościć”.

- **Rozdzielenie baz jest konsekwentne.** `user_db` i `medical_db` spina wyłącznie
  `patient.id_medical` w kodzie aplikacji, router pilnuje trasowania modeli, a migracje
  z `RunSQL` noszą `hints={'target_db': …}`. Testy pilnują nawet tego, że hinty docierają
  do routera jako kwargi.
- **Logowanie nie zdradza, kto ma konto.** Jedna odpowiedź na złe hasło i nieznany adres,
  wyrównany czas (`_get_unmatchable_hash`), a licznik prób jest keyowany na *przesłanym*
  adresie — więc nie staje się wyrocznią, którą sama odpowiedź celowo nie jest.
- **Throttling nie zapisuje adresów IP.** `HashedIdent` wkłada do klucza cache
  HMAC-SHA256 keyowany na `SECRET_KEY`, a nie adres — i zostało to napisane *zanim*
  cache przeniesiono do tabeli w `user_db`, obok danych osobowych.
- **Bramka opiekuna jest domyślnie zamknięta.** `require_guardian_link=True`
  w `_require_patient` oznacza, że nowy endpoint kliniczny jest zamknięty przez
  zapomnienie, a nie otwarty. `test_guardian_gate.py` przeciąga wszystkie URL-e
  kliniczne z jednego miejsca.
- **Stuby w `api/account.ts` zawsze odrzucają.** Przy usuwaniu konta i wycofywaniu zgody
  fałszywy sukces to nie kosmetyka — ktoś mógłby przestać używać aplikacji wierząc,
  że jego dane zdrowotne zniknęły.
- **Katalog technik nie zmyśla treści.** Czasy trwania z makiety pominięte, bo materiały
  klientki ich nie podają; „Temperatura” z TIPP nazwana, ale świadomie nieopisana ze
  względu na przeciwwskazania medyczne. Testy pilnują obu tych nieobecności.

---

## Priorytet 1 — zanim pójdzie kolejny merge

### P1·1 · 17,5 tysiąca linii testów, których nic nie uruchamia

*(zweryfikowane)*

Nie ma `.github/workflows` ani żadnej innej automatyzacji. 65 plików testowych uruchamia
się wyłącznie wtedy, gdy ktoś o tym pamięta — a frontendowy zestaw nie startuje nawet
ręcznie: `npm run test` wywala się na starcie workera, zanim wykona pierwszy test.
To niezgodność środowiska (Node 20.19.2 vs undici/jsdom), nie błąd w kodzie, ale skutek
jest taki, że 9 170 linii testów frontendu jest dziś martwe.

Skala ryzyka jest już zmierzona, nie hipotetyczna: w trzech ostatnich merge’ach
**dwukrotnie** rozwiązanie konfliktu wzięło cały plik z jednej strony i skasowało gotową
funkcję — raz panel technik, raz panel technik i profil naraz. Oba przypadki przechodziły
przez `git` bez protestu (fast-forward, brak markerów) i wyszły dopiero z ręcznie
odpalonego `tsc`.

```
brak: .github/workflows/
npm run test → TypeError: webidl.util.markAsUncloneable is not a function
backend 8 304 linii testów · frontend 9 170 linii testów
```

**Propozycja.** Jeden workflow, cztery kroki, ~15 minut roboty: `npm run typecheck`,
`npm run lint`, `npm run test`, `python manage.py test core --noinput`. Sam typecheck
złapałby oba zniszczone merge’e. Osobno: podnieść Node do 22 LTS albo przypiąć wersję
jsdom działającą na 20.x — bez tego trzeci krok i tak nic nie da.

### P1·2 · Walidator podobieństwa hasła jest podłączony, ale nic nie robi

*(zweryfikowane)*

`AUTH_PASSWORD_VALIDATORS` zawiera `UserAttributeSimilarityValidator`, ale
`RegisterSerializer.validate_password` woła `validate_password(value)` bez argumentu
`user` — a bez niego ten walidator wraca natychmiast, nic nie sprawdzając. Sprawdzone
na żywo w shellu projektu: hasło identyczne z adresem e-mail konta przechodzi
rejestrację. Pozostałe trzy walidatory działają, więc problem dotyczy tylko tego
jednego, za to całkowicie.

```
backend/core/serializers.py — validate_password()
>>> validate_password('anna.kowalska@example.com')   # przechodzi
```

**Propozycja.** Przenieść sprawdzenie z `validate_password` do `validate()`, gdzie `attrs`
ma już adres, imię i nazwisko, i podać niezapisanego `User(email=…, name=…, surname=…)`
jako drugi argument. Warto przy okazji dopisać test — akurat ten regres jest całkowicie
niewidoczny.

### P1·3 · `manage.py check --deploy` kończy się błędem

*(zweryfikowane)*

Przy `DJANGO_DEBUG=false` Django zgłasza jeden błąd i dwa ostrzeżenia. Błąd (`mail.E001`)
jest znany — w tym wdrożeniu nie ma poczty w ogóle — ale dopóki jest błędem, a nie
świadomie wyciszonym ostrzeżeniem, ta komenda nie nadaje się na krok w CI, co jest szkoda,
bo to najtańszy dostępny audyt konfiguracji produkcyjnej.

```
mail.E001      konsolowy backend poczty w ustawieniach produkcyjnych
security.W004  brak SECURE_HSTS_SECONDS
security.W008  brak SECURE_SSL_REDIRECT
```

**Propozycja.** HSTS i przekierowanie na HTTPS to dwie linijki w bloku `if not DEBUG` —
App Service i tak terminuje TLS, a `SECURE_PROXY_SSL_HEADER` jest już ustawione. Poczcie
dać `SILENCED_SYSTEM_CHECKS = ['mail.E001']` z komentarzem „brak poczty w tym wdrożeniu”,
żeby cisza była decyzją, a nie przeoczeniem.

---

## Priorytet 2 — realne błędy i niespójności

### P2·1 · Analiza pokazuje stary błąd nad poprawnie wczytanym wykresem

*(zweryfikowane)*

`useYearFrequency` nigdy nie czyści stanu `failure` po udanym pobraniu. Scenariusz:
wybierasz rok, który nie wczytuje się z powodu chwilowej awarii sieci → przełączasz na
inny rok, który działa → wracasz do pierwszego. Efekt jest pobierany poprawnie i trafia
do `data`, ale `failed` nadal jest prawdziwe, więc ekran rysuje komunikat o błędzie
i chowa wykres, który właśnie się załadował. Wychodzi z tego dopiero kliknięcie
„Spróbuj ponownie”, bo ono podbija `attempt`.

```
frontend/src/pages/Analysis.tsx — useYearFrequency()
.then(answer => { setData(answer); setYears(…) })   ← brak setFailure(null)
```

**Propozycja.** Jedna linia: `setFailure(null)` obok `setData` w gałęzi sukcesu.

### P2·2 · Kod twierdzi dwie sprzeczne rzeczy o walidacji istniejącego hasła

`ProfilePasswordForm` ma lokalny `validateCurrentPassword` (samą obecność) i długie
uzasadnienie: konta zasiane przez `mock_data.sql` albo założone przed regułą mogą mieć
hasło krótsze niż osiem znaków, a walidowanie ich jako nowego hasła robi ślepy zaułek —
komunikat „min. 8 znaków” pod polem *obecnego* hasła i formularz, którego nie da się
wysłać. Trzy inne miejsca proszące o istniejące hasło używają `validatePassword`, czyli
odtwarzają dokładnie ten zaułek. Dwa z nich to ścieżki wycofania zgody i usunięcia konta,
które z art. 7(3) RODO mają być „równie łatwe jak udzielenie zgody”.

Dziś to utajone, bo `Login.tsx` waliduje tak samo i takie konto i tak się nie zaloguje.
Ale albo przesłanka jest prawdziwa — wtedy do poprawy są trzy miejsca, z logowaniem na
czele — albo fałszywa, i wtedy lokalny walidator w formularzu hasła jest zbędny.

```
components/AccountClosureConfirm.tsx · components/ServicesConsentWithdrawal.tsx · pages/Login.tsx
kontra: components/ProfilePasswordForm.tsx — validateCurrentPassword()
```

**Propozycja.** Rozstrzygnąć w jedną stronę i wynieść walidator do `utils/validation.ts`,
żeby nie dało się mieć obu odpowiedzi naraz.

### P2·3 · Profil wygląda tak samo dla opiekuna, jak dla pacjenta

Trasa `/profile` jest chroniona tylko przez `RequireAuth`, bez rozróżnienia roli,
a `useAuth()` ma i `role`, i `is_child` — `UserSerializer` oba wystawia. Rodzic albo
opiekun po wejściu w „Profil” zobaczy kartę **OPIEKA** z nazwiskiem terapeuty i licznik
ośmiu wpisów w dzienniczku: dane o relacji klinicznej, której nie ma, bo opiekun nie
dostaje wiersza `patient` w ogóle. Plik zawiera `TODO(warianty kont)` opisujące to jako
osobne zadanie, ale nic dziś nie blokuje wejścia.

```
frontend/src/pages/Profile.tsx · frontend/src/App.tsx (trasa ROUTES.profile)
backend/core/serializers.py — ACCOUNT_TYPES: 'parent' → brak wiersza patient
```

**Propozycja.** Na teraz: warunkować liczniki i kartę opieki na `user.role === 'patient'`
i dodać test dla konta niepacjenta — dziś wszystkie 22 testy profilu renderują pacjenta.
Docelowo osobne ekrany, zgodnie z tym TODO.

### P2·4 · Rejestr zgód pokazuje wszystkim tę samą zmyśloną datę

`CONSENT_GRANTS` jest zahardkodowane na 14 lipca 2026, więc konto założone wczoraj
zobaczy w sekcji „Twoje dane i zgody”, że udzieliło zgód półtora miesiąca temu. Autor
zauważył tę klasę problemu przy dacie wizyty i opatrzył ją komentarzem; tutaj waży
więcej, bo to jedyna z zahardkodowanych wartości, która jest **dowodem prawnym** —
art. 7(1) RODO kładzie ciężar dowodu udzielenia zgody na nas.

I jest to najtańsza rzecz do odmockowania w całym projekcie: kolumny `data_consent_at`
i `services_consent_at` istnieją w bazie od migracji 0004 i są zapisywane przy
rejestracji. Brakuje wyłącznie dwóch pozycji w `UserSerializer.Meta.fields`.

```
frontend/src/data/profile.ts — CONSENT_GRANTS
backend/core/serializers.py:70 — fields = ['id', 'email', 'name', 'surname', 'date_of_birth', …]
```

**Propozycja.** Dodać oba pola do serializera i czytać je w profilu. Dopóki tego nie ma,
lepiej pokazywać „Udzielona” bez daty niż datę nieprawdziwą.

---

## Priorytet 3 — dług i higiena

### P3·1 · CLAUDE.md przestał nadążać za czterema ekranami

Ten plik jest w tym repo utrzymywany wyjątkowo starannie i właśnie dlatego luka odstaje.
Nie opisuje ani analizy, ani katalogu technik, ani profilu, ani planu bezpieczeństwa —
czterech ekranów, które weszły w ostatnich PR-ach. Trzy zdania są wprost nieprawdziwe:
że `ROUTES.analysis` to `PlaceholderPage`, że frontendowa połowa `time_of_day` jest
niezmergowana, i że `markdown/` to notatki planistyczne, a nie dokumentacja kodu —
podczas gdy `markdown/techniki-dbt.md` jest dziś źródłem treści produkcyjnej, cytowanym
z nagłówka pliku z danymi.

**Propozycja.** Jedna sesja aktualizacji po zamknięciu tych PR-ów, plus akapit o katalogu
technik jako treści klinicznej czekającej na recenzję specjalistek.

### P3·2 · Powtórzone zapytanie w `UserSerializer`

`get_is_child` robi `Patient.objects.filter(user=user).first()` i jest wołane dwa razy na
każdą serializację: raz jako własne pole, raz z wnętrza `get_guardian_status`. Do tego
dochodzi zapytanie o `parent_child`. To trzy zapytania tam, gdzie wystarczą dwa — na
endpoincie, który frontend odpytuje przy każdym starcie aplikacji i po każdym
odrzuceniu 403.

**Propozycja.** Zapamiętać wiersz `patient` w `self.context` albo w atrybucie instancji.

### P3·3 · `GuardianLinkThrottle` dzieli scope z limitem per-IP

Klasa ma `scope = 'auth'`, czyli ten sam co `AuthThrottle`. Działa — `UserRateThrottle`
keyuje na kluczu głównym konta, a `AuthThrottle` na skrócie adresu, więc klucze cache się
nie zderzają — ale dwie różne polityki pod jedną nazwą scope’a znaczą, że zmiana limitu
dla logowania po cichu zmienia limit zapraszania opiekuna.

**Propozycja.** Własny scope (`'guardian_link'`) z własną stawką w `settings.py`.

### P3·4 · Cudzysłowy: 33 otwierające, 7 zamykających

*(zweryfikowane)*

W całym `frontend/src` polski cudzysłów otwierający `„` jest niemal zawsze zamykany
prostym ASCII-owym `"`. Widać to w interfejsie: `„Dam radę"`, `Pierwsze „P" w TIPP`.
Poprawnie robią to tylko `Register.tsx` i `TrendChart.tsx`. Sam katalog technik dokłada
25 nowych wystąpień, bo to największa porcja polskiej prozy w aplikacji.

**Propozycja.** Jednorazowa zamiana plus reguła w przeglądzie. Drobiazg, ale widoczny dla
pacjenta na każdej stronie katalogu.

### P3·5 · Cały katalog technik jedzie w głównym bundlu PWA

`App.tsx` importuje wszystkie ekrany statycznie — nie ma ani jednego `React.lazy`.
`data/techniques.ts` to 628 linii tekstu klinicznego, które trafiają do przeglądarki także
na ekranie logowania. Spójne z resztą aplikacji, więc nie jest to regres żadnego
konkretnego PR-a, ale to PWA na telefon i objętość rośnie z każdym ekranem.

**Propozycja.** Kiedy pojawi się backend katalogu, problem zniknie sam. Do tego czasu
wystarczyłoby leniwe ładowanie samych `Techniques` i `TechniqueDetail`.

---

## Ryzyko, które nie jest błędem w kodzie

Trzy rzeczy, które trzeba widzieć razem, bo osobno każda wygląda na drobiazg.

- **Cztery ekrany bez backendu.** Profil (konta, zgody, usunięcie), techniki, plan
  bezpieczeństwa i część analizy działają na danych zaszytych w kodzie. Każdy jest
  uczciwie oznaczony i każdy ma opisany kontrakt endpointu — ale to cztery funkcje,
  które klientka może kliknąć, a które nic nie zapisują.
- **`raport` nadal nie jest zapisywany przez nic.** Tabela istnieje, `mock_data.sql`
  ją zasiewa, a `dashboard.py` czyta z niej propozycję techniki na stronie głównej — więc
  ta karta u prawdziwego pacjenta nie pojawi się nigdy. Do utrwalenia raportu tygodniowego
  brakuje przy tym kolumny z tygodniem, czyli zmiany schematu, nie samego `INSERT`-a.
- **Dwie techniki z listy „Do decyzji klienta” weszły do katalogu ogólnego.** Dokument
  źródłowy rekomenduje oznaczyć cztery jako „do wprowadzenia przez specjalistę”. Dwie są
  załatwione, ale wysiłek aerobowy z TIPP i regularne odżywianie z PLEASE są dostępne dla
  każdego — ze złagodzonym tekstem, bez bramki. Przy aplikacji dla zaburzeń odżywiania
  i dla nastolatków to decyzja do potwierdzenia przez specjalistki, nie do przemilczenia.
  Warto też wiedzieć, że pole `dostepnosc` chowa technikę z interfejsu, ale jej treść i tak
  jedzie w bundlu — jeśli ma naprawdę wstrzymywać, dane muszą trafić na serwer.

---

## Gdyby wybierać jedną rzecz

Workflow z czterema komendami. Nie dlatego, że to najciekawsze zadanie na tej liście,
tylko dlatego, że jako jedyne zmienia charakter wszystkich pozostałych: w projekcie,
w którym dwa merge’e z rzędu po cichu skasowały gotową funkcję, największym pojedynczym
aktywem są testy, których nikt nie uruchamia.

Zaraz po tym **P1·2** — walidator hasła, który wygląda na włączony i nie jest — bo to
jedyne ustalenie na liście, którego nie da się zauważyć z zewnątrz w ogóle.

---

## Czego ten przegląd nie sprawdził

- **Pełny backendowy zestaw testów** (`python manage.py test core --noinput`) nie został
  uruchomiony. Podzbiór bezbazowy — 92 testy — przechodzi, a `check_databases` na obu
  bazach jest czyste.
- **Testy frontendu** nie startują w tym środowisku (patrz P1·1), więc żaden z nich nie
  został wykonany; sprawdzone zostały `typecheck` i `lint`, oba czyste.
- **Warstwa infrastruktury** (Dockerfile, App Service, ACR) oceniona tylko z konfiguracji
  w repo, bez dostępu do wdrożenia.
