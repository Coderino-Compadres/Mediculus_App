# Konta w Mediculusie — instrukcja

**Dla kogo:** dla osób zakładających i obsługujących konta — pacjentów, rodziców
i opiekunów, specjalistów oraz zespołu fundacji.
**Stan na:** 9 września 2026.

Ten dokument odpowiada na cztery pytania: **jakie są rodzaje kont**, **jak każde
z nich założyć**, **co się w nim widzi** i **co zrobić, gdy coś nie działa**.
Na końcu jest krótki aneks dla programistów.

---

## Spis treści

1. [Które konto jest dla mnie](#1-które-konto-jest-dla-mnie)
2. [Zakładanie konta krok po kroku](#2-zakładanie-konta-krok-po-kroku)
3. [Pierwsze logowanie — co może Cię zatrzymać](#3-pierwsze-logowanie--co-może-cię-zatrzymać)
4. [Co widać w aplikacji](#4-co-widać-w-aplikacji)
5. [Łączenie kont](#5-łączenie-kont)
6. [Częste sytuacje i problemy](#6-częste-sytuacje-i-problemy)
7. [Czego aplikacja nie robi](#7-czego-aplikacja-nie-robi)
8. [Aneks dla zespołu](#8-aneks-dla-zespołu)

---

## 1. Które konto jest dla mnie

Są cztery rodzaje kont. Wybór robi się raz, przy zakładaniu, i **nie da się go
później zmienić** — zmiana rodzaju konta oznacza założenie nowego.

| Jestem… | Rodzaj konta | Kto je zakłada |
|---|---|---|
| osobą pełnoletnią, która chce prowadzić dzienniczek | **konto pacjenta** | Ty sam, w aplikacji |
| osobą niepełnoletnią, która chce prowadzić dzienniczek | **konto pacjenta małoletniego** | Ty sam, ale musi je zatwierdzić opiekun |
| rodzicem albo opiekunem prawnym pacjenta | **konto rodzica lub opiekuna** | Ty sam, **na kod od specjalisty** |
| psychoterapeutą, psychodietetykiem | **konto specjalisty** | inny specjalista, ze swojego panelu |

Dwie rzeczy, które warto wiedzieć od razu:

- **Konto rodzica nie służy do prowadzenia dzienniczka.** Nie ma w nim wpisów,
  raportów ani analiz — jest do zatwierdzania konta dziecka i do wglądu w to, czy
  dziecko z aplikacji korzysta. Jeśli chcesz prowadzić własny dzienniczek, potrzebne
  jest konto pacjenta (może być na inny adres e-mail).
- **Konta specjalisty nie da się założyć samodzielnie.** W formularzu rejestracji
  nie ma takiej opcji. Powód nie jest techniczny: konto specjalisty mówi
  o kwalifikacjach zawodowych, których aplikacja nie ma jak sprawdzić — a potwierdzić
  je może inna osoba z zawodu.

---

## 2. Zakładanie konta krok po kroku

### Konto pacjenta (osoba pełnoletnia)

1. Otwórz aplikację i wybierz **Utwórz konto**.
2. W polu *Rodzaj konta* wybierz **Konto pacjenta**.
3. Podaj imię, nazwisko, datę urodzenia i adres e-mail.
4. Ustaw hasło — **minimum 8 znaków**. Hasło nie może być zbyt podobne do Twojego
   adresu e-mail ani imienia i nazwiska, i nie może być jednym z haseł powszechnie
   używanych. Jeśli aplikacja odmówi, powie dlaczego.
5. Zaznacz **obie zgody** — na przetwarzanie danych i na usługi fundacji. Bez obu
   konto nie zadziała (patrz punkt 3).
6. Gotowe. Zostajesz od razu zalogowany, bez drugiego logowania.

**Data urodzenia musi zgadzać się z rodzajem konta.** Jeśli wybierzesz konto
pacjenta, a podasz datę osoby niepełnoletniej, aplikacja odmówi i poprosi o zmianę
jednego z dwóch. To nie czepialstwo — te dwie informacje muszą mówić to samo,
bo od nich zależy, czy konto wymaga zgody opiekuna.

### Konto pacjenta małoletniego

Kroki są takie same, z jedną różnicą na końcu: **konto powstaje, ale jest
zablokowane, dopóki opiekun go nie zatwierdzi.** Zamiast dzienniczka zobaczysz
ekran, na którym:

1. podajesz **adres e-mail opiekuna** — musi to być adres konta rodzica lub
   opiekuna, które już istnieje w aplikacji;
2. czekasz. Opiekun po zalogowaniu zobaczy Twoją prośbę na swoim ekranie
   głównym i ją zatwierdzi albo odrzuci;
3. jeśli się pomylisz w adresie, możesz prośbę **wycofać** i wysłać do kogoś
   innego. Po zatwierdzeniu wycofanie nie jest już możliwe.

Dlaczego tak: za osobę niepełnoletnią zgodę na korzystanie z takiej usługi daje
opiekun (RODO art. 8), a aplikacja nie ma innego sposobu, by wiedzieć, że ktoś tę
zgodę wyraził.

**Jeśli opiekun jeszcze nie ma konta**, kolejność jest odwrotna, niż się wydaje:
konto opiekuna powstaje na kod od specjalisty (poniżej), a nie z prośby dziecka.
W praktyce oznacza to, że tę część załatwia się na wizycie.

### Konto rodzica lub opiekuna

Potrzebujesz **kodu od specjalisty prowadzącego dziecko**. Kod dostajesz na
wizycie — jest podyktowany albo zapisany na kartce, wygląda tak:
`ABCD-EFGH-JKMN`.

1. Wybierz **Utwórz konto**, a w *Rodzaju konta* — **Konto rodzica lub opiekuna**.
2. Pojawi się pole **Kod od specjalisty**. Wpisz kod. Wielkość liter i myślniki
   nie mają znaczenia.
3. **Zarejestruj się na ten adres e-mail, który podałeś specjaliście** — kod
   działa tylko z nim.
4. Uzupełnij resztę: imię, nazwisko, datę urodzenia, hasło, obie zgody.
5. Gotowe. Konto rodzica powstaje **od razu połączone z dzieckiem** i zatwierdzone
   — dziecko nie musi już o nic prosić, a jego konto od tego momentu działa.

Trzy rzeczy o kodzie:

- **Ważny 14 dni** od wydania.
- **Jednorazowy** — po zarejestrowaniu przestaje działać.
- **Nie da się go odczytać po fakcie.** Nawet specjalista, który go wydał, nie
  zobaczy go drugi raz — może tylko unieważnić stary i wydać nowy. Kod nie
  zawiera znaków, które łatwo pomylić na kartce (nie ma w nim `O`, `0`, `I`,
  `1`, `L`, `S`, `5`, `Z`, `2`).

### Konto specjalisty

Zakłada je **inna osoba z kontem specjalisty**, w swoim panelu, w sekcji
**Konta specjalistów**:

1. Specjalista podaje imię, nazwisko, adres e-mail, datę urodzenia
   i specjalizację nowej osoby. Hasła nie podaje — aplikacja je generuje.
2. **Hasło pokazuje się jeden raz**, w odpowiedzi na formularz, i ekran mówi
   o tym wprost. Trzeba je przekazać nowej osobie (na kartce, ustnie) i zapisać
   do momentu pierwszego logowania. **Nie da się go odzyskać ani wysłać
   ponownie.**
3. Nowa osoba loguje się tym hasłem i przechodzi przez dwa ekrany:
   najpierw **udziela obu zgód** (nikt nie może tego zrobić za nią), potem
   **ustawia własne hasło**. Dopiero wtedy otwiera się panel.
4. Nowe konto jest puste — nie ma w nim żadnych pacjentów. Pacjenci pojawiają
   się dopiero wtedy, gdy każdy z nich przyjmie zaproszenie.

Dlaczego trzeba wymienić hasło: to hasło zostało **wygenerowane, a nie wybrane**
— osoba, która zakładała konto, je zna, i mogła je widzieć jeszcze ktoś, kto
zajrzał na kartkę. Panel otwiera się na dokumentację innych ludzi, więc samo
„jest zalogowany" nie wystarcza.

### Pierwsze konto specjalisty w ogóle

Nie da się go założyć w aplikacji — do stworzenia konta specjalisty potrzebne
jest konto specjalisty. Pierwsze zakłada zespół techniczny wprost w bazie danych,
raz na wdrożenie. Każde następne powstaje już z panelu.

---

## 3. Pierwsze logowanie — co może Cię zatrzymać

Bywa, że konto istnieje, a aplikacja pokazuje tylko jeden ekran. Są na to trzy
powody, zawsze jeden z nich — i każdy ma wyjście.

| Widzisz | Co to znaczy | Co zrobić |
|---|---|---|
| ekran ze zgodami | brakuje jednej albo obu zgód (nigdy nieudzielonych albo wycofanych) | zaznacz zgody na tym ekranie; aplikacja odblokuje się natychmiast |
| ekran „ustaw własne hasło" | to konto specjalisty z hasłem wygenerowanym przy zakładaniu | ustaw swoje hasło |
| ekran „wskaż opiekuna" | konto pacjenta małoletniego, którego opiekun jeszcze nie zatwierdził | podaj adres opiekuna i poczekaj na jego decyzję |

Kolejność jest stała: **najpierw zgody, potem hasło**. Z każdego z tych ekranów
można się też **wylogować** — przycisk jest równie widoczny jak ten, który
prowadzi dalej. To celowe: zgoda wymuszona nie jest zgodą, a osoba, która nie ma
przy sobie kartki z hasłem, musi móc po prostu wyjść.

---

## 4. Co widać w aplikacji

### Pacjent

Po zalogowaniu wybierasz jeden z dwóch modułów: **psychoterapeutyczny** albo
**dietetyczny i psychodietetyczny**. Menu zmienia się razem z modułem, a przejście
między nimi jest w menu.

Moduł psychoterapeutyczny:

- **Strona główna** — seria dni, dzisiejszy wpis, wykres z 7 dni, średnie.
- **Dodaj wpis** — jeden wpis na dobę. **Wpis można poprawiać tylko w dniu,
  w którym został napisany**; wpisy z wcześniejszych dni są do odczytu.
  Żadne pole nie jest obowiązkowe — suwak, którego nie ruszysz, zostaje bez
  odpowiedzi, a nie zapisany jako zero.
- **Dzienniczki** — archiwum wpisów, z filtrami i po 7 wierszy na stronę.
- **Raporty** — raport tygodniowy powstaje **sam**, po zakończeniu tygodnia,
  z Twoich wpisów. Nie tworzy się go ręcznie i nie wybiera się zakresu. Tydzień
  bez żadnego wpisu nie ma raportu. Da się pobrać PDF.
- **Analiza**, **Techniki DBT**, **Plan bezpieczeństwa**, **Profil**.

Moduł dietetyczny (w budowie):

- **Strona główna** i **Historia dzienniczków żywieniowych** — ten moduł
  **nie liczy jedzenia**: nie ma kalorii, makro ani wagi. Posiłek to zdjęcie
  i opis.
- **Nawodnienie** — szklanka (250 ml), butelka (500 ml) albo własna ilość, plus
  wykres 7 dni. Napoje inne niż woda są zapisywane, ale **nie są przeliczane na
  wodę** — o tym decyduje specjalista, nie aplikacja. Cel dzienny jest punktem
  odniesienia, a nie oceną: po jego przekroczeniu pasek jest po prostu pełny,
  bez gratulacji, a dnia poniżej celu nic nie nazywa nieudanym. Wpisy z dzisiaj
  można wycofać, starsze już nie.

### Rodzic lub opiekun

Twój ekran to **Strona główna** i **Profil**. Na stronie głównej:

- **prośby od dzieci** o zatwierdzenie konta — z imieniem i adresem, i niczym
  więcej. Zatwierdzasz albo odrzucasz. Odrzucenie nie jest zapisywane jako „nie":
  po prostu zwalnia dziecko, żeby mogło wskazać kogoś innego.
  Dopóki jakaś prośba czeka, **przy przycisku menu widać kropkę, a w menu liczbę**
  — na każdym ekranie, żeby dziecko nie czekało na kogoś, kto nie ma jak o tym
  wiedzieć;
- **lista dzieci**, dla których jesteś opiekunem, a przy każdym z nich: liczba
  wpisów, seria dni i data ostatniego wpisu.

**Nie widzisz treści dzienniczka dziecka** — ani nastroju, ani emocji, ani
raportów, ani tego, co dziecko napisało. Karta na ekranie mówi to wprost. Powód
jest kliniczny, a nie techniczny: dziecko, które wie, że rodzic czyta jego
dzienniczek, pisze inny dzienniczek. Czy opiekun kiedykolwiek dostanie wgląd
w treść, jest wciąż nierozstrzygnięte.

**Jest jeden wyjątek: żółty wykrzyknik obok imienia dziecka.** Pojawia się, gdy
**ostatni tygodniowy raport dziecka zawierał trzy lub więcej dni z oznaczonym
zachowaniem ryzykownym**. Trzy rzeczy o nim:

- mówi tylko „Ostatni raport wymaga uwagi" — **nie mówi, co się stało, ile razy
  ani którego dnia**. To nie jest wyciąg z dzienniczka; to sygnał, żeby
  porozmawiać z dzieckiem albo ze specjalistą prowadzącym;
- **nie otwiera raportu** — opiekun nadal nie ma do niego dostępu. Raporty widzi
  dziecko i jego specjalista;
- **nie pojawia się przy koncie zatrzymanym** (z wycofanymi zgodami) ani przy
  koncie bez dzienniczka — nie ma z czego go wyliczyć, a wycofanie zgody
  zatrzymuje właśnie to wyliczanie.

Znika sam, gdy kolejny raport zmieści się poniżej progu.

Reszta panelu rodzica jest w budowie i ekran o tym mówi.

### Specjalista

- **Pacjenci** — dwie osobne listy: pacjenci, którzy przyjęli zaproszenie, i ci,
  którzy jeszcze nie odpowiedzieli. Przy każdym: imię, adres, czy jest osobą
  małoletnią, od kiedy jest pod opieką oraz liczba wpisów, seria i data ostatniego
  wpisu. **Żadnych treści** — te są w raportach.
- **Raporty pacjenta** — dokładnie te same dokumenty, które widzi pacjent, wraz
  z PDF-em. Dwie osoby w gabinecie nie mogą trzymać różnych papierów.
- **Kody na konto opiekuna** — wydawanie i unieważnianie kodów (patrz punkt 2).
- **Konta specjalistów** — zakładanie kont kolegom i lista wszystkich kont
  zawodowych. **Bez pacjentów i bez żadnych liczników**: pacjenci danej osoby
  zgodzili się na *nią*, nie na cały zespół.
- **Techniki** — pisanie własnych technik do katalogu. Wszystko, co zapiszesz,
  jest widoczne dla **każdego pacjenta od razu** — nie ma wersji roboczej.
  Wycofanie techniki oznacza jej usunięcie. Poprawić można tylko własną technikę;
  cudzy tekst kliniczny to rozmowa z autorem, nie formularz.
- **Katalog technik** oczami pacjenta i **Profil**.

Czego w panelu nie ma i nie będzie bez decyzji klientki: **wglądu w dzienniczek
pacjenta i ekranów analizy**. Ekran mówi to wprost, zamiast obiecywać na później.

**Samo konto specjalisty nie daje dostępu do niczyich danych.** Dostęp do raportów
pacjenta bierze się z tego, że **ten pacjent przyjął zaproszenie** — i jest
sprawdzany za każdym razem, a nie raz przy logowaniu.

---

## 5. Łączenie kont

### Dziecko i opiekun

- **Prośbę wysyła dziecko**, podając adres e-mail opiekuna. Adres musi należeć do
  istniejącego konta rodzica lub opiekuna.
- Jeśli adres jest nieznany albo należy do innego rodzaju konta, komunikat jest
  **jeden i ten sam**. Aplikacja celowo nie mówi, czy dany adres ma tu konto
  i jakie — w usłudze zdrowia psychicznego sama ta informacja jest wrażliwa.
- **Jedna prośba naraz.** Ponowne wysłanie do tej samej osoby nic nie psuje.
- **Zatwierdza opiekun**, ze swojego ekranu głównego. Dziecko nie może zatwierdzić
  własnej prośby.
- Po zatwierdzeniu **dziecko nie może rozwiązać powiązania**. Gdyby mogło, nadzór
  trwałby dokładnie tyle, ile dziecko na to pozwoli.

Jeśli opiekun ma już konto (bo prowadzi w aplikacji starsze dziecko), tą ścieżką
dołącza się kolejne dziecko. Jeśli konta jeszcze nie ma — potrzebny jest kod od
specjalisty.

### Specjalista i pacjent

- **Zaproszenie wysyła specjalista**, podając adres e-mail pacjenta.
- **Decyduje pacjent** — kartę z zaproszeniem widzi na swojej stronie głównej
  (a dziecko czekające na opiekuna — na ekranie, na którym czeka).
- Odmowa nie jest nigdzie zapisywana, więc po rozmowie można zaprosić ponownie.
- **Opiekę kończy specjalista, nie pacjent.** To decyzja klientki i ma
  uzasadnienie kliniczne: przy zaburzeniach odżywiania rośnie skłonność do
  ukrywania informacji, więc przełącznik po stronie pacjenta wyłączałby raporty
  dokładnie w tych sytuacjach, w których są potrzebne. Karta zaproszenia mówi
  o tym **przed** przyjęciem, bo zgoda bez tego zdania nie jest świadoma.
- Zakończenie opieki aplikacja potwierdza dwa razy — pacjent tego nie odwróci,
  musiałby dostać nowe zaproszenie i przyjąć je ponownie.
- Jeden pacjent może mieć dziś **jednego specjalistę**. To znane ograniczenie:
  pacjent chodzący jednocześnie do psychoterapeuty i psychodietetyka nie jest
  jeszcze do wyrażenia.

### Formularze zaproszeń mówią mało — i to celowo

Kiedy zaproszenia nie da się wysłać, komunikat prawie zawsze jest ten sam,
niezależnie od przyczyny. To nie lakoniczność, tylko ochrona: inaczej formularz
byłby sposobem sprawdzania, kto ma tu konto i w jakiej jest opiece. Wyjątki są
dwa i oba są bezpieczne: **własny adres** oraz **pacjent, który już jest pod Twoją
opieką** (i tak widzisz go na liście wyżej).

---

## 6. Częste sytuacje i problemy

**Zapomniałem hasła.**
Nie ma odzyskiwania hasła — z tego wdrożenia **nie wychodzi żadna poczta**, więc
nie ma czym wysłać linku. Hasło zmienia się z **Profilu**, będąc zalogowanym
(trzeba podać obecne hasło). Jeśli nie da się zalogować, konto trzeba założyć na
nowo; w przypadku konta specjalisty — poprosić kolegę o utworzenie nowego na inny
adres.

**Nie mogę się zalogować, aplikacja mówi o wyczerpanych próbach.**
Prób logowania na jedno konto jest **15 na godzinę**. Od dziesiątej nieudanej
aplikacja pokazuje, ile jeszcze zostało. Udane logowanie zeruje licznik. Trzeba
odczekać.

**Zgubiłem kod na konto opiekuna.**
Kodu nie da się odczytać ponownie — specjalista unieważnia stary i wydaje nowy.

**Kod nie działa.**
Sprawdź trzy rzeczy: czy rejestrujesz się **na ten adres**, który podałeś
specjaliście; czy nie minęło **14 dni**; czy kod nie został już użyty. Aplikacja
we wszystkich tych przypadkach mówi to samo, więc trzeba przejść listę po kolei.
Wielkość liter, spacje i myślniki nie mają znaczenia.

**Wybrałem zły rodzaj konta.**
Rodzaju konta nie da się zmienić. Trzeba założyć nowe (na inny adres e-mail,
bo jeden adres to jedno konto).

**Chcę wycofać zgodę.**
Można, z **Profilu**, i wymaga to podania hasła. Po wycofaniu konto jest
zablokowane — zostaje jeden ekran, ten ze zgodami. **Nic nie jest usuwane**:
dzienniczek stoi tam, gdzie stał, i wraca w całości, gdy zgodę przywrócisz.
Przywrócenie nie wymaga hasła — to kierunek, który odblokowuje konto, więc
utrudnianie go nikogo nie chroni.

Ważne dla opiekunów i specjalistów: **konto z wycofaną zgodą przestaje pokazywać
cokolwiek również im.** Specjalista nie zobaczy raportów, opiekun nie zobaczy
liczb — obaj zobaczą informację, że konto jest zablokowane. Tak jest lepiej niż
milczenie, które czytałoby się jako „przestał pisać".

**Chcę usunąć konto.**
Jeszcze nie ma takiej funkcji. Blokuje ją nieodpowiedziane pytanie prawne o to,
jak długo trzeba przechowywać dokumentację kliniczną. Wycofanie zgody jest
dostępne teraz i **nie jest** usunięciem konta.

**Chcę zmienić adres e-mail.**
Jeszcze nie ma. Nowy adres trzeba potwierdzić wiadomością wysłaną *na niego*,
a poczty z tego wdrożenia nie ma.

**Chcę wyeksportować swoje dane.**
Jeszcze nie ma, choć jest to nam należne (RODO art. 15 i 20) i jest na liście.

**Jestem opiekunem i chcę cofnąć zatwierdzenie.**
Jeszcze nie ma takiej funkcji.

**Jestem opiekunem — skąd wiem, że dziecko czeka?**
Po zalogowaniu **przy przycisku menu pojawia się kropka**, a w rozwiniętym menu
liczba przy „Strona główna" — na każdym ekranie, także w Profilu, nie tylko na
stronie głównej. Kropka znika, gdy odpowiesz na wszystkie prośby. Czytnik ekranu
przeczyta to jako „Menu — 1 prośba oczekuje na odpowiedź".

Poza aplikacją nic Cię nie zawiadomi: **nie ma maili ani powiadomień push**. Jeśli
umawiacie się z dzieckiem albo ze specjalistą, że konto ma zostać zatwierdzone,
trzeba się po prostu zalogować.

---

## 7. Czego aplikacja nie robi

Zebrane w jednym miejscu, żeby nie było niespodzianek:

- **nie wysyła żadnej poczty i nie ma powiadomień push** — stąd kody i hasła
  wręczane w gabinecie, brak odzyskiwania hasła i brak „PDF na maila". O prośbie
  dziecka opiekun dowiaduje się **w aplikacji** (kropka przy menu), a nie z maila;
- **nie stawia diagnozy** i nie zastępuje kontaktu ze specjalistą;
- **nie ocenia dnia** — ani w nawodnieniu, ani w raportach: zmiana jest zawsze
  kierunkiem i wartością („+0,6 od poprzedniego tygodnia"), nigdy oceną osoby;
- **nie liczy jedzenia** w module dietetycznym;
- **nie pokazuje opiekunowi treści dzienniczka dziecka** — poza jednym
  sygnałem: wykrzyknikiem „Ostatni raport wymaga uwagi" (patrz punkt 4);
- **nie pozwala pacjentowi odciąć specjalisty** od raportów;
- **nie usuwa kont** i nie zmienia adresów e-mail;
- **nie obsługuje dwóch specjalistów** dla jednego pacjenta.

---

## 8. Aneks dla zespołu

Reguły opisane wyżej są wymuszane **po stronie serwera**, a nie tylko przez
ekrany — przekierowanie w przeglądarce nie jest zabezpieczeniem. Gdzie co siedzi:

| Temat | Plik |
|---|---|
| Rodzaje kont z rejestracji, wymóg kodu dla rodzica, granica pełnoletności | `backend/core/serializers.py` |
| Konta specjalisty zakładane w panelu | `backend/core/colleagues.py` |
| Powiązanie dziecko–opiekun | `backend/core/guardian.py` |
| Kody na konto opiekuna | `backend/core/parent_invitations.py` |
| Zaproszenia specjalista–pacjent, kartoteka | `backend/core/specialist.py` |
| Bramka zgód i bramka hasła | `backend/core/permissions.py`, `backend/core/consents.py` |
| Bramka opiekuna, „czy to pacjent", „czy to specjalista" | `backend/core/views.py` |
| Liczniki wspólne dla panelu, profilu i opiekuna | `backend/core/account.py` |
| Trasy i przekierowania per rodzaj konta | `frontend/src/App.tsx` |
| Menu per rodzaj konta | `frontend/src/components/HeaderMenu.tsx` |
| Lustro reguł backendu na froncie | `frontend/src/api/auth.ts` |

Testy, które trzeba przejrzeć przy każdej zmianie w tym dokumencie:
`test_auth_api.py`, `test_guardian_api.py`, `test_specialist_api.py`,
`test_specialist_accounts.py`, `test_parent_invitation_api.py`,
`test_consent_gate.py`, `test_password_gate.py`, `test_guardian_gate.py`,
`test_guardian_children_api.py`.

Trzy szczegóły, które łatwo przeoczyć przy czytaniu tego dokumentu jako
specyfikacji:

- **Rola konta niczego nie autoryzuje.** Pacjenta rozpoznaje wiersz `patient`,
  specjalistę wiersz `specjalist`; napis w `user_role` jest do wyświetlania.
- **Konto rodzica seedowane przez `scripts/mock_data.sql` jest jedynym, którego
  aplikacja już by nie stworzyła** — SQL nie przechodzi przez serializer, więc
  demo-rodzic istnieje bez żadnego zaproszenia.
- **Limity zapytań** (15 prób logowania na konto na godzinę, 10 zmian hasła,
  60 zaproszeń, 20 nowych kont specjalisty, 30 PDF-ów) są liczone w tabeli
  `throttle_cache` w `user_db`. Brak tej tabeli powoduje, że limity **przestają
  obowiązywać po cichu** — pilnuje tego `manage.py check_databases`.
