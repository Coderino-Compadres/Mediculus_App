import type { DietTechnique } from '../types/dietTechnique'
import { ROUTES } from '../routes'

/**
 * The psychodietetic technique catalogue's content (§12).
 *
 * ── WHERE THE CONTENT COMES FROM ────────────────────────────────────────────
 * **The client wrote it, and this file transcribes it.** The source is her
 * "Techniki psychodietetyczne" (delivered 17.09.2026), transcribed verbatim
 * into `markdown/techniki-psychodietetyczne.md` — **read that file before
 * editing a word of this one.** It holds the original wording, before the
 * impersonal-form pass, and under it a list of every change the team made, so
 * that what is on screen can always be compared with what she sent. A
 * correction from her goes into the markdown first and into this file second.
 * The PDF itself is deliberately not in the repository.
 *
 * WHAT IS OURS AND WHAT IS HERS. Everything a patient reads here is hers: the
 * fifteen techniques, their order, their steps, their examples. Three things
 * are ours and are marked as such in the markdown: the parts of the text put
 * into impersonal forms (her file is written in the masculine throughout and
 * this module's readers are mostly women), the split of her continuous
 * paragraphs into steps, and `odsylacze`. **Do not improve her prose.** A
 * typo, an inconsistent name, a stray comma — those are listed in part III of
 * the markdown for her to decide on, not corrected here.
 *
 * ── WHAT THIS FILE DOES NOT HAVE ────────────────────────────────────────────
 * **No durations and no moments.** Her file gives fifteen techniques and not
 * one of either; "3 min · przed jedzeniem" on the artboard is the designers'
 * invention, the same case as the psychotherapy catalogue, which shows no time
 * either. Both fields are optional on the type and every entry below leaves
 * them out — see the TODO(klientka) under the array.
 *
 * **No placeholders.** The ten that used to be here are gone, and with them the
 * notice about content in preparation: `catalogueHasPlaceholders()` asks the
 * entries, so it answers `false` by itself now that no entry is `zastepczy`.
 * The two notices below are kept because the state is still reachable — a
 * technique added ahead of its text marks itself `zastepczy: true` and the
 * notice comes back on its own.
 *
 * ── WHY IT IS HARDCODED ─────────────────────────────────────────────────────
 * There is no backend for this catalogue and none is planned in this change.
 * It lives in its own module rather than inside the screen so that moving the
 * source to a database later is **one import swap, not a rewrite of the
 * screen**: `import { DIET_TECHNIQUES } from '../data/dietTechniques'` becomes
 * a fetch, and `utils/dietTechniques.ts` keeps answering the same two questions
 * ("which ones are published", "which one is this id"). Nothing here is fetched,
 * so no screen in this module needs a loading or an error state for it.
 *
 * ── HOW TO EDIT IT ──────────────────────────────────────────────────────────
 * 1. Every field is a literal on purpose — there are no shared constants
 *    between entries, so editing one technique cannot silently edit another.
 * 2. The order of the array is the order on screen, and it is her file's order,
 *    1-15. Nothing sorts it — the same arrangement as `data/crisisLines.ts`.
 * 3. **Nothing counts them.** Not the screens, not the types, not the tests.
 *    Fifteen is not a number this app knows, any more than ten was.
 * 4. Slugs are hand-written, derived from the name, without Polish diacritics,
 *    and they are in the URL — so changing one breaks a link somebody has
 *    already sent. Add rather than rename.
 *
 * ── HOW TO SEE THE EMPTY SCREEN ─────────────────────────────────────────────
 * Change `DIET_TECHNIQUES` at the bottom of this file from `TECHNIQUES` to
 * `[]`. That is the whole switch, and it is genuinely one line: `TECHNIQUES`
 * carries its own `export` precisely so that flipping the line below does not
 * leave it an unused binding and fail `npm run typecheck` (TS6133) under
 * `noUnusedLocals`. Nothing imports `TECHNIQUES`; the export exists for the
 * switch. Read the catalogue through `DIET_TECHNIQUES`, which is what the
 * screens read and what the switch actually empties.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * What the list says while any of its entries is still a placeholder.
 *
 * **Nothing shows it today**, and that is the point rather than an oversight:
 * `catalogueHasPlaceholders()` reads the entries, no entry below is
 * `zastepczy`, so the sentence took itself off the list in the same edit that
 * replaced the last placeholder. It stays in the file because the state stays
 * reachable — a technique recorded ahead of its text brings the notice back
 * without anybody remembering a flag.
 *
 * **"Część pozycji", not "poniższe pozycje".** The old wording was written when
 * a single flag meant all ten rows were placeholders at once; with the flag on
 * the entry the list can hold real techniques and unfinished ones side by side,
 * and a sentence claiming every row below is a placeholder would be false the
 * day the first real one lands. Which row is which is said on the row's own
 * screen — see PLACEHOLDER_NOTICE_TECHNIQUE.
 */
export const PLACEHOLDER_NOTICE_LIST =
  'Treść technik przygotowuje fundacja. Część pozycji na tej liście to miejsca na przyszłe opisy — nie są jeszcze ćwiczeniami do stosowania.'

/**
 * The same thing said about one technique, on its own screen.
 *
 * **A deep link is the whole reason this exists.** The address of a single
 * technique is exactly what gets copied, sent and pasted, and before this the
 * detail screen carried no mark of its own at all: everything that said "this
 * is not content yet" was the placeholder text itself, which stops being true
 * the moment somebody writes a plausible-looking name over it.
 */
export const PLACEHOLDER_NOTICE_TECHNIQUE =
  'Treść tej techniki przygotowuje fundacja. To, co widzisz poniżej, jest miejscem na przyszły opis — nie jest jeszcze ćwiczeniem do stosowania.'

/**
 * The client's fifteen techniques, in her order.
 *
 * Every entry is `dostepnosc: 'ogolna'`, `opisGotowy: true`, `zastepczy: false`.
 * The team's ruling on the content was that it ships as written — **including
 * the passages that could be read differently by somebody with an eating
 * disorder**. Nothing here is withheld, nothing is softened, and no technique
 * is marked as needing a specialist. If that is to change it is the client's
 * call and it changes in her text, not in this file.
 *
 * TODO(klientka): the techniques carry no duration and no moment of use,
 * because her file gives neither for any of the fifteen, and the figures on the
 * artboard ("3 min · przed jedzeniem") are the designers' own. Both fields are
 * optional on the type and both screens cope with them missing. The question
 * for her: should the techniques carry an estimated time and a moment at all,
 * and if so which — she is the only person who can answer it without inventing
 * a number.
 *
 * TODO(klientka): one technique from the mockup's list needs a decision before
 * it is written, and it is the reason `dostepnosc` exists on this type at all.
 * **The content she delivered does not include this technique at all** — there
 * is no "Dziennik napadów objadania" among the fifteen — so the question below
 * is still open and is now also a question about whether the technique exists.
 * The design note on §12 of the first mockup set reads: "«Dziennik napadów
 * objadania» jest na liście technik, ale jego forma wymaga osobnej rozmowy —
 * dla części pacjentek prowadzenie takiego dziennika bywa objawem, nie
 * narzędziem. Proponujemy udostępniać go wyłącznie po ustaleniu ze
 * specjalistą." Setting `dostepnosc: 'wymagaSpecjalisty'` is how that is
 * expressed here — **but today a withheld technique disappears without a trace,
 * from the tabs and from its own URL alike** (`utils/dietTechniques.ts`,
 * `isPublished`), so a patient who was told about it by their dietitian and
 * typed the address gets "nie znaleziono". Whether that is the right behaviour
 * for this one technique — as opposed to a row that says it is introduced at a
 * visit, the way the psychotherapy catalogue names TIPP's "Temperatura" without
 * explaining it — is a question for the client, not for us. The psychotherapy
 * catalogue has the same open question (see `types/technique.ts`).
 */
export const TECHNIQUES: DietTechnique[] = [
  {
    // The lead-in to the four questions sits in `wprowadzenie` rather than in a
    // step: it is the sentence that ends in the colon the steps answer, and it
    // reads directly above the "Kroki" card.
    //
    // THE CLOSING SENTENCE IS `notka`, NOT A FIFTH STEP. It was one until the
    // field existed, and the circle beside it read "5" — so the four letters of
    // the mnemonic were followed by a digit, and the screen spelled "H A L T 5"
    // to anybody reading the markers.
    id: 'halt',
    nazwa: 'HALT',
    wprowadzenie:
      'Pomaga rozpoznać, czy potrzeba jedzenia wynika z głodu fizycznego, czy z innych potrzeb emocjonalnych.\nZanim sięgniesz po jedzenie poza zaplanowanym posiłkiem, zatrzymaj się i zadaj sobie cztery pytania:',
    kroki: [
      { etykieta: 'H', nazwa: 'H – Hungry', opis: 'Czy odczuwam głód?' },
      { etykieta: 'A', nazwa: 'A – Angry', opis: 'Czy czuję złość, zdenerwowanie lub frustrację?' },
      {
        etykieta: 'L',
        nazwa: 'L – Lonely',
        opis: 'Czy czuję samotność lub potrzebę kontaktu z kimś?',
      },
      { etykieta: 'T', nazwa: 'T – Tired', opis: 'Czy czuję zmęczenie?' },
    ],
    notka:
      'Jeśli nie odczuwasz głodu fizycznego, zastanów się, jaką inną potrzebę możesz w tej chwili zaspokoić.',
    przyklad:
      'Masz ochotę na słodycze po stresującym dniu. Sprawdzasz HALT i zauważasz, że przede wszystkim czujesz zmęczenie. Zamiast automatycznie sięgać po słodycze, możesz najpierw odpocząć.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // Her file numbers these 1-4 and each one opens with its letter, so the
    // number is the letter: `etykieta` carries S/T/O/P and the `<ol>` stops
    // drawing its own. The descriptions start lower-case because in her file
    // they follow a colon — left as she wrote them.
    id: 'stop',
    nazwa: 'STOP',
    wprowadzenie: 'Przerwanie automatycznego zachowania i podjęcie bardziej świadomej decyzji.',
    kroki: [
      { etykieta: 'S', nazwa: 'S – Stop', opis: 'zatrzymaj się.' },
      { etykieta: 'T', nazwa: 'T – Take a breath', opis: 'weź kilka spokojnych oddechów.' },
      { etykieta: 'O', nazwa: 'O – Observe', opis: 'zauważ swoje myśli, emocje, głód i sytuację.' },
      { etykieta: 'P', nazwa: 'P – Proceed', opis: 'wybierz świadomie, co zrobisz dalej.' },
    ],
    przyklad:
      'Chcesz automatycznie zjeść przekąskę podczas oglądania telewizji. Robisz STOP i sprawdzasz, czy odczuwasz głód, czy po prostu masz nawyk podjadania.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // A continuous paragraph in her file, split at sentence boundaries: each
    // sentence is the next thing you do at the table.
    id: 'mindful-eating',
    nazwa: 'Mindful eating – uważne jedzenie',
    wprowadzenie:
      'Zwiększenie świadomości podczas jedzenia i lepsze rozpoznawanie sygnałów głodu oraz sytości.',
    kroki: [
      { opis: 'Odłóż telefon i inne rozpraszacze.' },
      { opis: 'Przed rozpoczęciem posiłku zwróć uwagę na jego wygląd i zapach.' },
      { opis: 'Jedz wolniej, dokładnie przeżuwaj i skupiaj się na smaku oraz konsystencji.' },
      { opis: 'W trakcie posiłku obserwuj sygnały swojego organizmu.' },
    ],
    przyklad:
      'Podczas jedzenia kanapki skupiasz się na jej smaku i teksturze zamiast jeść przed ekranem.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // THE SCALE IS ONE STEP, NOT FIVE. Its five ranges are a measure, not a
    // sequence — numbering them inside the `<ol>` would tell a reader to go
    // through them in order. What you do with the scale is the second step.
    //
    // ── DO NOT MOVE STEP 2 INTO `notka`. IT HAS BEEN THERE AND IT CAME BACK. ──
    // In the source this technique has **exactly the same shape** as HALT and
    // the food diary: a lead-in ending in a colon, a list, then one more
    // sentence. Going by that shape alone, "Przed posiłkiem oceń swój głód, a po
    // posiłku – poziom sytości." looks like the same kind of trailing note their
    // last sentences are, and it was written as one for a while.
    //
    // **THE SHAPE IS THE SAME AND THE FUNCTION IS NOT, AND THE FUNCTION IS WHAT
    // DECIDES.** HALT's last sentence tells you what to do when the answer is
    // "no", and the food diary's says what the diary is *not* for; both close a
    // thought the steps opened, and both are still true if you never read them.
    // This one is an instruction — **the only instruction in the technique.**
    // Everything above it is a measuring scale, which is a thing to read off
    // rather than a thing to do. As a note it left the "Kroki" card without a
    // single verb in it, and put the one thing a patient is actually asked to do
    // below a rule, greyed out, in the place this screen uses for asides.
    //
    // The test for `notka` is **"does this sentence close a thought, or is it an
    // instruction?"** — never "does it come after a list?". See the note on
    // `notka` in `types/dietTechnique.ts`.
    //
    // TODO(klientka): **the example contradicts the scale it belongs to, and a
    // patient can follow this technique backwards because of it.** The scale
    // above reads "0 – bardzo silny głód", "6–7 – komfortowa sytość",
    // "8–10 – przejedzenie" — low is hungry, high is full. The example reads
    // "Przed obiadem oceniasz głód na 7/10", which on that scale is not hunger
    // before dinner but near-satiety. Either the example means "7/10" in the
    // everyday sense of "very hungry", in which case it is reading the scale
    // upside down, or the scale is meant to run the other way and its wording
    // is wrong. **Both the scale and the example are transcribed exactly as she
    // wrote them and neither is to be "fixed" here** — it is her content and
    // only she can say which of the two is the mistake. See §8 of the report
    // and part III of `markdown/techniki-psychodietetyczne.md`.
    id: 'skala-glodu-i-sytosci',
    nazwa: 'Skala głodu i sytości',
    wprowadzenie: 'Nauka rozpoznawania sygnałów wysyłanych przez organizm.\nUżyj skali od 0 do 10:',
    kroki: [
      {
        opis: '0 – bardzo silny głód\n2–3 – wyraźny głód\n4–5 – neutralnie\n6–7 – komfortowa sytość\n8–10 – przejedzenie',
      },
      { opis: 'Przed posiłkiem oceń swój głód, a po posiłku – poziom sytości.' },
    ],
    przyklad:
      'Przed obiadem oceniasz głód na 7/10. Po posiłku sprawdzasz, czy sytość jest komfortowa, zamiast jeść automatycznie do momentu przejedzenia.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // One of the three techniques with `odsylacze`: this one describes, item by
    // item, what §04's meal form already asks for, and the pattern its example
    // notices ("regularnie podjadasz między 21:00 a 22:00") is what §07's
    // history is for. Two links, which is the most this field takes.
    // Her closing sentence is `notka`, not an eighth step: it is a caveat about
    // what the diary is for, and as a step it stood numbered among the seven
    // things to write down, as though it were one of them.
    id: 'dzienniczek-zywieniowy',
    nazwa: 'Dzienniczek żywieniowy',
    wprowadzenie: 'Zwiększenie świadomości własnych nawyków żywieniowych.\nZapisuj:',
    kroki: [
      { opis: 'godzinę,' },
      { opis: 'co i ile jesz,' },
      { opis: 'gdzie jesz,' },
      { opis: 'z kim jesz,' },
      { opis: 'poziom głodu,' },
      { opis: 'poziom sytości,' },
      { opis: 'dodatkowe przekąski i napoje.' },
    ],
    notka: 'Nie służy on do oceniania ani karania się, ale do obserwowania wzorców.',
    przyklad: 'Zauważasz, że przez kilka dni regularnie podjadasz między 21:00 a 22:00.',
    odsylacze: [
      { trasa: ROUTES.dietMeal, etykieta: 'Zapisz posiłek w dzienniczku' },
      { trasa: ROUTES.dietJournals, etykieta: 'Przejrzyj historię dzienniczków' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // THE ONE CROSS-MODULE LINK IN THE CATALOGUE. The emotion diary is the
    // psychotherapy module's screen, not this one's — there is no second
    // emotion diary under /diet, and building one to avoid a link would be two
    // diaries for one thing. Following it swaps the menu and the nadtytuł, so
    // the label says where it goes in the words HeaderMenu already uses.
    // The six questions stay in the masculine: four of them are past-tense
    // first person with no minimal impersonal form, and rewriting one of the
    // six would leave the list speaking in two voices. Part II.1 of the
    // markdown has the whole list for the client to rule on.
    id: 'dzienniczek-emocji',
    nazwa: 'Dzienniczek emocji',
    wprowadzenie: 'Rozpoznanie związku między emocjami a jedzeniem.\nPrzed lub po jedzeniu zapisz:',
    kroki: [
      { opis: 'Co się wydarzyło?' },
      { opis: 'Co poczułem?' },
      { opis: 'Jak silna była emocja w skali 0–10?' },
      { opis: 'Na co miałem ochotę?' },
      { opis: 'Co zrobiłem?' },
      { opis: 'Jak się czułem później?' },
    ],
    przyklad:
      '„Kłótnia w pracy → złość 8/10 → ochota na słodycze → zjadłem czekoladę → chwilowa ulga".',
    odsylacze: [
      {
        trasa: ROUTES.diaryEntry,
        etykieta: 'Dodaj wpis w dzienniczku emocji — w części psychoterapeutycznej',
      },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    id: 'rozpoznawanie-jedzenia-emocjonalnego',
    nazwa: 'Rozpoznawanie jedzenia emocjonalnego',
    wprowadzenie:
      'Odróżnienie głodu fizycznego od jedzenia wywołanego emocjami.\nPrzed jedzeniem sprawdź:',
    kroki: [
      { opis: 'Czy głód narastał stopniowo?' },
      { opis: 'Czy zjadłbym normalny posiłek?' },
      { opis: 'Czy mam ochotę tylko na konkretny produkt?' },
      { opis: 'Czy jedzenie pojawiło się po stresie, nudzie lub innej emocji?' },
    ],
    przyklad:
      'Nie odczuwasz głodu, ale po stresującej rozmowie masz nagłą, silną ochotę na konkretną przekąskę.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // A continuous paragraph, split at sentence boundaries — the four sentences
    // are four successive moves.
    id: 'technika-odraczania',
    nazwa: 'Technika odraczania',
    wprowadzenie: 'Zmniejszenie impulsywnego reagowania na zachcianki.',
    kroki: [
      { opis: 'Kiedy pojawia się silna ochota na jedzenie, nie zakazuj sobie go.' },
      { opis: 'Powiedz: „Mogę to zjeść, ale najpierw poczekam 10 minut".' },
      {
        opis: 'W tym czasie wykonaj inną czynność, np. napij się wody, przejdź się lub porozmawiaj z kimś.',
      },
      { opis: 'Po 10 minutach ponownie oceń swoją potrzebę.' },
    ],
    przyklad:
      'Masz ochotę na słodycze → ustawiasz timer na 10 minut → po tym czasie sprawdzasz, czy ochota nadal jest taka sama.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // Two steps, not three: the instruction and the sentence it asks you to
    // write are one move (the template completes the colon), and what the plan
    // has to be like is her own second paragraph.
    id: 'technika-jesli-to',
    nazwa: 'Technika „Jeśli–to"',
    wprowadzenie:
      'Przygotowanie konkretnej reakcji na sytuacje, w których zwykle pojawia się problematyczne zachowanie.',
    kroki: [
      { opis: 'Stwórz zdanie:\n„Jeśli wydarzy się X, to zrobię Y."' },
      { opis: 'Plan powinien być konkretny i możliwy do wykonania.' },
    ],
    przyklad:
      '„Jeśli będę mieć ochotę podjadać z nudów podczas pracy, to najpierw zrobię 5-minutową przerwę."',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // The example is a pair of quoted thoughts, kept exactly as she wrote them
    // — including the masculine "Zjadłem". A patient's own thought put into
    // impersonal forms stops being a thought anybody recognises.
    id: 'restrukturyzacja-poznawcza',
    nazwa: 'Restrukturyzacja poznawcza',
    wprowadzenie: 'Zmiana niekorzystnych sposobów myślenia związanych z jedzeniem.',
    kroki: [
      { opis: 'Zauważ automatyczną myśl.' },
      { opis: 'Zapisz ją.' },
      { opis: 'Zastanów się, czy jest faktem.' },
      { opis: 'Poszukaj dowodów „za" i „przeciw".' },
      { opis: 'Sformułuj bardziej realistyczną myśl.' },
    ],
    przyklad:
      'Myśl: „Zjadłem ciastko, więc cała dieta jest bez sensu."\nNowa myśl: „Zjadłem ciastko. To pojedyncza sytuacja i mogę wrócić do swojego planu przy kolejnym posiłku."',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // One sentence in her file, so one step: splitting "zatrzymaj się" from
    // "poszukaj rozwiązania pośredniego" would be a division she did not make.
    id: 'praca-z-mysleniem-wszystko-albo-nic',
    nazwa: 'Praca z myśleniem „wszystko albo nic"',
    wprowadzenie: 'Odejście od perfekcjonizmu żywieniowego.',
    kroki: [
      {
        opis: 'Kiedy pojawia się myśl „albo idealnie, albo wcale", zatrzymaj się i poszukaj rozwiązania pośredniego.',
      },
    ],
    przyklad:
      '„Zjadłem nieplanowaną pizzę, więc cały dzień jest stracony" zamień na:\n„Zjadłem pizzę. Mogę normalnie zjeść kolejny posiłek bez dalszego objadania się."',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // THE LIST OF THINGS TO MONITOR IS ONE STEP, for the reason the hunger
    // scale is one: "Możesz monitorować np.:" introduces examples, not moves,
    // and six numbered steps would say to do them in order. It differs from
    // technique 5, whose "Zapisuj:" opens her "Jak wykonać" and so fitted in
    // `wprowadzenie`; this lead-in stands in the middle of the section and
    // moving it up would reorder her text. Flagged for review in the markdown.
    //
    // Two links out of the six things she names: the meals, the snacking and
    // the hunger level are §07's history, the activity and the sleep are §09.
    // "Emocje" would be a third and the field takes two — see the report.
    id: 'samo-monitorowanie',
    nazwa: 'Samo Monitorowanie',
    wprowadzenie: 'Świadome obserwowanie własnych zachowań i postępów.',
    kroki: [
      { opis: 'Regularnie zapisuj wybrane zachowanie, które chcesz zmienić.' },
      { opis: 'Nie oceniaj się – zbieraj informacje.' },
      {
        opis: 'Możesz monitorować np.:\nliczbę posiłków,\npodjadanie,\npoziom głodu,\nemocje,\naktywność fizyczną,\nsen.',
      },
    ],
    przyklad: 'Przez tydzień zaznaczasz, ile razy dziennie jesz bez odczuwania głodu.',
    odsylacze: [
      { trasa: ROUTES.dietJournals, etykieta: 'Przejrzyj historię dzienniczków' },
      { trasa: ROUTES.dietActivitySleep, etykieta: 'Zapisz aktywność i sen' },
    ],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // Three steps: two sentences that are two different things (pick the
    // behaviour, then what the goal has to be like), and her "Zamiast / Lepiej"
    // pair, which is one contrast and stays one step.
    id: 'male-cele',
    nazwa: 'Małe cele',
    wprowadzenie: 'Stopniowe wprowadzanie trwałych zmian.',
    kroki: [
      { opis: 'Wybierz jedno konkretne zachowanie.' },
      { opis: 'Cel powinien być prosty, mierzalny i możliwy do wykonania.' },
      {
        opis: 'Zamiast: „Od teraz będę się zdrowo odżywiać."\nLepiej: „Przez najbliższy tydzień do każdego obiadu dodam porcję warzyw."',
      },
    ],
    przyklad: 'Jeden mały cel realizowany przez tydzień, a następnie jego ocena.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    // Two steps — "Następnie" in her second sentence names them as successive.
    id: 'modyfikacja-srodowiska',
    nazwa: 'Modyfikacja środowiska',
    wprowadzenie: 'Ułatwienie realizacji pożądanych zachowań poprzez zmianę otoczenia.',
    kroki: [
      { opis: 'Zastanów się, co w Twoim otoczeniu wywołuje automatyczne zachowania.' },
      { opis: 'Następnie zmień dostępność produktów lub sposób organizacji przestrzeni.' },
    ],
    przyklad:
      'Produkty, które często jesz impulsywnie, nie są przechowywane w widocznym miejscu, a przygotowane zdrowe przekąski są łatwo dostępne.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
  {
    id: 'samowspolczucie',
    nazwa: 'Samowspółczucie',
    wprowadzenie:
      'Ograniczenie poczucia winy i nadmiernej krytyki po potknięciu.\nPo trudnej sytuacji:',
    kroki: [
      { opis: 'Nazwij, co się wydarzyło.' },
      { opis: 'Uznaj swoje emocje.' },
      { opis: 'Unikaj obrażania i karania siebie.' },
      { opis: 'Zastanów się, czego możesz nauczyć się z sytuacji.' },
      { opis: 'Wróć do normalnego działania bez stosowania kar.' },
    ],
    przyklad:
      'Zamiast „Jestem beznadziejny, znowu wszystko zepsułem", pomyśl: „To był trudny moment. Sprawdzę, co go wywołało i wrócę do swoich zwykłych nawyków."',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
  },
]

/**
 * What the screens read. `[]` means the catalogue has nothing to show — see the
 * switch note at the top of this file.
 */
export const DIET_TECHNIQUES: DietTechnique[] = TECHNIQUES
