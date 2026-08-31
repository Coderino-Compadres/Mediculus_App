import type { Technique, TechniqueStep } from '../types/technique'

/**
 * The technique catalogue's content.
 *
 * SOURCE OF TRUTH: `markdown/techniki-dbt.md` — descriptions written from
 * scratch by the team on the basis of the materials the client sent. The
 * wording there is deliberate (softened wherever it touches food or physical
 * effort, and silent in two places on purpose — see the notes below) and is
 * still awaiting clinical review by the specialists. It is transcribed here as
 * written. Do not extend it from general knowledge of DBT: an addition that is
 * clinically standard elsewhere may be exactly what was left out here.
 *
 * The whole catalogue is hardcoded because there is no backend for it yet. It
 * lives in its own module rather than inside the screen for a reason the client
 * asked for directly: DBT keeps growing and they want to be able to add
 * techniques later, so moving the source to a database has to be one import
 * swap, not a rewrite of the screen.
 *
 * TODO: what the client named but did not send materials for. Keep this list
 * next to the data, because a reader of the DBT tab will notice the mockup's
 * names are missing and the reason is not in the code anywhere else:
 *   - STOP, "Mindfulness i uważność" and "Powrót do równowagi" were listed by
 *     the client in an earlier conversation and appear in the mockup's DBT tab,
 *     but none of the 23 pages she then sent describe them. Nothing is written
 *     for them here rather than guessing at the content.
 *   - "Radykalna akceptacja" was ordered explicitly ("w DBT trzeba będzie
 *     zrobić na pewno") and is almost certainly on the missing pages 322-325
 *     (materials 13-15 of the distress-tolerance module, the gap between the
 *     TIPP worksheet and "dobrowolność"). This is the most serious gap in the
 *     set: it is also why the fourth group holds a single technique today.
 *     Waiting on the client sending those pages.
 *   - Smaller gaps in the same request: pp. 313-315 (IMPROVE, which is why that
 *     technique below is the one section written without source pages), p. 343
 *     ("jak uprawomocniać innych" — matters, parents are a target group), the
 *     expansion of ABC, and FAST (referenced by "samouprawomocnienie" in the
 *     source material but with no page of its own).
 */

// ---- Shared step text ------------------------------------------------------------
//
// Paced breathing and progressive muscle relaxation are components of TIPP AND
// standalone relaxation techniques the client named herself, so they appear as
// steps of TIPP in the DBT tab and as their own entries in the "Relaksacyjne"
// tab. The description text is defined once, here, and referenced from both
// places — so the first clinical correction lands on one string instead of two
// copies that then disagree.

// The description is the const; the name belongs to the step only inside TIPP,
// where it distinguishes one skill from the three others. On the standalone entry
// the technique's own heading already carries it, and repeating it as the heading
// of a one-item "Jak to zrobić" list said the same thing twice.
const OPIS_MIAROWE_ODDYCHANIE =
  'Spowolnij oddech do kilku oddechów na minutę i zadbaj, żeby wydech był dłuższy niż wdech — na przykład wdech na cztery, wydech na sześć. Oddychaj przeponą, nie samą klatką piersiową. Efekt zwykle pojawia się w ciągu minuty lub dwóch.'

const OPIS_PROGRESYWNA_RELAKSACJA =
  'Przechodź przez ciało grupa mięśni po grupie: napnij na kilka sekund, potem rozluźnij całkowicie i zauważ różnicę między jednym a drugim stanem. Od głowy w dół albo od stóp w górę — kolejność nie ma znaczenia, ważne, żeby objąć całe ciało.'

const KROK_MIAROWE_ODDYCHANIE: TechniqueStep = {
  nazwa: 'Miarowe oddychanie',
  opis: OPIS_MIAROWE_ODDYCHANIE,
}

const KROK_PROGRESYWNA_RELAKSACJA: TechniqueStep = {
  nazwa: 'Progresywna relaksacja mięśni',
  opis: OPIS_PROGRESYWNA_RELAKSACJA,
}

/** TIPP's group description, shared with the two standalone relaxation entries. */
const TIPP_WPROWADZENIE =
  'Umiejętności działające bezpośrednio na ciało, przeznaczone na moment bardzo wysokiego pobudzenia — kiedy emocja jest tak silna, że rozmowa z samym sobą nie działa, a głowa nie przetwarza już informacji. Zmieniamy fizjologię, żeby dać umysłowi szansę wrócić do gry.'

// ---- The catalogue ---------------------------------------------------------------

export const TECHNIQUES: Technique[] = [
  // === Grupa 1: Kiedy jest naprawdę ciężko (minuty) ==============================
  {
    id: 'accepts',
    nazwa: 'Odwracanie uwagi — ACCEPTS',
    podtytul:
      'Sposoby na przeczekanie najtrudniejszego momentu, kiedy sytuacji nie da się w tej chwili zmienić.',
    szkola: ['dbt'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Zestaw sposobów na przeczekanie najtrudniejszego momentu, kiedy emocja jest zbyt silna, żeby cokolwiek rozwiązywać, a sytuacji nie da się w tej chwili zmienić. Nie chodzi o unikanie problemu — chodzi o odsunięcie go na krótko, żeby wrócić do niego z chłodniejszą głową.',
    kroki: [
      {
        nazwa: 'A — Aktywność',
        opis:
          'Zajmij się czymś, co wymaga twojej uwagi. Im bardziej absorbujące, tym lepiej — chodzi o to, żeby myśli miały gdzie pójść.',
        przyklady: [
          'ugotuj coś',
          'posprzątaj szufladę',
          'zagraj w grę',
          'wyjdź na spacer',
          'obejrzyj odcinek serialu',
        ],
      },
      {
        nazwa: 'C — Pomaganie innym',
        opis:
          'Zrobienie czegoś dla kogoś przenosi uwagę na zewnątrz i często poprawia nastrój bardziej, niż się spodziewamy.',
        przyklady: [
          'napisz do kogoś, kto może tego potrzebować',
          'pomóż komuś domownikowi w drobnej rzeczy',
          'zrób coś miłego bez okazji',
        ],
      },
      {
        // TODO: which variant of this skill the app uses is an open question for
        // the client (question 4 in the document). The classic version has the
        // person compare themselves with somebody worse off, which for some
        // people works in reverse and deepens guilt ("nie mam prawa się tak
        // czuć"). The wording below is the version proposed to the specialist —
        // comparison with one's own past. Awaiting her decision.
        nazwa: 'C — Porównania',
        opis:
          'Spójrz na swoją sytuację z innej perspektywy — na przykład przypomnij sobie moment, w którym było ci trudniej, i to, że go przetrwałeś.',
      },
      {
        nazwa: 'E — Emocje',
        opis:
          'Wywołaj u siebie inną emocję niż ta, która teraz dominuje. Nie na siłę — po prostu daj sobie bodziec, który ciągnie w drugą stronę.',
        przyklady: ['śmieszne wideo', 'muzyka o innym nastroju niż twój obecny', 'zabawna książka'],
      },
      {
        nazwa: 'P — Odpychanie',
        opis:
          'Odłóż trudną sytuację na bok na określony czas. Pomaga wyobrażenie: zamykasz sprawę w pudełku i odstawiasz je na półkę — nie wyrzucasz, wrócisz do niej później.',
      },
      {
        nazwa: 'T — Myśli',
        opis:
          'Zajmij głowę czymś, co wymaga myślenia. Kiedy umysł liczy albo układa, ma mniej miejsca na rozpamiętywanie.',
        przyklady: [
          'policz do stu wspak co siedem',
          'rozwiąż krzyżówkę',
          'przypomnij sobie tekst piosenki od początku do końca',
        ],
      },
      {
        // DELIBERATE OMISSION — do not add holding ice or a cold shower here,
        // even though the classic version of this skill includes them. The
        // source material attaches medical contraindications to cold-based
        // skills and recommends consulting a doctor first; this catalogue is
        // read without a specialist present, also by minors. Techniques built on
        // sensory shock are additionally open to misuse by people with a history
        // of self-harm. See "Do decyzji klienta" in markdown/techniki-dbt.md.
        nazwa: 'S — Doznania',
        opis: 'Daj sobie wyraźny bodziec fizyczny, który przyciągnie uwagę do ciała.',
        przyklady: [
          'pogłaskaj zwierzę',
          'ugniataj piłeczkę antystresową',
          'weź ciepły prysznic',
          'zrób serię przysiadów',
        ],
      },
    ],
  },
  {
    id: 'samokojenie',
    nazwa: 'Samokojenie przez zmysły',
    podtytul: 'Świadome zadbanie o siebie przez każdy ze zmysłów po kolei.',
    szkola: ['dbt'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Świadome zadbanie o siebie przez każdy ze zmysłów po kolei. Prosta rzecz, która często wydaje się zbyt prosta, żeby zadziałać — a działa, bo obniża pobudzenie ciała, zanim zaczniemy pracować z myślami.',
    kroki: [
      {
        nazwa: 'Wzrok',
        opis:
          'Daj oczom coś przyjemnego. Pójdź w miejsce, które lubisz, obejrzyj zdjęcia z dobrego okresu, popatrz przez okno na niebo albo na zieleń.',
      },
      {
        nazwa: 'Słuch',
        opis:
          'Włącz muzykę, która ci odpowiada w tym momencie — niekoniecznie wesołą. Albo odwrotnie: wsłuchaj się w dźwięki wokół, bez muzyki. Deszcz, ruch uliczny, ptaki.',
      },
      {
        nazwa: 'Węch',
        opis:
          'Zapach działa szybko i bezpośrednio. Świeżo parzona kawa lub herbata, ulubiony balsam, świeca, otwarte okno po deszczu.',
      },
      {
        // Softened on purpose, and the wording is load-bearing: "zjedz coś, co
        // lubisz, żeby poczuć się lepiej" reads very differently to somebody
        // with an eating disorder, and this app is co-run by a dietetic clinic.
        // No amounts, no food lists, no comfort-eating framing. A psychodietetic
        // variant of this text is an open question with the client — that is
        // what Technique.modulAplikacji is reserved for.
        nazwa: 'Smak',
        opis:
          'Zjedz lub wypij coś, co lubisz, i zwróć uwagę na sam smak — powoli, bez telefonu w drugiej ręce.',
      },
      {
        nazwa: 'Dotyk',
        opis:
          'Ciepła kąpiel, wygodne ubranie, koc, głaskanie zwierzęcia, przytulenie kogoś bliskiego.',
      },
      {
        nazwa: 'Ruch',
        opis: 'Delikatny ruch, nie wysiłek. Rozciąganie, kołysanie się, spokojny spacer, kilka pozycji jogi.',
      },
    ],
  },
  {
    id: 'improve',
    nazwa: 'Poprawianie chwili — IMPROVE',
    podtytul: 'Sposoby na to, żeby trudny moment stał się choć trochę znośniejszy.',
    szkola: ['dbt'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    // NOTE: the one technique written without access to its source pages (pp.
    // 313-315 were not sent), so it needs closer review than the rest — see the
    // TODO at the top of this file.
    wprowadzenie:
      'Zestaw sposobów na to, żeby trudny moment stał się choć trochę znośniejszy — nie przez rozwiązanie problemu, tylko przez zmianę tego, jak go przeżywasz.',
    kroki: [
      {
        nazwa: 'I — Wyobraźnia',
        opis:
          'Wyobraź sobie miejsce, w którym czujesz się bezpiecznie, i zostań tam przez chwilę w myślach. Albo wyobraź sobie, jak radzisz sobie z trudną sytuacją i wychodzisz z niej cało.',
      },
      {
        nazwa: 'M — Sens',
        opis:
          'Poszukaj w tej sytuacji czegoś, co ma dla ciebie znaczenie — czegoś, czego się uczysz, wartości, o którą walczysz. Nie chodzi o wmawianie sobie, że jest dobrze. Chodzi o znalezienie powodu, dla którego warto to przetrwać.',
      },
      {
        nazwa: 'P — Modlitwa',
        opis:
          'Dla osób wierzących — zwrócenie się do Boga lub siły wyższej. Dla pozostałych ta sama umiejętność może przyjąć formę oddania sprawy czemuś większemu niż my sami, otwarcia się na to, czego nie kontrolujemy.',
      },
      {
        nazwa: 'R — Relaks',
        opis:
          'Rozluźnij ciało. Napięte barki, zaciśnięta szczęka, płytki oddech — rozluźnienie ciała pociąga za sobą umysł.',
      },
      {
        nazwa: 'O — Jedna rzecz w danej chwili',
        opis:
          'Skup się wyłącznie na tym, co robisz teraz. Jedna czynność, pełna uwaga. Kiedy myśli uciekają do tego, co było albo będzie, spokojnie wracaj do bieżącej chwili.',
      },
      {
        nazwa: 'V — Urlop',
        opis:
          'Zrób sobie krótką, zaplanowaną przerwę od wszystkiego. Kluczowe słowo: krótką i zaplanowaną — z góry ustaloną godziną powrotu.',
      },
      {
        nazwa: 'E — Dodawanie otuchy',
        opis:
          'Mów do siebie tak, jak mówiłbyś do przyjaciela w tej samej sytuacji. „Dam radę", „to minie", „robię, co mogę".',
      },
    ],
  },
  {
    id: 'za-i-przeciw',
    nazwa: 'Za i przeciw',
    podtytul:
      'Metoda na moment, w którym czujesz silny impuls, żeby zrobić coś, czego potem pożałujesz.',
    // NOTE: not tagged 'cbt', even though the source document names it as the
    // classic cost-benefit analysis. The client assigned none of her materials
    // to CBT, and tagging it ourselves would be our interpretation presented as
    // her decision. Waiting for her CBT materials instead.
    szkola: ['dbt'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Metoda na moment, w którym czujesz silny impuls, żeby zrobić coś, czego prawdopodobnie potem pożałujesz. Zamiast walczyć z impulsem siłą woli, wypisujesz cztery rzeczy: co zyskujesz i co tracisz, jeśli ulegniesz — oraz co zyskujesz i co tracisz, jeśli nie ulegniesz.',
    // The document writes this one as unnamed bullet points, so the steps carry
    // no names — see TechniqueStep.nazwa.
    kroki: [
      {
        opis:
          'Uwzględnij zarówno skutki natychmiastowe, jak i te za tydzień czy miesiąc. Impuls zwykle obiecuje ulgę teraz i milczy o reszcie.',
      },
      {
        opis:
          'Wypisz listę zawczasu, na spokojnie — nie w środku kryzysu. W kryzysie nie ma się głowy do robienia list.',
      },
      // The document adds "w aplikacji: zapisaną i dostępną w jednym kliknięciu"
      // here. Left out: saving a pros-and-cons list is not something this app
      // can do yet, and the catalogue must not promise a screen that is not
      // built. Restore the sentence when the practice module exists.
      { opis: 'Miej ją pod ręką, żeby móc do niej wrócić w jednej chwili.' },
      { opis: 'Kiedy przyjdzie impuls, przeczytaj listę i wyobraź sobie obie wersje przyszłości.' },
    ],
  },
  {
    id: 'tipp',
    nazwa: 'TIPP',
    podtytul: 'Umiejętności działające na ciało, na moment bardzo wysokiego pobudzenia.',
    szkola: ['dbt'],
    grupa: 'kryzys',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie: TIPP_WPROWADZENIE,
    kroki: [
      KROK_MIAROWE_ODDYCHANIE,
      KROK_PROGRESYWNA_RELAKSACJA,
      {
        // Kept as written in the document — "bez przesady, chodzi o
        // rozładowanie, nie o wyczerpanie" is part of the softening, not filler.
        // A psychodietetic variant of this skill is an open question with the
        // client: physical effort as a tool of emotion regulation can reinforce
        // compensatory patterns.
        nazwa: 'Intensywne ćwiczenia aerobowe',
        opis:
          'Krótki, intensywny wysiłek, który spala nagromadzone w ciele napięcie. Kilkanaście minut szybkiego marszu, biegu w miejscu, skakanki, tańca. Bez przesady — chodzi o rozładowanie, nie o wyczerpanie.',
      },
      {
        // DELIBERATELY NOT EXPLAINED. The source material lists medical
        // contraindications for this skill (cardiac conditions, beta-blockers,
        // low baseline blood pressure, eating disorders, cold allergy) and
        // recommends consulting a doctor before using it. The app does not know
        // whether the person reading has a heart condition; a specialist does.
        // Never add instructions here — see markdown/techniki-dbt.md,
        // "Do decyzji klienta", point 1.
        nazwa: 'Temperatura',
        opis:
          'Tę umiejętność wprowadza specjalista podczas sesji. Materiały źródłowe wymieniają przy niej przeciwwskazania medyczne i zalecają wcześniejszą konsultację z lekarzem, dlatego katalog nie podaje instrukcji jej wykonania. Jeśli chcesz z niej korzystać, porozmawiaj o tym ze swoim specjalistą.',
        wprowadzaSpecjalista: true,
      },
    ],
  },

  // === Grupa 2: Codzienna odporność (nawyki) =====================================
  {
    id: 'abc-please',
    nazwa: 'ABC PLEASE — przegląd',
    podtytul: 'Nawyki, które obniżają podatność na to, żeby emocjonalny pożar w ogóle wybuchł.',
    szkola: ['dbt'],
    grupa: 'odpornosc',
    modulDBT: 'regulacja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Zestaw nawyków, które działają zapobiegawczo. Nie służą gaszeniu pożaru, tylko obniżaniu podatności na to, żeby pożar w ogóle wybuchł. Część „ABC" dotyczy budowania pozytywnych doświadczeń, część „PLEASE" — dbania o ciało.',
    kroki: [
      {
        nazwa: 'Gromadzenie pozytywnych doświadczeń',
        opis:
          'Świadome wprowadzanie do swojego dnia rzeczy, które sprawiają przyjemność — nawet drobnych. W krótkiej perspektywie: jedna miła rzecz dziennie. W dłuższej: budowanie życia, w którym takich rzeczy jest po prostu więcej.',
      },
      {
        nazwa: 'Budowanie biegłości',
        opis:
          'Robienie codziennie czegoś, co daje poczucie kompetencji. Coś, co jest trochę trudne, ale wykonalne — i po czym można sobie powiedzieć „zrobiłem to". Poczucie sprawczości działa na nastrój inaczej niż przyjemność, dlatego to osobna umiejętność.',
      },
      {
        nazwa: 'Radzenie sobie zawczasu',
        opis:
          'Przygotowanie się na trudną sytuację, zanim nastąpi. Wyobraź sobie ją szczegółowo, zaplanuj konkretnie, jak zareagujesz, i przećwicz to w głowie. Kiedy sytuacja przyjdzie naprawdę, masz już gotowy scenariusz zamiast improwizacji pod presją.',
      },
    ],
  },
  {
    id: 'please',
    nazwa: 'Umiejętności PLEASE',
    podtytul: 'Pięć obszarów dbania o ciało, które przekładają się na odporność emocjonalną.',
    szkola: ['dbt'],
    grupa: 'odpornosc',
    modulDBT: 'regulacja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Pięć obszarów dbania o ciało, które bezpośrednio przekładają się na odporność emocjonalną. Niewyspany, chory albo głodny człowiek reaguje emocjonalnie inaczej niż wypoczęty — i nie jest to kwestia charakteru.',
    kroki: [
      {
        nazwa: 'Leczenie chorób somatycznych',
        opis:
          'Zadbaj o zdrowie fizyczne. Idź do lekarza, kiedy trzeba, i przyjmuj leki zgodnie z zaleceniami. Nieleczona dolegliwość obciąża psychicznie bardziej, niż się zwykle zakłada.',
      },
      {
        // THE MOST DELIBERATELY SOFTENED LINE IN THE WHOLE CATALOGUE. The
        // original formulates this skill as "do not eat too much or too little"
        // plus avoiding foods that trigger strong emotions. In a consulting room,
        // where the dietitian knows the patient, that is sensible advice; as
        // self-service text in an app used by teenagers it reads as an
        // instruction in controlling food, and "too much" / "too little" /
        // "foods to avoid" is exactly the language eating disorders organise
        // themselves around. NEVER add amounts, limits, lists of foods to avoid,
        // or the too-much/too-little framing here. Personalised guidance belongs
        // to the psychodietitian, not to a generic catalogue entry.
        nazwa: 'Regularne odżywianie',
        opis: 'Jedz regularnie, w sposób, który daje ciału stabilną energię przez cały dzień.',
      },
      {
        nazwa: 'Unikanie substancji zmieniających nastrój',
        opis:
          'Alkohol i narkotyki dają krótkotrwałą ulgę, a w dłuższej perspektywie nasilają wahania emocji i utrudniają korzystanie z pozostałych umiejętności.',
      },
      {
        nazwa: 'Higiena snu',
        opis:
          'Śpij tyle, żeby budzić się wypoczętym, i staraj się utrzymać regularne godziny. Regularność ma tu większe znaczenie niż jednorazowe „odespanie" — to jeden z najsilniejszych czynników wpływających na regulację emocji.',
      },
      {
        // Softened for the same reason as the aerobic exercise in TIPP: for
        // psychodietetic patients, effort as emotion regulation can reinforce
        // compensatory patterns. "Systematyczność, nie intensywność" is the point.
        nazwa: 'Aktywność fizyczna',
        opis:
          'Ruszaj się codziennie, choćby to był spacer. Zacznij od małego i stopniowo dokładaj — chodzi o systematyczność, nie o intensywność.',
      },
    ],
  },

  // === Grupa 3: Relacje i rozmowy (konkretna sytuacja) ===========================
  {
    id: 'dear-man',
    nazwa: 'DEAR MAN',
    podtytul: 'Struktura rozmowy, w której chcesz coś uzyskać albo czegoś odmówić.',
    szkola: ['dbt'],
    grupa: 'relacje',
    modulDBT: 'skutecznoscInterpersonalna',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    // NOTE: the source material illustrates this technique with a conflict over
    // curfew — the same situation seen from both sides. That is the natural
    // starting point for a teenager variant and a parent variant of this text,
    // which is what Technique.odbiorca is reserved for.
    wprowadzenie:
      'Struktura rozmowy, w której chcesz coś uzyskać albo czegoś odmówić. Siedem kroków, które można przygotować sobie w głowie przed trudną rozmową. Nie gwarantują, że dostaniesz to, o co prosisz — ale wyraźnie zwiększają szansę i zmniejszają ryzyko, że rozmowa zamieni się w kłótnię.',
    kroki: [
      {
        nazwa: 'D — Opisz sytuację',
        opis:
          'Zacznij od faktów, bez ocen i interpretacji. Tylko to, co dałoby się nagrać kamerą.',
        przyklady: ['„Trzeci raz w tym tygodniu wróciłeś po umówionej godzinie."'],
      },
      {
        nazwa: 'E — Wyraź uczucia i opinie',
        opis:
          'Powiedz, jak się z tym czujesz, mówiąc o sobie, a nie o drugiej osobie. Zdania zaczynające się od „czuję", „wolałbym", „zależy mi" zamiast od „powinieneś" i „zawsze to robisz".',
        przyklady: ['„Kiedy wracasz później, martwię się."'],
      },
      {
        nazwa: 'A — Asertywnie wyraź prośbę',
        opis:
          'Powiedz wprost, czego chcesz — albo wprost odmów. Ludzie nie czytają w myślach, a sygnały i aluzje bardzo często nie docierają.',
        przyklady: ['„Chciałbym, żebyś wracał o umówionej porze."'],
      },
      {
        nazwa: 'R — Wynagradzaj',
        opis:
          'Wyjaśnij, co druga osoba zyska, jeśli spełni prośbę. Nie chodzi o przekupstwo, tylko o pokazanie realnej korzyści z jej perspektywy.',
        przyklady: ['„Będę spokojniejszy i łatwiej mi będzie zgodzić się na kolejne wyjścia."'],
      },
      {
        nazwa: 'M — Podtrzymuj uważność',
        opis:
          'Trzymaj się tematu. Jeśli rozmowa zbacza albo pojawiają się przytyki, spokojnie wracaj do swojej prośby — nawet kilka razy, tymi samymi słowami. Nie wchodź w licytację, kto ma większe zasługi.',
      },
      {
        nazwa: 'A — Okazuj pewność siebie',
        opis:
          'Kontakt wzrokowy, spokojny i wyraźny głos, postawa. Nawet jeśli w środku czujesz się niepewnie — sposób mówienia wpływa na to, jak prośba zostanie potraktowana. Unikaj kończenia rozmowy wzruszeniem ramion i „no dobra, nieważne".',
      },
      {
        nazwa: 'N — Negocjuj',
        opis:
          'Bądź gotów coś zaproponować w zamian i zapytaj drugą stronę o jej pomysł na rozwiązanie. Jeśli sprawa utknęła, czasem najlepszym ruchem jest odpuścić w tym momencie i wrócić do niej później.',
      },
    ],
  },
  {
    id: 'uprawomocnienie',
    nazwa: 'Uprawomocnienie',
    podtytul: 'Zakomunikowanie drugiej osobie, że jej uczucia i myśli mają sens w tej sytuacji.',
    szkola: ['dbt'],
    grupa: 'relacje',
    modulDBT: 'drogaSrodkowa',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    // NOTE: p. 343, most likely "jak uprawomocniać innych", was not sent. The
    // description covers the topic in general, but this is a gap worth filling —
    // parents are one of the app's target groups.
    wprowadzenie:
      'Uprawomocnienie to zakomunikowanie drugiej osobie — albo samemu sobie — że dane uczucie, myśl czy zachowanie mają sens w tej konkretnej sytuacji. Że są zrozumiałe, biorąc pod uwagę okoliczności.',
    kroki: [
      {
        nazwa: 'Uprawomocnienie to nie to samo co zgoda',
        opis:
          'Można w pełni rozumieć, skąd u kogoś wzięła się złość, i jednocześnie nie zgadzać się z tym, co ta osoba zrobiła. To rozróżnienie jest sednem tej umiejętności.',
      },
      {
        nazwa: 'Przeciwieństwem jest unieważnienie',
        opis:
          'Zakomunikowanie słowem lub zachowaniem, że czyjeś przeżycia są bezsensowne, przesadzone albo niewarte uwagi.',
      },
      {
        nazwa: 'Po co to robić',
        opis:
          'Łagodzi konflikty i wycisza silne emocje po obu stronach.\nPokazuje rozmówcy, że go słuchamy i nie oceniamy.\nPozwala się nie zgadzać bez przechodzenia do awantury.',
      },
      {
        // The document adds that this distinction is worth emphasising
        // especially in content written for parents. That is a note about which
        // text variant to write, not something to say to the reader, so it stays
        // a comment — it is what Technique.odbiorca is reserved for.
        nazwa: 'Uprawomocniać można tylko to, co rzeczywiście ma sens',
        opis: 'Można uprawomocnić emocję, nie uprawomocniając zachowania.',
      },
    ],
  },
  {
    id: 'samouprawomocnienie',
    nazwa: 'Samouprawomocnienie',
    podtytul: 'To samo, tylko skierowane do siebie: uznanie, że własne uczucia mają sens.',
    szkola: ['dbt'],
    grupa: 'relacje',
    modulDBT: 'drogaSrodkowa',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'To samo, tylko skierowane do siebie. Uznanie, że własne uczucia mają sens w danej sytuacji — bez tłumaczenia się z nich i bez oceniania siebie za to, że w ogóle się pojawiły.',
    kroki: [
      {
        nazwa: 'Zauważ, co się w tobie dzieje',
        opis: 'Świadomie zwróć uwagę na własne myśli, uczucia i reakcje ciała.',
      },
      {
        nazwa: 'Nazwij emocję bez wyroku',
        opis: '„Jestem teraz zły" zamiast „ale ze mnie idiota, że się tak nakręcam".',
      },
      {
        nazwa: 'Potraktuj to poważnie',
        opis: 'Emocje mogą się pojawiać i to jest w porządku. Smutek jest dozwolony.',
      },
      {
        nazwa: 'Poszukaj sensu',
        opis: '„To normalne, że nie mogę się skupić, skoro jestem pod taką presją."',
      },
      // Written in the document as a bullet with no separate explanation, so it
      // has no name of its own here either.
      { opis: 'Nie oceniaj samej emocji ani siebie za nią.' },
      {
        nazwa: 'Traktuj siebie uczciwie',
        opis:
          'Nie przepraszaj za to, co czujesz, i nie rezygnuj z własnego zdania tylko po to, żeby było spokojnie.',
      },
    ],
  },

  // === Grupa 4: Kiedy nie mogę tego zmienić (tygodnie) ===========================
  //
  // One technique today, and that is not an accident: "radykalna akceptacja"
  // from the missing materials 13-15 belongs here. See the TODO at the top.
  {
    id: 'dobrowolnosc',
    nazwa: 'Dobrowolność (i samowolność)',
    podtytul: 'Para przeciwstawnych postaw wobec rzeczywistości, której nie da się zmienić.',
    szkola: ['dbt'],
    grupa: 'akceptacja',
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie:
      'Para przeciwstawnych postaw wobec rzeczywistości. Warto je znać, bo rozpoznanie u siebie samowolności jest często pierwszym krokiem do wyjścia z zaklętego kręgu.',
    kroki: [
      {
        nazwa: 'Samowolność',
        opis:
          'Postawa „nie, nie i nie". Odmowa zaakceptowania sytuacji takiej, jaka jest. Uporczywe próby zmieniania czegoś, czego zmienić się nie da — albo odwrotnie: odmawianie zmiany tego, co koniecznie trzeba zmienić. To robienie czegokolwiek poza tym, co w danej chwili faktycznie działa.',
      },
      {
        nazwa: 'Dobrowolność',
        opis:
          'Zgoda na to, żeby rzeczywistość była taka, jaka jest, i pełne w niej uczestnictwo. Robienie dokładnie tego, czego wymaga sytuacja — nie mniej, nie więcej. Wsłuchanie się w siebie i wybranie tego, co skuteczne, zamiast tego, co podpowiada opór.',
      },
      {
        nazwa: 'Jak rozpoznać u siebie samowolność',
        opis:
          'Dwa sygnały są dość niezawodne — myśli skrajne i kategoryczne („nie ma mowy", „za nic w świecie") oraz napięte, usztywnione ciało. Kiedy je zauważysz, pomocne bywa pytanie: czego się w tej chwili obawiam?',
      },
    ],
  },

  // === Zakładka relaksacyjna =====================================================
  //
  // No `grupa` on either: the four groups are the DBT tab's second level, and
  // these two are not listed in that tab (they are steps of TIPP there).
  {
    // Its own entry in the relaxation tab, because the client listed paced
    // breathing and progressive muscle relaxation as relaxation techniques
    // herself — so this is her assignment, not our interpretation.
    //
    // Tagged 'relaksacyjne' ONLY, and deliberately not 'dbt': inside DBT this
    // skill is a step of TIPP, and a second row for it next to TIPP would read
    // as two different techniques. `modulDBT` still records where it comes from,
    // so the detail screen can name the module the therapist uses. The
    // description text comes from the shared const above, so it exists once in
    // the data whichever tab it is read in.
    id: 'miarowe-oddychanie',
    nazwa: 'Miarowe oddychanie',
    podtytul: 'Spowolnienie oddechu, z wydechem dłuższym niż wdech.',
    szkola: ['relaksacyjne'],
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie: `Pierwsze „P" w TIPP, a zarazem klasyczna technika oddechowa.\n\n${TIPP_WPROWADZENIE}`,
    kroki: [{ opis: OPIS_MIAROWE_ODDYCHANIE }],
  },
  {
    // Same as above: 'relaksacyjne' only — in DBT it is the second "P" of TIPP.
    id: 'progresywna-relaksacja-miesni',
    nazwa: 'Progresywna relaksacja mięśni',
    podtytul: 'Przejście przez ciało grupa mięśni po grupie: napięcie, potem pełne rozluźnienie.',
    szkola: ['relaksacyjne'],
    modulDBT: 'tolerancja',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    wprowadzenie: `Drugie „P" w TIPP, a zarazem klasyczna technika Jacobsona.\n\n${TIPP_WPROWADZENIE}`,
    kroki: [{ opis: OPIS_PROGRESYWNA_RELAKSACJA }],
  },
]
