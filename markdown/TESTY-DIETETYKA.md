# Testy manualne — moduł dietetyczny i psychodietetyczny

**Data:** 17 września 2026
**Gałąź:** `child_parent_specjalist_acc` (commit `e281f82`)
**Środowisko:** lokalne — Django `127.0.0.1:8000` (venv projektu), Vite `localhost:5173`,
bazy `user_db` + `medical_db` na `localhost:5433`
**Zakres:** cała część dietetyczna, wszystkie poziomy kont (pacjent dorosły, pacjent
małoletni zatwierdzony, pacjent małoletni niezatwierdzony, konto bez zgód, rodzic/opiekun,
psychodietetyk, psychoterapeuta, specjalista obcy)
**Metoda:** przejścia klikane w przeglądarce + `curl` do przypadków, których UI nie wystawia
(granice uprawnień, walidacje, limity)

---

## 1. Podsumowanie

Przeszło **68 z 68** wykonanych przypadków funkcjonalnych. Nie znaleziono żadnego błędu
w liczeniu, w uprawnieniach ani w zapisie danych — a to są w tym module rzeczy najdroższe
w naprawie. Wszystkie agregaty raportu tygodniowego i ekranu analizy zweryfikowałem co do
jednej liczby zapytaniami do bazy: **zgadzają się w stu procentach**.

Znalazłem **9 usterek**, wszystkie poza jedną drobne. Żadna nie blokuje wydania, ale
pierwsza z nich jest realną dziurą w ścieżce użytkownika i warto ją naprawić przed
pokazaniem modułu komukolwiek z zewnątrz.

| # | Waga | Rzecz | Miejsce | Stan |
|---|---|---|---|---|
| 1 | **Istotna** | Zaproszenie od psychodietetyka jest niewidoczne w module dietetycznym | `pages/DietHome.tsx` | **naprawione** |
| 2 | Średnia | `KONTA.md` opisuje regułę nawodnienia odwróconą 17.09 w kodzie | `markdown/KONTA.md` | **naprawione** |
| 3 | Średnia | „1 **dni** z rzędu" — brak odmiany na stronie głównej | `pages/DietHome.tsx:435` | **naprawione** |
| 4 | Drobna | „9,6 **szklanek**" zamiast „9,6 szklanki" | `utils/drinks.ts:65` | **naprawione** |
| 5 | Drobna | Docstring opisuje odmowę, której kod już nie robi | `core/hydration.py:95` | **naprawione** |
| 6 | Drobna | „Nic nie jest wymagane — wystarczy nazwa" (zdanie sobie przeczy) | ekran suplementów | **naprawione** |
| 7 | Drobna | Pusty dzień dzienniczka nie mówi, którego dnia dotyczy | `pages/DietJournalDay.tsx` | **naprawione** |
| 8 | Drobna | Błędna data w URL wygląda jak dzień bez wpisów | `pages/DietJournalDay.tsx` | **naprawione** |
| 9 | Drobna | „Dodaj do listy" jest `disabled` bez wyjaśnienia, niespójnie ze `Stepper` | ekran suplementów | **naprawione** |

Wszystkie dziewięć naprawiono tego samego dnia — co zostało zmienione i czym to
przykryte, opisuje rozdział 6.

---

## 2. Usterki — opis i odtworzenie

### 1. Zaproszenie od psychodietetyka nie pojawia się w module dietetycznym

**Waga:** istotna — zaproszenie potrafi utknąć na zawsze.

`SpecialistInvitationCard` renderuje się w `pages/Home.tsx:287` (moduł psychoterapeutyczny)
i w `pages/LinkGuardian.tsx:122,220` (ekran oczekiwania małoletniego). W `pages/DietHome.tsx`
nie ma go wcale — ani komponentu, ani importu.

Skutkiem tego pacjent, który korzysta **wyłącznie** z modułu dietetycznego — a taki
scenariusz aplikacja wprost przewiduje (`KONTA.md` §4: „Dziecko, które korzysta **tylko**
z modułu dietetycznego, ma po stronie psychoterapii zera") — po zalogowaniu wybiera kafelek
„Dietetyka i psychodietetyka", ląduje na `/diet` i **nigdy nie zobaczy, że psychodietetyk
prosi o możliwość prowadzenia go**. Zaproszenie wisi, pacjent o niczym nie wie, a specjalista
widzi go na liście „jeszcze nie odpowiedzieli" bez żadnego wyjaśnienia.

`KONTA.md` §5 obiecuje co innego: „Decyduje pacjent — kartę z zaproszeniem widzi na swojej
stronie głównej".

**Odtworzenie:**
1. Specjalista: `POST /api/specialist/patients/` z `{"patient_email": "<pacjent>", "module": "diet"}`.
2. Pacjent: zaloguj się, wybierz kafelek **Dietetyka i psychodietetyka**.
3. `/diet` — karty zaproszenia nie ma.
4. Wejdź ręcznie na `/home` — karta jest, poprawna i kompletna.

**Uwaga:** sama karta jest zrobiona wzorowo — nazywa moduł, mówi o granicy wglądu i uprzedza,
że opieki nie da się później samemu wycofać. Problem jest wyłącznie w tym, gdzie się ją wiesza.

**Naprawa:** dodać `<SpecialistInvitationCard />` do `DietHome.tsx`. Komponent nie filtruje
po module (pokazuje każde oczekujące zaproszenie), więc nie wymaga zmian.

---

### 2. `KONTA.md` opisuje regułę nawodnienia, którą kod odwrócił

**Waga:** średnia — dokument wprowadza w błąd i zaprasza do „naprawienia" działającego kodu.

`markdown/KONTA.md` §4 nadal pisze: „Napoje inne niż woda są zapisywane, ale **nie są
przeliczane na wodę** — o tym decyduje specjalista, nie aplikacja."

Kod mówi odwrotnie i mówi to świadomie. Nagłówek `backend/core/hydration.py` (wiersze 16–30):
każdy napój liczy się 1:1, decyzja produktowa z **17 września 2026**, wprost opisana jako
odwrócenie §08 makiet — z notatką, że stara reguła „jest zapisana w wystarczająco wielu
miejscach, że ktoś ją przeczyta i to z powrotem »naprawi«". `KONTA.md` jest właśnie takim
miejscem.

**Potwierdzenie na danych:** konto `zuzia.dieta@mediculus.test`, 17.09 — woda 1150 ml,
napoje pozostałe 1250 ml, razem 2400 ml. Ekran pokazuje **9,6 z 6 szklanek**, czyli pełne
2400 ml, nie samą wodę.

**Naprawa:** poprawić akapit w `KONTA.md` §4 (i sprawdzić `markdown/PODSUMOWANIE.md` pod tym
samym kątem).

---

### 3. „1 dni z rzędu" — brak odmiany na stronie głównej modułu

**Waga:** średnia — widzi to **każdy** użytkownik pierwszego dnia korzystania z aplikacji.

`pages/DietHome.tsx:435` ma napis wpisany na sztywno:

```tsx
<span className="diet-streak-label">dni z rzędu</span>
```

Przy serii równej 1 daje to „1 dni z rzędu".

Projekt ma już na to gotowe narzędzie — `pluralDays()` w `utils/reports.ts:29`, które zwraca
„dzień" dla 1 — i **używa go** w panelu rodzica (`components/GuardianChildren.tsx:126`).
Strona główna modułu po prostu po nie nie sięga. Ten sam brak jest w module
psychoterapeutycznym (`pages/Home.tsx:297`) i w profilu (`pages/Profile.tsx:136`).

**Odtworzenie:** zaloguj się na konto z dokładnie jednym dniem serii (np. `test@wp.pl`),
wejdź na `/diet` — pod licznikiem widnieje „1 dni z rzędu".

**Naprawa:** `{pluralDays(day.streakDays)} z rzędu` w trzech wymienionych miejscach.

**Do rozważenia przy okazji:** panel rodzica chowa licznik serii, gdy wynosi 0 (`showsStreak`),
a `/diet` pokazuje „0 dni z rzędu". Dwa ekrany mówią o tej samej liczbie inaczej.

---

### 4. „9,6 szklanek" zamiast „9,6 szklanki"

**Waga:** drobna, ale widoczna na dwóch ekranach naraz.

`utils/drinks.ts:64`:

```ts
export function pluralGlasses(glasses: number): string {
  if (!Number.isInteger(glasses)) return 'szklanek'
```

Przy ułamku dziesiętnym polszczyzna stawia rzeczownik w dopełniaczu **liczby pojedynczej**:
„9,6 szklank**i**", „2,5 szklank**i**", „0,5 litr**a**". Komentarz nad funkcją powołuje się
na „1,5 litra" — a więc dokładnie na formę liczby pojedynczej — po czym zwraca formę mnogą.

**Odtworzenie:** `/diet/hydration` na koncie z niecałkowitą liczbą szklanek — nagłówek
„9,6 / z 6 szklanek" i podpis wykresu „czwartek, 17 września: 9,6 szklanek".

**Naprawa:** `if (!Number.isInteger(glasses)) return 'szklanki'`.

---

### 5. Docstring opisuje odmowę, której kod już nie wykonuje

**Waga:** drobna — sam kod jest poprawny, myli tylko opis.

`backend/core/hydration.py`, docstring `HydrationEntrySerializer` (ok. wiersza 95):

> „The one name it refuses is water's own, because this form asks for no amount and water is
> meaningless without one"

Kod tego nie robi. Dwadzieścia wierszy niżej, w komentarzu pod `validate_drink`, stoi
odwrotne i aktualne zdanie: `DRINK_IS_WATER` zniknęło, bo „typing »woda« in the custom form
now records exactly what »+ Szklanka« records and there is nothing left to refuse".

**Potwierdzenie:** wpisanie „woda" w formularzu innego napoju zapisuje wodę 250 ml
(lista pokazuje ją jako „Szklanka"), bez żadnej odmowy. Zachowanie jest spójne
z `normalize_drink`, która składa nazwę na kanoniczną — tylko docstring został z poprzedniej
wersji.

---

### 6. „Nic nie jest wymagane — wystarczy nazwa"

**Waga:** drobna (redakcja).

Zdanie na ekranie suplementów przeczy samo sobie: skoro nazwa wystarczy, to jednak jest
wymagana — i faktycznie jest (bez niej przycisk „Dodaj do listy" pozostaje nieaktywny).
Intencja jest czytelna, ale sformułowana odwrotnie. Propozycja: „Poza nazwą nic nie jest
wymagane."

---

### 7. Pusty dzień dzienniczka nie mówi, którego dnia dotyczy

**Waga:** drobna.

`/diet/journals/2026-09-13` (dzień bez posiłków) pokazuje nagłówek „Dzienniczek dnia" i treść
„Pusty dzień — na ten dzień nie ma zapisanych posiłków". Dzień z wpisami pokazuje w nagłówku
datę słownie („wtorek, 15 września"). W stanie pustym data znika, więc po wejściu z listy lub
z zakładki nie widać, o który dzień chodzi.

---

### 8. Błędna data w URL wygląda jak dzień bez wpisów

**Waga:** drobna.

`GET /api/diet/days/2026-13-45/` i `GET /api/diet/days/abc/` zwracają to samo co dzień bez
posiłków: `404 {"detail":"Nie znaleziono."}`. Front renderuje wtedy „Pusty dzień", więc
literówka w adresie czyta się jako „tego dnia nic nie zapisałeś".

To krewny reguły z `CLAUDE.md` §4 („odróżniaj 404/pusto od błędu sieci") — tu chodzi
o odróżnienie pustego dnia od dnia, który nie istnieje. Ryzyko jest niewielkie, bo do tego
ekranu wchodzi się z listy, a nie z ręki.

---

### 9. „Dodaj do listy" jest `disabled` bez wyjaśnienia

**Waga:** drobna (dostępność).

Przycisk zapisu w formularzu suplementu ma atrybut `disabled`, dopóki nazwa jest pusta.
Nie ma przy tym żadnego komunikatu ani `aria-invalid` na polu nazwy, więc osoba korzystająca
z czytnika ekranu przycisku po prostu nie usłyszy i nie dowie się, czego brakuje.

Warto to zestawić z komponentem `Stepper`, który w tym samym projekcie rozwiązuje ten problem
wzorowo i ma na ten temat komentarz w kodzie: przy granicy używa `aria-disabled`, nie
`disabled`, dzięki czemu przycisk zostaje w kolejności fokusa i jest ogłaszany
(`components/Stepper.tsx:74-79`, `components/stepper.css:57-63`).

---

## 3. Co przeszło — lista przypadków

### 3.1 Pacjent — dzienniczek i posiłki

| Przypadek | Wynik |
|---|---|
| `/diet` z danymi: seria, dzisiejsze posiłki, kafelek nawodnienia | OK |
| `/diet` bez danych: „Jeszcze pusty" + zachęta bez presji | OK |
| Dodanie posiłku: rodzaj, godzina (domyślnie bieżąca), opis, emocje | OK |
| Zapis posiłku bez żadnego pola (nic nie jest wymagane) | OK |
| **Emocja zaznaczona bez ruszania suwaka → `intensity` = NULL w bazie** | **OK** |
| Emocja z suwakiem → wartość zapisana | OK |
| UI odróżnia „nie podano" od „0/10" na formularzu i w kartach | OK |
| **Edycja posiłku: NULL przeżywa round-trip odczyt → zapis** | **OK** |
| Usunięcie posiłku z potwierdzeniem inline (bez natywnego `confirm`) | OK |
| Posiłek bez rodzaju i posiłek bez godziny renderują się poprawnie | OK |
| `/diet/journals`: 20 dni, paginacja 7/stronę, 3 strony | OK |
| `/diet/journals/:date` dzień archiwalny: „Tylko odczyt", brak przycisków | OK |
| **Serwer odrzuca `PUT` i `DELETE` na posiłku z wcześniejszego dnia (403)** | **OK** |

### 3.2 Pacjent — nawodnienie

| Przypadek | Wynik |
|---|---|
| Szklanka 250 ml, butelka 500 ml, własna ilość 333 ml | OK |
| Napój bez podanej ilości → 250 ml (`DEFAULT_SERVING_ML`) | OK |
| Usunięcie wpisu, licznik wraca do poprzedniej wartości | OK |
| Własny napój (free text), `maxLength` 40 = `MAX_DRINK_NAME` | OK |
| „woda" w formularzu innego napoju → składa się na kanoniczną „Woda" | OK |
| `min`/`max` pola = 10/2000 = `MIN/MAX_AMOUNT_ML` | OK |
| Walidacja serwera: 5, 0, −250, 2001, „abc", sama spacja — wszystkie 400 po polsku | OK |
| **Limit 40 porcji na dobę: 41. odrzucona z czytelnym komunikatem** | **OK** |
| Wykres 7 dni, etykiety dni tygodnia, paginacja wpisów 7/stronę | OK |

### 3.3 Pacjent — suplementy, aktywność, sen

| Przypadek | Wynik |
|---|---|
| Lista suplementów, dawka, częstotliwość, zakres dat, godziny | OK |
| Odhaczenie i cofnięcie odhaczenia | OK |
| Dodanie i usunięcie pozycji (potwierdzenie nazywa pozycję wprost) | OK |
| `aria-labelledby` checkboxów wskazuje nazwę suplementu | OK |
| Aktywność: chipy, stepper 5 min, samopoczucie — nic nie zaznaczone domyślnie | OK |
| Stepper: granica dolna 5 min, `aria-disabled` + wygaszenie zamiast `disabled` | OK |
| **Sen przez północ: 23:20→06:45 = 7 h 25 min; 07:00→06:00 = 23 h; 23:59→00:01 = 2 min** | **OK** |
| Sen, obie godziny równe → nie liczy i mówi dlaczego, wpis nadal zapisywalny | OK |

### 3.4 Pacjent — raporty, analiza, techniki, profil

| Przypadek | Wynik |
|---|---|
| Tydzień dietetyczny liczony od pierwszego wpisu, nie od poniedziałku | OK |
| Zuzia: kotwica piątek (`diet_week_start` 28.08); Kacper: środa — per pacjent | OK |
| Bieżący, niedomknięty tydzień nie ma raportu (`404` na liście i na PDF) | OK |
| **Agregaty raportu 4–10.09 zgodne z bazą co do jednej liczby** (11 posiłków z emocją; Spokój 4 śr. 6,0; Radość 3 śr. 6,0; Stres 2 śr. 7,5; Poczucie winy 1 śr. 6,0; Smutek 1 śr. 4,0; 7 dni z wpisem) | **OK** |
| Emocja bez oceny w raporcie: „Natężenie nie zostało ocenione", bez średniej | OK |
| Tabela pór posiłków: kolumna „Noc" i „Bez godziny" obsłużone | OK |
| PDF: 47 KB, `%PDF-1.4`, `application/pdf`, **polskie znaki poprawne** | OK |
| PDF dla nieistniejącego i niedomkniętego tygodnia → 404 | OK |
| **Analiza: tabela krzyżowa emocja × rodzaj posiłku zgodna z bazą co do jednej liczby** | **OK** |
| Analiza odróżnia „0" od „—" (rodzaj posiłku, którego w ogóle nie było) | OK |
| Techniki psychodietetyczne: 9 pozycji, uczciwie oznaczone jako miejsca na treść fundacji | OK |
| Nieistniejąca technika → „Nie znaleziono takiej techniki" | OK |
| Profil: wiek liczony z daty urodzenia, dane zdrowotne, jednostki chorobowe | OK |
| Profil: wzrost „0" zapisuje się jako NULL, nie jako 0 | OK |
| Stany puste: `/diet`, `/diet/journals`, `/diet/reports`, `/diet/analysis`, `/diet/hydration`, `/diet/supplements` | OK |

### 3.5 Rodzic / opiekun

| Przypadek | Wynik |
|---|---|
| Panel rodzica: dwa moduły osobno, liczby niesumowane | OK |
| Dietetyka: 53 posiłki, 4 dni z rzędu, „dzisiaj" — zgodne z bazą | OK |
| Zdanie o granicy wglądu obecne na karcie | OK |
| **`GET /api/guardian/children/` zwraca wyłącznie liczniki — zero opisów, rodzajów posiłków i emocji** | **OK** |
| **Rodzic na `/api/diet/*` (today, meals, hydration, reports, profile) → 403** | **OK** |
| Rodzic na endpointach specjalisty, także dla własnego dziecka → 403 | OK |
| `needs_attention` dotyczy tylko psychoterapii — dietetyka nie ma odpowiednika | OK |

### 3.6 Specjalista — macierz uprawnień

Pacjentka `zuzia.dieta` ma **dwóch** specjalistów: psychodietetyczkę (`module=diet`)
i psychoterapeutę (`module=psychotherapy`). To najlepszy możliwy przypadek testowy.

| Kto | Raporty dietetyczne | Raporty psychoterapeutyczne |
|---|---|---|
| `dieta.test` (psychodietetyk, `diet`) | **200 + PDF** | **404** |
| `marek.dieta` (psychoterapeuta, `psychotherapy`) | **404** | **200** |
| `specjalista@test.pl` (obcy) | 404 | 404 |
| pacjentka na endpointach specjalisty | 403 | 403 |

Izolacja modułowa jest **pełna i symetryczna**: powiązanie niesie moduł i uprawnia wyłącznie
do niego. Odmowy mówią „Nie znaleziono takiego pacjenta", nie ujawniając, czy pacjent istnieje.

| Przypadek | Wynik |
|---|---|
| Panel: pacjent z etykietą modułu i licznikami dietetycznymi | OK |
| **Raport specjalisty identyczny z raportem pacjentki — 29 886 B, `diff` pusty** | **OK** |
| PDF raportu pacjenta z panelu specjalisty | OK |
| Karty raportów to `<button>` — dostępne z klawiatury | OK |
| Zaproszenie z wyborem modułu; własny adres i adres nieistniejący odrzucone poprawnie | OK |
| Ponowne zaproszenie tego samego adresu nic nie psuje | OK |
| Przyjęcie zaproszenia → specjalista natychmiast widzi pacjenta | OK |
| Pacjent bez wpisów → `200 []` (odróżnione od braku dostępu) | OK |
| **Zakończenie opieki → dostęp znika natychmiast (404), pacjent znika z listy** | **OK** |
| Specjalista na pacjenckich `/api/diet/*` → 403 z komunikatem per ekran | OK |

### 3.7 Bramki dostępu (RODO)

| Przypadek | Wynik |
|---|---|
| **Małoletni bez zatwierdzonego opiekuna — wszystkie 8 endpointów dietetycznych → 403** (today, meals, hydration, reports, profile, supplements, activity, sleep) | **OK** |
| Bramka opiekuna działa również na zapisie (`POST` posiłku i nawodnienia) | OK |
| **Konto bez zgód — odczyt i zapis dietetyczny → 403** | **OK** |
| **Wycofanie zgody przez pacjentkę odcina specjalistę natychmiast** (403 z wyjaśnieniem „Nic nie zostało usunięte — wrócą…") | **OK** |
| Po wycofaniu zgody: `consents_active: false`, `activity: null` u specjalisty **i** `diet_activity: null` u rodzica | OK |

---

## 4. Uwagi bez rangi błędu

- **PDF podpisuje pacjenta adresem e-mail** („Pacjent: zuzia.dieta@mediculus.test"). Oba
  generatory robią to tak samo (`diet_report_pdf.py:264`, `report_pdf.py:288`) i oba mają na
  to komentarz, więc to decyzja, nie przeoczenie. Warto ją jednak kiedyś przemyśleć: dokument
  drukowany w gabinecie zwykle nosi imię i nazwisko, a e-mail jest daną logowania.
- **`GET /api/diet/reports/` zwraca pełną treść wszystkich raportów** — dni, posiłki, opisy
  i emocje — choć lista pokazuje tylko zakres dat i liczbę dni. Dla konta z 17 raportami to
  spory transfer przy każdym wejściu na ekran. Nie jest to błąd; przy większej liczbie
  tygodni może stać się odczuwalny.
- **Profil dietetyczny pisze „Specjalista — Osoba, która prowadzi Twoje konto"** w liczbie
  pojedynczej, choć pacjent może mieć dwóch (po jednym na moduł). Ekran pokazuje właściwego,
  psychodietetyka; chodzi wyłącznie o brzmienie podpisu.
- `markdown/KONTA.md` §5 pisze „Jeden pacjent może mieć dziś **jednego specjalistę**".
  Migracja 0022 i dane testowe pokazują, że to już nieprawda — powiązania są per moduł.
  To ten sam rodzaj rozjazdu co usterka 2.

---

## 5. Jak to było testowane

**Konta** (hasła zresetowane do `Haslo123!` na czas testów — lokalna baza):

| Konto | Rola |
|---|---|
| `zuzia.dieta@mediculus.test` | pacjentka małoletnia, opiekun zatwierdzony, 53 posiłki i 50 wpisów nawodnienia od 28.08 |
| `mama.zuzi@mediculus.test` | opiekunka Zuzi |
| `dieta.test@mediculus.test` | psychodietetyczka Zuzi (`module=diet`) |
| `marek.dieta@mediculus.test` | psychoterapeuta Zuzi (`module=psychotherapy`) |
| `test@wp.pl` | pacjent dorosły z 17 raportami dietetycznymi |
| `dusza2003@protonmail.com` | pacjent bez danych — stany puste |
| `maly@wp.pl` | małoletni bez zatwierdzonego opiekuna — bramka opiekuna |
| `jan.wisniewski@example.com` | konto bez zgód — bramka zgód |
| `specjalista@test.pl` | specjalista obcy — testy negatywne |

**Dane po testach przywrócone do stanu wyjściowego:** posiłek testowy usunięty (53 posiłki),
40 wpisów nawodnienia z testu limitu usunięte, aktywność testowa usunięta, wycofane na próbę
zgody Zuzi przywrócone z oryginalnymi znacznikami czasu, wzrost w profilu przywrócony (152),
powiązanie założone na potrzeby testu zakończenia opieki rozwiązane. Jedyna trwała zmiana to
zresetowane hasła kont testowych.

**Czego nie testowano:** rejestracji nowych kont i kodów opiekuna (poza zakresem dietetyki),
zachowania przy zerwaniu połączenia z siecią w trakcie zapisu, wyglądu na szerokościach
telefonu.

---

## 6. Naprawy

Wszystkie dziewięć usterek naprawiono 17 września 2026, w tej samej gałęzi.

### Co zostało zmienione

| # | Plik | Zmiana |
|---|---|---|
| 1 | `pages/DietHome.tsx` | `<SpecialistInvitationCard />` nad powitaniem, tam gdzie stoi w `Home.tsx` |
| 3 | `pages/DietHome.tsx`, `pages/Home.tsx`, `pages/Profile.tsx` | etykieta serii przez `pluralDays()`; w profilu przy okazji `entriesNoun()` na liczniku wpisów, który miał ten sam brak („3 wpisów") |
| 4 | `utils/drinks.ts` | `pluralGlasses` zwraca dla ułamka dopełniacz **l.poj.** („9,6 szklanki”); komentarz mówił to od początku |
| 6 | `pages/DietSupplements.tsx` | „Poza nazwą nic nie jest wymagane." |
| 7, 8 | `pages/DietJournalDay.tsx`, `utils/days.ts` | nowy `isValidIsoDate()`; nagłówek nazywa dzień także wtedy, gdy jest pusty, a adres, który nie jest datą, dostaje własny komunikat („Nieznany dzień”) zamiast „Pusty dzień” |
| 9 | `pages/DietSupplements.tsx`, `dietSupplements.css` | `aria-disabled` zamiast `disabled` przy braku nazwy, `aria-describedby` na zdanie „Wpisz nazwę, żeby zapisać pozycję”; `disabled` zostaje na czas zapisu |
| 5 | `core/hydration.py` | akapit docstringa doprowadzony do tego, co kod robi (jedyna zmiana w backendzie — opis, nie zachowanie) |
| 2 | `markdown/KONTA.md` | §4 opisuje regułę obowiązującą, ze wzmianką o dacie zmiany; §5 i §7 poprawione tam, gdzie mówiły o „jednym specjaliście" — powiązania są per moduł |

Usterka 8 okazała się mniejsza, niż zapowiadał opis: nie trzeba było ruszać serwera. Ten
sam 404 wystarczy, bo datę, która nie jest datą, front rozpoznaje sam — `isValidIsoDate`
parsuje ją i wypisuje z powrotem, a `2026-13-45` wraca jako inny napis, bo `Date` przewinął
ją na 2027.

### Czym to przykryte

Testy dopisane razem z naprawami, po jednym na usterkę, którą da się złamać po cichu:

- `DietHome.test.tsx` — seria 1 mówi „dzień z rzędu” i nie mówi „dni”; ekran odpytuje
  o zaproszenia (czyli karta na nim jest);
- `days.test.ts` — `isValidIsoDate` przyjmuje 29 lutego roku przestępnego i odrzuca
  `2026-13-45`, `2026-02-30`, `2025-02-29` oraz datę bez wiodącego zera;
- `DietJournalDay.test.tsx` — pusty dzień nazywa siebie w nagłówku; zły adres mówi „Nieznany
  dzień”, nie „Pusty dzień”, nie zmyśla daty i nadal prowadzi z powrotem do listy;
- `DietSupplements.test.tsx` — przycisk jest `aria-disabled`, a **nie** `disabled`, da się
  na niego wejść tabem, naciśnięcie go nic nie zapisuje, a komunikat znika po wpisaniu nazwy;
- `drinks.test.ts` — ułamek to „szklanki” (test, który wcześniej utrwalał błąd, teraz opisuje
  regułę i mówi dlaczego).

Do `DietHome.test.tsx` doszedł też stub `api/specialist`: karta robi własne zapytanie
i niezastubowana rysuje swój alert w środku asercji o tym, że ekran milczy przy błędzie.

### Dziesiąta usterka, znaleziona przy okazji

Pełny przebieg testów backendu wywrócił jeden test, **niezwiązany z tymi dziewięcioma**:
`test_seed_demo_diary.DietHalfTests.test_the_other_drinks_are_recorded_with_no_amount`
— `AssertionError: 250 is not None`.

To ten sam wzorzec co usterki 2 i 5, tylko że tym razem na czerwono. Odwrócenie reguły
nawodnienia objęło komendę seedującą (`seed_demo_diary.py` nadaje teraz innym napojom
`DEFAULT_SERVING_ML`, z obszernym uzasadnieniem w komentarzu), ale test, który utrwalał
`amount_ml = None`, został nietknięty. Stara reguła przetrwała w asercji.

Kierunek naprawy był jednoznaczny — seed jest zmieniony świadomie i udokumentowany, więc
poprawiony został test: nazwa mówi teraz o rozmiarze porcji, a asercja pilnuje, że seed
zapisuje dokładnie to, co `add_entry` zapisałoby dla chipa dotkniętego bez podanej ilości.
Dzięki temu dane demonstracyjne pozostają takie, jakie aplikacja sama umie wytworzyć.

### Wynik

```
frontend:  113 plików, 2217 testów — wszystkie przechodzą
tsc --noEmit: bez błędów
backend:   1599 testów — wszystkie przechodzą (4 pominięte)
```

`test_drinks.py` jest tu wart wymienienia osobno: czyta `frontend/src/utils/drinks.ts` i pilnuje
zgodności słownika napojów między Pythonem a TypeScriptem, więc to on potwierdza, że zmiana
w `pluralGlasses` niczego nie rozjechała.

Naprawy sprawdzone także w działającej aplikacji: karta zaproszenia pojawia się na `/diet`
i przyjęcie z niej działa („Dorota Dietetyczka może teraz czytać Twoje raporty…”), licznik
pokazuje „1 dzień z rzędu”, nawodnienie „3,6 szklanki”, pusty dzień „czwartek, 1 stycznia”,
a `/diet/journals/2026-13-45` — „Nieznany dzień”. Dane po weryfikacji posprzątane.

---

## 7. Zegar 24-godzinny

Osobne zadanie, wykonane po naprawach: doprowadzenie do tego, żeby **nigdzie w aplikacji
nie pojawiało się „am" ani „pm"**. Przegląd wykazał trzy warstwy, z czego problem był
tylko w jednej.

### Backend — był już czysty

Każda godzina wychodzi z serwera jako napis zbudowany przez `strftime('%H:%M')`:
`core/meals.py`, `core/activity.py`, `core/sleep.py`, `core/supplements.py`. Nigdzie nie ma
`%I` ani `%p`. Oba generatory PDF biorą gotowy napis, więc dokumenty też były poprawne.

### Formatowanie w przeglądarce — dwa miejsca, teraz jedna definicja

Tylko dwa ekrany formatowały czas same: godzina wpisu nawodnienia i godzina zapisania wpisu
w dzienniczku psychoterapeutycznym. Oba używały `toLocaleTimeString('pl-PL', …)`, co w
praktyce daje 24h — ale nigdzie nie było powiedziane, że *ma* dawać.

Powstał `utils/clock.ts` z jedną funkcją `clockTime()`, używaną w obu miejscach. Prosi
o `hourCycle: 'h23'`, a nie o `hour12: false`, i to nie jest drobiazg: `hour12: false`
w części silników wybiera cykl h24, w którym północ zapisuje się jako **24:00**, a pół
godziny po niej jako 24:30. Aplikacja pokazuje posiłki jedzone późno w nocy, więc to realna
różnica. `h23` daje 00:00–23:59.

### Pola formularzy — tu był prawdziwy problem

`<input type="time">` renderuje **przeglądarka, według swojego locale, nie locale strony**.
Na Chrome ustawionym na angielski pole pokazuje „02:46 PM", a `<html lang="pl">` tego nie
zmienia — sprawdzone zrzutem ekranu, dwa pola obok siebie z `lang="pl"` i `lang="en-US"`
wyglądały identycznie, oba z „PM".

Dotyczyło to czterech pól: godzina posiłku, godzina suplementu, zaśnięcie i przebudzenie.
Wartość zapisywana zawsze była 24-godzinna, więc dane i raporty były poprawne — AM/PM
widziała tylko osoba wpisująca.

Zastąpił je `components/TimeField.tsx`: pole tekstowe z maską HH:MM, `inputMode="numeric"`
i walidacją 00:00–23:59. Kontrakt wartości jest ten sam co natywnego pola (`'HH:MM'` albo
`''`), więc wszystkie cztery ekrany przyjęły je bez zmian w logice.

Co to kosztuje, powiedziane wprost: **nie ma już natywnego zegarka-pickera**. Na telefonie
zostaje klawiatura numeryczna. To jest cena gwarancji 24h i decyzja świadoma, a nie
przeoczenie.

Trzy zachowania warte odnotowania:

- **cyfra 3 lub większa na początku otwiera godzinę jednocyfrową** — wpisanie `9` daje od
  razu `09:`, tak jak robiło to pole natywne;
- **Backspace kasuje po jednej cyfrze, aż do pustego pola.** Pierwsza wersja dokładała
  dwukropek po każdym kasowaniu, przez co `14:` przeżywało dowolną liczbę Backspace'ów
  i godziny nie dało się wyczyścić z klawiatury. Złapał to test, zanim cokolwiek pojechało
  dalej; rozwiązaniem jest `inputType` ze zdarzenia, a nie porównywanie długości ze stanem
  Reacta, który przy szybkim pisaniu bywa o jeden render do tyłu;
- **błędna godzina zostaje na ekranie**, oznaczona i wyjaśniona, zamiast być po cichu
  skasowana albo poprawiona — ta sama reguła, którą reszta aplikacji stosuje do wartości,
  których nikt nie wybrał.

### Sprawdzone

`TimeField.test.tsx` (15 testów) i `clock.test.ts` (6) pinują regułę, w tym to, że przez całą
dobę nie pada „am" ani „pm" i że północ to `00:00`, nie `24:00`.

W działającej aplikacji, **na przeglądarce z locale `en-US`** — czyli w warunkach, w których
stary komponent pokazywał „02:46 PM":

| Sprawdzone | Wynik |
|---|---|
| pole godziny posiłku | `15:03`, `type="text"`, `inputMode="numeric"` |
| wpisywanie `9` → `093` → `0930` | `09:` → `09:3` → `09:30` |
| godzina `25:70` | zostaje na ekranie, `aria-invalid`, komunikat o zakresie 00:00–23:59 |
| powrót do `14:30` | komunikat znika, `aria-invalid="false"` |
| zapis posiłku end-to-end | w bazie `eaten_at = 14:30:00` |
| sen `23:20` → `06:45` | `7 h 25 min` — przejście przez północ nadal liczone poprawnie |
| godzina suplementu `2100` | `21:00` |
| `input[type="time"]` w całym `src/` | brak |
