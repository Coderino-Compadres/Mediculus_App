# Rodzaje kont w Mediculusie

**Stan na:** 9 września 2026 · **Źródło:** kod (`backend/core/`, `frontend/src/`), nie makiety

Dokument opisuje, **jakie konta istnieją, skąd się biorą, kto może utworzyć jakie
i do czego każde z nich ma dostęp**. Wszystko poniżej jest odczytane z kodu — jeśli
kod się zmieni, ten plik trzeba poprawić razem z nim. Miejsca, w których decyzja
jest świadoma (a nie brakiem funkcji), są zaznaczone, bo to właśnie one bywają
„naprawiane” przez pomyłkę.

---

## 1. Cztery rodzaje kont — i piąte, które kontem nie jest

W `user_db` istnieją **dwa niezależne pojęcia użytkownika** i nie wolno ich mieszać:

| | |
|---|---|
| `core.User` (tabela `"user"`) | Konto domenowe, czyli to, o czym jest ten dokument. Logowanie przez `/api/auth/login/`, sesja trzyma `core_user_id`. |
| `auth_user` (Django) | Wyłącznie login do `/admin/`. Tworzone przez `createsuperuser`, **niepowiązane** z kontem domenowym. |

Konta domenowe rozpoznaje się nie po roli, a po **istnieniu wiersza w tabeli
pobocznej** — rola (`user_role.role`) jest napisem seedowanym z SQL-a i służy do
wyświetlania, nie do autoryzacji:

| Rodzaj konta | Rola | Wiersz poboczny | `id_medical` | Rozpoznawany przez |
|---|---|---|---|---|
| **Pacjent dorosły** | `patient` | `patient` (`is_child = FALSE`) | tak | `_require_patient` / `is_patient` |
| **Pacjent małoletni** | `patient` | `patient` (`is_child = TRUE`) | tak | jak wyżej + bramka opiekuna |
| **Opiekun (rodzic)** | `rodzic` | **żaden** | **nie** | `isGuardian` (rola) |
| **Specjalista** | `specjalista` | `specjalist` | **nie** | `_require_specialist` / `is_specialist` |

Dlaczego opiekun i specjalista nie mają `id_medical`: nie są podmiotami danych
klinicznych, więc **nic w `medical_db` nie może się do nich odwołać**. To nie
oszczędność, tylko granica pseudonimizacji — dzienniczek, raporty i nawodnienie
istnieją tylko dla kont pacjenckich.

Rodzaj konta pacjenta (`is_child`) **bierze się z wyboru w formularzu**, a nie
z daty urodzenia — ale `_check_age_matches_account_type` odrzuca dwie kombinacje,
w których te dwa źródła by sobie przeczyły (dorosła data przy `minor_patient`,
data małoletniego przy `patient`). Granica pełnoletności to `ADULT_AGE = 18`
w `core/serializers.py` — **decyzja polityczna, nie fakt**: RODO art. 8 mówi
o 16 latach, więc może wymagać rewizji.

---

## 2. Skąd bierze się konto — macierz „kto tworzy kogo”

| Konto do utworzenia | Kto je tworzy | Gdzie / czym | Można od razu? |
|---|---|---|---|
| Pacjent dorosły | sam zainteresowany | `POST /api/auth/register/`, `account_type: 'patient'` | **tak, od razu i bez niczyjej zgody** |
| Pacjent małoletni | sam zainteresowany | `POST /api/auth/register/`, `account_type: 'minor_patient'` | konto powstaje od razu, ale **jest zablokowane** do akceptacji opiekuna |
| Opiekun (rodzic) | **specjalista** wydaje kod, rodzic go realizuje | `POST /api/specialist/parent-invitations/` → rejestracja z `invitation_code` | tak, i powstaje **od razu powiązane i zaakceptowane** |
| Specjalista | **inny specjalista** | `POST /api/specialist/colleagues/` | tak, ale konto trafia na dwa ekrany blokujące (zgody, potem hasło) |
| Pierwszy specjalista | **nikt w aplikacji** | `scripts/mock_data.sql` / jeden `INSERT` ręcznie | nie — patrz §6 |

Krótko: **formularz rejestracji jest jedyną drogą do konta pacjenta i jedyną
drogą do konta opiekuna — ale opiekun potrzebuje do niego kodu.** Bez kodu od
specjalisty rejestracja tworzy wyłącznie konto pacjenta (dorosłego albo
małoletniego). `ACCOUNT_TYPES` w `core/serializers.py` jest listą typów, jakie
ten formularz zna.

> **Uwaga: to jest reguła docelowa, a kod jeszcze jej nie wymusza.**
> `ACCOUNT_TYPES` nadal zawiera `parent` bez warunku posiadania kodu, więc
> `account_type: 'parent'` bez `invitation_code` **dziś przechodzi**. Domknięcie
> tego to wymóg `invitation_code` przy tym typie w `RegisterSerializer.validate()`
> plus test w `test_parent_invitation_api.py`. Do tego czasu jedyne, co dzieli
> dokument od kodu, to ten akapit.

### Czego formularz rejestracji NIE umie / nie ma umieć

**Nie ma typu `specialist`** i to jest właśnie zabezpieczenie, a nie brak.
Ręcznie sklejone `account_type: 'specialist'` daje 400 (`invalid_choice`), nie
konto. Powód nie dotyczy dostępu (sama rola nic nie daje — patrz §4), tylko
**twierdzenia, jakie takie konto stawia**: to deklaracja kwalifikacji, której
aplikacja nie potrafi sprawdzić, a którą potrafi potwierdzić inny specjalista.

**Nie ma samoobsługowego konta opiekuna.** Rodzic nie zakłada konta „z ulicy" —
konto opiekuna powstaje wyłącznie z kodu wydanego przez specjalistę (§5), i to
z tego samego powodu, dla którego konta specjalisty zakłada specjalista: konto
opiekuna stawia twierdzenie, którego aplikacja nie sprawdzi — że ta osoba jest
opiekunem prawnym tego dziecka. Potwierdzić to może ten, kto siedział z rodziną
w gabinecie. Skutkiem ubocznym jest to, że **konto opiekuna nigdy nie istnieje
„luzem"**: rodzi się przypisane do konkretnego dziecka i od razu zaakceptowane.

**Nie da się też przypisać sobie specjalisty.** `patient.id_specjalist` nie jest
polem formularza i nic nie może go zapisywać bezpośrednio — jedyną drogą jest
zaproszenie (§5). Gdyby ktoś dodawał tu nową funkcję: **to jest linia, której nie
wolno przekroczyć**.

---

## 3. Trzy bramki: co blokuje świeże konto

Konto może istnieć i **nie mieć jeszcze dostępu do niczego**. Bramki są trzy,
wszystkie wymuszane po stronie serwera, i mają ustaloną kolejność.

| Bramka | Kogo dotyczy | Gdzie w kodzie | Ekran | Wyjście |
|---|---|---|---|---|
| **Zgody RODO** | każdego konta, któremu brakuje którejś zgody | `HasActiveConsents` w `DEFAULT_PERMISSION_CLASSES` | `pages/ConsentsRequired.tsx` | udzielenie obu zgód |
| **Hasło** | tylko konta specjalisty założonego przez kolegę (`must_change_password`) | `HasOwnPassword` | `pages/PasswordChangeRequired.tsx` | ustawienie własnego hasła |
| **Opiekun** | tylko pacjenta małoletniego bez zaakceptowanego powiązania | `_require_patient(require_guardian_link=True)` | `pages/LinkGuardian.tsx` | akceptacja przez opiekuna |

**Kolejność zgody → hasło jest wymuszona, nie wybrana**: `POST /api/account/password/`
samo stoi za `HasActiveConsents`, więc konto odesłane najpierw na formularz hasła
dostałoby 403 na jedynym formularzu, którego może użyć. Kolejność jest zapisana
raz — w `gateRouteFor` (`App.tsx`) na froncie i w klasach uprawnień na backendzie.

**Wyjątki od bramek to nazwane stałe, nie rozpisane listy** — bo ustawienie
`permission_classes` na widoku **zastępuje domyślne w całości**, więc łatwo
wypaść z bramki przez nieuwagę:

- `CONSENT_EXEMPT` (wyjęte z **obu** bramek): `auth/me/`, `auth/logout/` oraz dwa
  endpointy zgód. `me/` musi być otwarte, bo z niego front dowiaduje się,
  *dlaczego* został odrzucony.
- `PASSWORD_CHANGE_EXEMPT`: dokładnie jeden widok — `POST /api/account/password/`,
  czyli droga wyjścia.
- Bramka opiekuna: `POST/DELETE /api/auth/guardian/` (bo tym dziecko o akceptację
  prosi) i trzy endpointy `/api/account/specialist-invitation/` (bo inaczej cała
  ścieżka z §5 zakleszcza się dla dokładnie tych dzieci, dla których istnieje).

Każda bramka ma test przeciągający **wszystkie** zarejestrowane URL-e z jednego
miejsca (`test_consent_gate.py`, `test_password_gate.py`, `test_guardian_gate.py`).
Nowy endpoint kliniczny dopisuje się do tych list.

---

## 4. Do czego każde konto ma dostęp

### Pacjent (dorosły albo małoletni po akceptacji)

Jedyne konto, które ma dane kliniczne. Ekrany: `/modules` (wybór modułu),
`/home`, `/journals`, `/reports`, `/analysis`, `/techniques`, `/safety-plan`,
`/profile`, oraz moduł dietetyczny — `/diet`, `/diet/journals`, `/diet/hydration`.
Menu: `PATIENT_ITEMS` albo `DIET_ITEMS` (wybierane **po adresie**, nie po roli —
jedno konto, dwa moduły).

Endpointy: cały dzienniczek (`/api/diary/…`), pulpit, analiza, raporty wraz z PDF,
nawodnienie, katalog technik, własny profil i hasło, zgody, odpowiedź na
zaproszenie specjalisty.

Zawsze **wyłącznie własne dane**: tożsamość bierze się z sesji, a jedyne URL-e
z identyfikatorem w ścieżce (`/api/diary/<uuid>/`, `/api/diet/hydration/<id>/`)
filtrują dodatkowo po `id_medical` — cudzy wiersz odpowiada **404**, tak samo jak
nieistniejący.

Czego pacjent **nie** może: zerwać powiązania ze specjalistą (to reguła klientki,
nie przeoczenie — patrz §5), edytować wpisu z przeszłości (edytowalny jest tylko
dzisiejszy), usunąć konta (endpoint jest zaślepką — otwarte pytanie prawne
o retencję dokumentacji).

### Opiekun (rodzic)

Nie ma wiersza `patient`, więc **wszystko za `_require_patient` odpowiada mu 403** —
i dlatego nie dostaje w menu wpisów, których i tak nie otworzy. Ekrany: `/parent`
i `/profile`. Menu: `GUARDIAN_ITEMS` (dwie pozycje).

Co widzi na `/parent`:

- **zaproszenia od dzieci** — `GET /api/guardian/invitations/` plus akceptacja
  i odmowa; to pierwszy ekran po zalogowaniu, bo dziecko jest zablokowane do
  momentu odpowiedzi;
- **listę powiązanych dzieci** — `GET /api/guardian/children/`, i tu jest twarda
  granica: **zaangażowanie, nigdy treść**. Liczba wpisów, seria, data ostatniego
  wpisu. Żadnego nastroju, emocji, napięcia, flagi zachowań ryzykownych,
  żadnych liczb z raportu, żadnego `id_medical`. Lista jest w
  `CHILD_SUMMARY_FIELDS` (`core/account.py`) i przeciągnięta testem, bo dodanie
  tu `avg_mood` wygląda jak ulepszenie. Powód jest kliniczny: małoletni, który
  wie, że rodzic czyta jego dzienniczek, pisze inny dzienniczek.
- resztę panelu zajmuje **placeholder** i celowo nie mówi, co opiekun będzie
  widział z danych dziecka — to jest nierozstrzygnięte i nie jest pytaniem o UI.

Profil działa mu w pełni (tożsamość, rejestr zgód, zmiana hasła) — to jedyna trasa
pacjencka z `allowGuardian`.

Czego opiekun **nie** może: cofnąć raz zaakceptowanego powiązania (funkcja
nieistniejąca), zobaczyć dzienniczka ani raportów dziecka, dowiedzieć się
o zaproszeniu inaczej niż logując się (w tym wdrożeniu **nie ma żadnej poczty**).

### Specjalista

Też nie ma wiersza `patient`, więc również dostaje 403 na wszystkim pacjenckim.
Ekrany: `/specialist` i jego podekrany, `/techniques` (bo do katalogu pisze
i widzenie tego, co widzi pacjent, jest sensem sprawy) oraz `/profile`.
Menu: `SPECIALIST_ITEMS`.

Cztery rzeczy w panelu:

1. **Kartoteka** — `GET /api/specialist/patients/`. **Dwie listy, nigdy jedna**:
   zaakceptowani i oczekujący osobnymi kluczami, żeby żaden ekran nie narysował
   oczekującego jako leczonego przez zapomnienie pola statusu. Payload to
   `PATIENT_SUMMARY_FIELDS`: imię, adres, `is_child`, data akceptacji i te same
   liczniki, jakie widzi sam pacjent — **bez `id_medical`** i bez czegokolwiek
   klinicznego. Treść jest jeden ekran dalej.
2. **Raporty pacjenta** — `/api/specialist/patients/<id>/reports/{,<week>/,<week>/pdf/}`,
   **te same dokumenty**, które widzi pacjent (`build_weekly_reports`,
   `components/ReportSections.tsx`), bo dwie osoby w gabinecie nie mogą trzymać
   różnych papierów. Różni się rama, a oznaczone dni **nie są linkami** na kopii
   specjalisty — dostęp do dzienniczka jest kwestią otwartą i link odpowiadałby
   na nią w markupie.
3. **Kody na konto opiekuna** — `/api/specialist/parent-invitations/` (§5).
4. **Konta kolegów i katalog technik** — `/api/specialist/colleagues/`,
   `/api/specialist/techniques/`.

**Bycie specjalistą samo nie autoryzuje niczego — to zdanie jest tu całym modelem
bezpieczeństwa.** `_require_specialist` jest decyzją o routingu, nie kontrolą
dostępu; tym, co stawia czyjeś raporty przed czyimiś oczami, jest **akceptacja
zaproszenia przez pacjenta**, sprawdzana na nowo przy każdym żądaniu z id pacjenta
(`assigned_patient`). Nie zmieniło się to, gdy konta specjalisty przestały być
samoobsługowe: podniesienie progu jest warte zachodu, ale nic się na nim nie
opiera — projekt, który by się opierał, byłby o jedno złe konto od raportów
wszystkich pacjentów.

Czego specjalista **nie** może: zajrzeć w dzienniczek ani ekrany analizy pacjenta
(panel mówi to wprost, `.specialist-scope`), zobaczyć kartoteki kolegi
(`COLLEAGUE_SUMMARY_FIELDS` to sama tożsamość zawodowa — pacjenci zgodzili się na
*niego*, nie na jego kolegów), poprawić techniki napisanej przez kogoś innego
(`author_id_specjalist` bramkuje `PUT`/`DELETE` — poprawianie czyjegoś tekstu
klinicznego to rozmowa, nie formularz), usunąć ani edytować konta kolegi (405 na
obu — to samo nieodpowiedziane pytanie prawne co przy usuwaniu konta pacjenta).

**Jeden specjalista na pacjenta** — `patient.id_specjalist` to pojedynczy FK. To
realne ograniczenie, nie decyzja: aplikacja ma dwa moduły, a reguła klientki mówi
o „specjalistach leczących pacjenta” w liczbie mnogiej, więc pacjent chodzący
i do psychoterapeuty, i do psychodietetyka jest dziś nie do wyrażenia.

---

## 5. Powiązania między kontami

Konto samo z siebie jest wyspą. Wszystkie trzy powiązania są **zaproszeniami
z dwoma krokami** i podział na „poproś” i „zaakceptuj” jest w każdym z nich sensem
konstrukcji.

### Dziecko → opiekun (dla konta, które już istnieje)

Ta ścieżka nie **tworzy** konta opiekuna — wskazuje istniejące. A skoro konto
opiekuna powstaje wyłącznie z kodu specjalisty i od razu z jednym powiązaniem,
zostaje jej jeden realny przypadek: **drugie i kolejne dziecko tego samego
rodzica**, oraz dziecko, którego rodzic ma konto założone przy innym
specjaliście.

1. `POST /api/auth/guardian/` — dziecko wskazuje opiekuna adresem e-mail. Tworzy
   `parent_child` z `accepted_at = NULL`; dziecko dalej jest zablokowane.
   Adres **musi należeć do konta z rolą `rodzic`**; adres pacjenta, specjalisty,
   konta bez roli i adres niezarejestrowany dostają **tę samą** odmowę —
   rozróżnienie zamieniłoby formularz w sposób pytania, kto tu ma konto i jakie.
   Własny adres dziecka to jedyny wyjątek (to pomyłka, na którą da się zareagować).
   Jedno zaproszenie naraz, ponowienie tego samego jest idempotentne.
2. `DELETE /api/auth/guardian/` — dziecko **wycofuje zaproszenie oczekujące** (żeby
   literówka w adresie nie była ślepą uliczką). Po akceptacji odmawia: cofnięcie
   powiązania nie jest decyzją dziecka, bo inaczej nadzór trwałby dokładnie tyle,
   ile dziecko pozwoli.
3. `POST /api/guardian/invitations/<uuid>/accept/` albo `.../reject/` — opiekun
   odpowiada. Filtrowane po `parent=request.user`, więc cudze zaproszenie
   odpowiada jak nieistniejące (404, nie 403). Akceptacja jest idempotentna,
   a **odmowa usuwa wiersz** — dziecko wraca do wskazywania kogoś innego, zamiast
   zostać z „nie”, na które nikt nie może zareagować.

`accepted_at` jest znacznikiem czasu, nie boolem — RODO art. 7(1) kładzie ciężar
dowodu na nas, a „tak” bez daty nic nie dowodzi.

### Specjalista → konto opiekuna (kod na kartce) — **jedyna droga do konta rodzica**

To tu konto opiekuna się rodzi, a nie tylko podłącza. Specjalista siedzi
z rodziną i jest jedyną stroną, która może potwierdzić, że te dwie osoby są
rodziną; a to wdrożenie **nie wysyła żadnej poczty** — więc zaproszenie
podróżuje jako kod podyktowany w gabinecie. Trzy własności są istotne:

- kod jest **przechowywany jako hash** (`make_password`), a jawny tekst istnieje
  tylko w odpowiedzi, która go utworzył — zgubiony kod się unieważnia i wydaje
  nowy, żaden endpoint go nie odczyta;
- jest **przypisany do jednego adresu** — rodzic musi zarejestrować się tym
  adresem, który wskazał specjalista;
- **wygasa** po `INVITATION_TTL_DAYS = 14`.

`CODE_ALPHABET` nie zawiera znaków mylonych na kartce (O/0, I/1/L, S/5, Z/2).
**Dziecko musi już być pacjentem tego specjalisty** — i właśnie dlatego endpointy
`/api/account/specialist-invitation/` są wyjęte z bramki opiekuna: bez tego cała
ścieżka zakleszcza się dla dzieci, dla których istnieje. Realizacja kodu dzieje
się **w transakcji rejestracji** (`RegisterSerializer._redeem`), więc hasło
odrzucone przez walidatory nie spala kodu, i tworzy `parent_child` **od razu
zaakceptowane** — to jedyne miejsce różniące się od ścieżki dziecka i nie jest
dziurą w bramce art. 8: opiekun akceptuje *tym, że kończy rejestrację* kodem
wręczonym mu osobiście, a specjalista dokłada jedyny fakt, którego aplikacja sama
nie sprawdzi — że te dwie osoby są rodziną. Wykorzystane zaproszenie jest
**oznaczane, nigdy usuwane**.

### Specjalista → pacjent

1. `POST /api/specialist/patients/` — specjalista wskazuje pacjenta adresem
   i ustawia `id_specjalist_pending`. Formularz odpowiada **jedno i to samo**
   niezależnie od przyczyny (nieznany adres, adres opiekuna, kolegi, pacjenta,
   który już ma specjalistę, pacjenta, o którego ktoś inny już pyta) — inaczej
   byłby sposobem pytania, kto tu ma konto i w jakiej jest opiece. Dwa wyjątki:
   własny adres oraz pacjent, który **już jest tego specjalisty** (`ALREADY_MINE`
   — widać go na liście wyżej, więc powiedzenie tego nic nie ujawnia).
   `SpecialistInviteThrottle` (60/h, tylko na POST) jest tym, co czyni wspólną
   odmowę wartą utrzymania — „odmowa” kontra „przyjęte” samo w sobie jest
   odpowiedzią, więc pytanie musi być ograniczone.
2. Pacjent odpowiada u siebie — `GET/POST /api/account/specialist-invitation/{,accept/,reject/}`,
   karta na `/home` **i na `/link-guardian`** (bo zablokowanego małoletniego
   `RequireAuth` odsyła z `/home`, więc bez tej drugiej karty zwolnienie z bramki
   byłoby zwolnieniem tylko z nazwy). Akceptacja przenosi id do `id_specjalist`
   i stempluje `specjalist_accepted_at`; **odmowa nie zapisuje nic** — tak samo
   jak przy `parent_child`.
3. `DELETE /api/specialist/patients/<id>/` — **tylko specjalista** kończy opiekę,
   i pyta dwa razy, bo pacjent tego nie cofnie. **Pacjent nie może odciąć
   specjalisty**: to reguła klientki, uzasadniona klinicznie (przy zaburzeniach
   odżywiania rośnie skłonność do ukrywania informacji, więc przełącznik po
   stronie pacjenta wyłączałby raporty dokładnie w tych przypadkach, dla których
   istnieją). `Reports.tsx` nosi TODO mówiące to wprost — **nie zamieniać tego
   z powrotem na opcję udostępniania.**

---

## 6. Pierwsze konto specjalisty: nie da się go zrobić w aplikacji

I to jest własność, nie luka. Utworzenie konta specjalisty wymaga wiersza
`specjalist`, a jedynym sposobem na wiersz `specjalist` jest wiersz `specjalist`.
Bootstrapem jest `scripts/mock_data.sql` — `anna.kowalska@example.com` /
`Haslo123!`, z prawdziwym hashem i **oboma zgodami nadanymi UPDATE-em**, właśnie
dlatego, że inaczej seed zostawiłby panel nieosiągalnym. Na prawdziwym wdrożeniu
jest to ten sam ruch: **jeden wiersz ręcznie**, a potem każde następne konto
z wnętrza aplikacji. Endpoint, który potrafiłby zrobić pierwsze konto zawodowe,
potrafiłby zrobić dziesiąte.

Konto zakładane w panelu (`POST /api/specialist/colleagues/`) ma cztery istotne
własności:

- **hasło jest generowane, pokazane raz i przechowywane jako hash** — nic go nie
  odczyta, nie ma też resetu hasła, więc konto z zgubionym hasłem trzeba założyć
  ponownie na innym adresie. `PASSWORD_ALPHABET` jest importowany z
  `CODE_ALPHABET`, nie skopiowany (16 znaków w czterech grupach, ~77 bitów);
- **musi zostać wymienione przy pierwszym logowaniu** (`must_change_password`) —
  właściciel tego hasła go nie wybrał, a co najmniej jedna inna osoba je zna,
  a panel otwiera się na dokumentację innych ludzi;
- **żadne zgody nie są nadawane, i to jest połowa nośna** — zgoda z art. 7 jest
  aktem osoby, której dane dotyczą, a to nie jest osoba wypełniająca formularz.
  Obie kolumny zostają NULL, `HasActiveConsents` odmawia nowemu kontu wszystkiego,
  a właściciel udziela zgód sam przy pierwszym logowaniu — czyli konto nie może
  niczego przeczytać, zanim jego właściciel na cokolwiek się zgodził;
- **lista kolegów to wszystkie konta specjalisty i sama tożsamość zawodowa** —
  nie jest filtrowana do tych, które sam utworzyłeś (nie ma kolumny, która by to
  zapisywała), bo jej faktycznym zadaniem jest niedopuszczenie do drugiego konta
  dla kogoś, kto już je ma. `consents_active` podróżuje, żeby ekran mógł
  powiedzieć „czeka na właściciela”, zamiast pokazywać wiersz wyglądający na
  zepsuty.

---

## 7. Limity zapytań per konto

Nie są dekoracją — bez nich wspólne, nieinformujące odmowy z §5 nie miałyby
sensu, bo samo „odmowa vs przyjęte” jest odpowiedzią.

| Scope | Limit | Na co |
|---|---|---|
| `login_account` | 15/h | próby na **jedno konto**, kluczowane HMAC-em z przesłanego adresu; od 10. porażki dolicza „Pozostało N prób…”. Trafne hasło zeruje licznik. |
| per-IP na `login/`, `register/` | 10/min | |
| `auth` (`GuardianLinkThrottle`) | 10/min per konto | `auth/guardian/` |
| `password_change` | 10/h per konto | `POST /api/account/password/` sprawdza **obecne** hasło, więc jest drugą wyrocznią do jego zgadywania |
| `specialist_invite` | 60/h per konto, **tylko POST** | dwa formularze, w których specjalista wskazuje kogoś adresem |
| `specialist_account` | 20/h per konto, **tylko POST** | sesja użyta do **bicia kont zawodowych** |
| `report_pdf` | 30/h per konto | limit przepustowości, nie bezpieczeństwa |

Liczniki idą do `DatabaseCache` w tabeli `throttle_cache` w `user_db`, a klucz
zawiera **HMAC-SHA256 adresu, nie adres** — cache jest tabelą obok danych
osobowych. Brak tej tabeli powoduje, że limity **przestają obowiązywać po cichu**,
dlatego `check_databases` jej pilnuje.

---

## 8. Czego nie ma dla żadnego konta

- **Poczty wychodzącej — w ogóle.** Stąd kody i hasła wręczane w gabinecie, brak
  resetu hasła, brak powiadomienia opiekuna o zaproszeniu, brak „PDF na maila”.
- **Usuwania konta** — zaślepka (`src/api/account.ts` odrzuca, zamiast udawać
  sukces), zablokowana pytaniem prawnym o retencję dokumentacji klinicznej.
  Wycofanie zgody **nie jest** usunięciem: blokuje konto i nic nie kasuje,
  a przywrócenie zgody oddaje dzienniczek w niezmienionym stanie.
- **Zmiany adresu e-mail** — to dwa endpointy, nie jeden, bo nowy adres trzeba
  potwierdzić wiadomością wysłaną *na niego*.
- **Eksportu danych** (art. 15/20) — dług po zdjęciu z ekranu.
- **Wylogowania pozostałych sesji** — nasze sesje noszą `core_user_id` i żadnego
  hasha hasła, więc zmiana hasła nic nie unieważnia; do wylogowania innych
  urządzeń potrzeba sposobu wyliczenia sesji konta, którego to wdrożenie nie ma.
- **Wielu specjalistów na pacjenta** — patrz koniec §4.
- **Cofnięcia zaakceptowanego powiązania opiekun–dziecko** przez opiekuna.

---

## 9. Gdzie to jest w kodzie

| Temat | Plik |
|---|---|
| Typy kont z rejestracji, walidacja, `ADULT_AGE` | `backend/core/serializers.py` |
| Konta specjalisty zakładane w panelu | `backend/core/colleagues.py` |
| Powiązanie dziecko–opiekun | `backend/core/guardian.py` |
| Kody na konto opiekuna | `backend/core/parent_invitations.py` |
| Zaproszenia specjalista–pacjent, kartoteka | `backend/core/specialist.py` |
| Bramki (zgody, hasło) | `backend/core/permissions.py`, `backend/core/consents.py` |
| Bramka opiekuna, `_require_patient`, `_require_specialist` | `backend/core/views.py` |
| Liczniki wspólne dla panelu, profilu i opiekuna | `backend/core/account.py` |
| Trasy, `homeRouteFor`, `gateRouteFor`, `allowGuardian`/`allowSpecialist` | `frontend/src/App.tsx` |
| Menu per rola | `frontend/src/components/HeaderMenu.tsx` |
| Lustro reguł backendu na froncie | `frontend/src/api/auth.ts` |

Testy, które trzeba zaktualizować razem z każdą zmianą w tym dokumencie:
`test_auth_api.py`, `test_guardian_api.py`, `test_specialist_api.py`,
`test_specialist_accounts.py`, `test_parent_invitation_api.py`,
`test_consent_gate.py`, `test_password_gate.py`, `test_guardian_gate.py`,
`test_guardian_children_api.py`.
