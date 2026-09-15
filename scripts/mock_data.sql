\set ON_ERROR_STOP on
\connect user_db

INSERT INTO user_role (id_user_role, name) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'patient'),
    ('a0000000-0000-0000-0000-000000000002', 'specjalista'),
    ('a0000000-0000-0000-0000-000000000003', 'rodzic')
ON CONFLICT (id_user_role) DO NOTHING;

INSERT INTO "user" (id_user, id_user_role, email, password_hash, name, surname, date_of_birth) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'anna.kowalska@example.com',    'mock_hash_placeholder', 'Anna',      'Kowalska',      '1985-03-12'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'piotr.nowak@example.com',      'mock_hash_placeholder', 'Piotr',     'Nowak',         '1979-11-02'),
    ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'jan.wisniewski@example.com',   'mock_hash_placeholder', 'Jan',       'Wiśniewski',    '1992-07-23'),
    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'maria.wisniewska@example.com', 'mock_hash_placeholder', 'Maria',     'Wiśniewska',    '1988-01-15'),
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'zofia.wisniewska@example.com', 'mock_hash_placeholder', 'Zofia',     'Wiśniewska',    '2014-09-05'),
    ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'tomasz.zielinski@example.com', 'mock_hash_placeholder', 'Tomasz',    'Zieliński',     '1995-05-30'),
    ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'kasia.lewandowska@example.com','mock_hash_placeholder', 'Katarzyna', 'Lewandowska',   '1990-12-08')
ON CONFLICT (id_user) DO NOTHING;

-- Demo account, meant to actually be logged into: test@wp.pl / Haslo123!
--
-- Unlike every row above it carries a real PBKDF2 hash. 'mock_hash_placeholder'
-- is not a hash at all, so those accounts can never authenticate -- the login
-- serializer survives the string rather than crashing on it, but no password
-- will ever match. Regenerate this one with:
--   python backend/manage.py shell -c \
--     "from django.contrib.auth.hashers import make_password; print(make_password('Haslo123!'))"
--
-- The consent timestamps are set because this account is used through the UI,
-- and RODO art. 7(1) makes us able to show when consent was given.
INSERT INTO "user" (id_user, id_user_role, email, password_hash, name, surname, date_of_birth, data_consent_at, services_consent_at) VALUES
    ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'test@wp.pl', 'pbkdf2_sha256$1500000$kCb20CO2XUI5mL8XtPpCE6$0j30lRad1AqdqXNSx/mTlMGQj55wsfUyjH8dTX0WttE=', 'Test', 'Testowy', '1994-06-18', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id_user) DO NOTHING;

-- Demo specialist, meant to actually be logged into:
--   anna.kowalska@example.com / Haslo123!
--
-- THIS ROW IS THE BOOTSTRAP, not a convenience. A specialist account can only
-- be created by another specialist (POST /api/specialist/colleagues/, see
-- backend/core/colleagues.py) -- the registration form has no such account type
-- any more, because the app cannot check anybody's qualifications and a
-- colleague can. Which means a fresh database has no way into the specialist
-- panel at all unless one specialist exists already, and this is that one. On a
-- real deployment it is the same act: one row by hand, then every further
-- account is created inside the app.
--
-- An UPDATE rather than a value in the INSERT above, so this stays idempotent
-- next to that statement's ON CONFLICT DO NOTHING. The hash is the demo
-- account's, i.e. the same password -- it is a mock file, and one password to
-- remember is the point of it. The consents are set for the same reason the
-- demo patient's are: this account is used through the UI, and without them it
-- lands on the consent screen instead of the panel (which is correct behaviour
-- and a poor first impression of a seeded database).
UPDATE "user" SET
    password_hash = 'pbkdf2_sha256$1500000$kCb20CO2XUI5mL8XtPpCE6$0j30lRad1AqdqXNSx/mTlMGQj55wsfUyjH8dTX0WttE=',
    data_consent_at = CURRENT_TIMESTAMP,
    services_consent_at = CURRENT_TIMESTAMP
WHERE id_user = 'b0000000-0000-0000-0000-000000000001';

INSERT INTO specjalist (id_user, specjalization) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Psychoterapia'),
    ('b0000000-0000-0000-0000-000000000002', 'Dietetyka')
ON CONFLICT (id_user) DO NOTHING;

-- specjalist_accepted_at is set for the same reason parent_child.accepted_at is
-- below: these are established care relationships, and the patient's agreement
-- is what an assigned specialist means (see core/specialist.py). A NULL would
-- read as "assigned, and nobody knows when or whether the patient agreed",
-- which is the one state the invitation flow exists to avoid. Nothing is
-- pending here: id_specjalist_pending stays NULL on every row, so the seeded
-- patients show no invitation card.
--
-- DO UPDATE rather than DO NOTHING, unlike most of the seed: the column arrived
-- (migration 0011) after these rows did, so a database seeded earlier already
-- holds them with the timestamp missing.
INSERT INTO patient (id_user, id_medical, id_specjalist, specjalist_accepted_at, is_child) VALUES
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2025-01-15 10:00:00+01', FALSE),
    ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', '2025-01-15 10:00:00+01', TRUE),
    ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '2025-01-15 10:00:00+01', FALSE),
    ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', '2025-01-15 10:00:00+01', FALSE),
    ('b0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', '2025-01-15 10:00:00+01', FALSE)
ON CONFLICT (id_user) DO UPDATE SET
    id_specjalist = EXCLUDED.id_specjalist,
    specjalist_accepted_at = EXCLUDED.specjalist_accepted_at;

-- The diet module's week anchor, cleared so it re-latches onto whatever the
-- diet section of this file has seeded.
--
-- **A DIET WEEK IS COUNTED FROM THE PATIENT'S FIRST ENTRY, AND THE DAY IT
-- STARTS ON IS STORED** (`patient.diet_week_start`, migration 0019). It is
-- written once, on the first read of /api/diet/reports/, and then never moved —
-- deliberately, because an anchor that drifted would renumber every report a
-- real patient has, and with it every bookmark and every reference two people
-- in a consulting room might make to one.
--
-- That is right for a real account and wrong for a seed. Everything in the diet
-- section below is relative to CURRENT_DATE, so it moves forward every day; an
-- anchor latched during an earlier run points at an absolute date the seed no
-- longer reaches, and the reports come out cut at boundaries matching nothing
-- in the data. The symptom is a report list that looks entirely plausible and
-- is wrong, which is the worst kind to debug.
--
-- NULL rather than a date computed here: `core/diet_reports.latch_week_start`
-- owns the rule, and a seed with a second opinion about where a week starts is
-- how the two quietly disagree. `seed_demo_diary` clears it for the same reason.
UPDATE patient SET diet_week_start = NULL
WHERE id_medical = 'c0000000-0000-0000-0000-000000000005';

-- accepted_at is set: this is an established family, not a pending request. A
-- NULL here would mean the guardian has not answered yet, which would leave the
-- seeded child's account blocked (see core/guardian.py).
--
-- DO UPDATE rather than DO NOTHING, unlike every other seed below: the column
-- arrived (migration 0007) after this row did, so a database seeded earlier
-- already holds it with accepted_at NULL and re-running the script has to fix
-- that instead of skipping it.
INSERT INTO parent_child (id_parent_child, id_parent, id_child, accepted_at) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005', '2025-01-15 10:00:00+01')
ON CONFLICT (id_parent_child) DO UPDATE SET accepted_at = EXCLUDED.accepted_at;

-- MEDICAL DB

\connect medical_db

-- These four rows predate the catalogue columns (migration 0013) and are left
-- as they are: they carry a name and a sentence, not the structured content the
-- catalogue's detail screen renders, so description_ready stays FALSE and they
-- do not appear in the patient's "Techniki terapeutyczne". They exist for
-- raport.id_technique to point at -- which is what the home screen's suggestion
-- card reads. Backfilling them with invented steps would put unreviewed
-- clinical text in front of patients; the real catalogue is in
-- frontend/src/data/techniques.ts, awaiting the specialists' review.
INSERT INTO technique (id_technique, name, type, description) VALUES
    (1, 'Body scan',            'DBT', 'Skanowanie ciała w celu zwiększenia świadomości somatycznej.'),
    (2, 'Dziennik emocji',      'CBT', 'Codzienne zapisywanie emocji i wyzwalających je sytuacji.'),
    (3, 'Technika 5-4-3-2-1',   'DBT', 'Technika uziemiająca wykorzystująca pięć zmysłów.')
ON CONFLICT (id_technique) DO NOTHING;

-- Explicit ids above leave the identity sequence at 1; without this the first
-- ORM-created Technique would collide with an existing primary key.
SELECT setval(
    pg_get_serial_sequence('technique', 'id_technique'),
    (SELECT MAX(id_technique) FROM technique)
);

INSERT INTO diary (id_diary, id_medical, current_mood, current_strongest_emotion, stress_level, energy_level, situation, situation_place, time_of_day, how_situation_handled, notes) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'neutralny', 'niepokój',    4, 5, 'Rozmowa z przełożonym o projekcie', 'praca',    'noon',    'Głębokie oddychanie przed rozmową',      'Poszło lepiej niż się bałem.'),
    ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'dobry',     'spokój',      2, 7, 'Spacer wieczorny',                  'park',     'evening', 'Brak, dzień był spokojny',               NULL),
    ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'smutny',    'frustracja',  6, 3, 'Kłótnia z koleżanką w szkole',      'szkoła',   'noon',    'Rozmowa z rodzicem wieczorem',            'Wciąż o tym myślę.'),
    ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'dobry',     'radość',      1, 8, 'Udany trening na siłowni',           'siłownia', 'evening', 'Brak potrzeby',                          NULL),
    ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'neutralny', 'zmęczenie',   5, 4, 'Długi dzień w pracy zdalnej',        'dom',      'noon',    'Krótka przerwa na herbatę',               'Potrzebuję więcej snu.')
ON CONFLICT (id_diary) DO NOTHING;

INSERT INTO mood_scale (id_diary, sadness_scale, anxiety_scale, anger_scale, happiness_scale, guilt_scale, frustration_scale, helplessness_scale)
SELECT v.id_diary, v.sadness_scale, v.anxiety_scale, v.anger_scale, v.happiness_scale, v.guilt_scale, v.frustration_scale, v.helplessness_scale
FROM (VALUES
    ('e0000000-0000-0000-0000-000000000001'::uuid, 2, 5, 1, 4, 1, 2, 1),
    ('e0000000-0000-0000-0000-000000000002'::uuid, 1, 1, 0, 7, 0, 0, 0),
    ('e0000000-0000-0000-0000-000000000003'::uuid, 6, 4, 5, 1, 2, 7, 3),
    ('e0000000-0000-0000-0000-000000000004'::uuid, 0, 1, 0, 8, 0, 0, 0),
    ('e0000000-0000-0000-0000-000000000005'::uuid, 3, 3, 2, 3, 1, 3, 2)
) AS v(id_diary, sadness_scale, anxiety_scale, anger_scale, happiness_scale, guilt_scale, frustration_scale, helplessness_scale)
WHERE NOT EXISTS (SELECT 1 FROM mood_scale m WHERE m.id_diary = v.id_diary);

-- Roughly a month of entries for the demo account (test@wp.pl, id_medical
-- c0...05), so the home screen has a chart, a streak and averages worth looking
-- at instead of one flat day.
--
-- `created_at` is relative to when this script runs, not a fixed date: the
-- dashboard's window is a rolling seven days ending today, so hard-coded dates
-- would fall out of it and the chart would be empty by next week. The last two
-- digits of each id_diary are how many days back the entry sits.
--
-- The shape is deliberate rather than random:
--   * a month ago it is bad (helplessness, sadness, stress 7-8, energy 1-3) and
--     it improves towards today (calm, energy 7-9) -- so the charts show a
--     recovery instead of noise
--   * four days back to back ending today   -> a streak of 4
--   * gaps 4, 9, 10, 17, 23 and 28 days back -> days with no entry, which every
--     real diary has, and what stops the streak at 4 rather than a month
--   * a different declared emotion most days -> bars in different colours,
--     'Wstyd' and 'Spokój' included, which only got scale columns in 0005
--   * a `time_of_day` on all but three days, with the hard days landing in the
--     evening and at night and the calmer ones in the morning and at noon -> the
--     analysis screen's heatmap has a pattern to draw rather than noise. The
--     count matters: it unlocks at HEATMAP_MIN_DAYS (14) days that answered
--     *that* question, not 14 entries, so seeding a handful would leave the grid
--     locked on a database with a month of entries in it. The three days without
--     an answer are the point too -- the question is optional, and a seed where
--     every single day answers it would not look like a real diary
--
-- `current_mood` uses the five labels the entry form writes ('Bardzo źle' ..
-- 'Bardzo dobrze') and `situation_place` uses chips from utils/triggers.ts, so
-- re-opening one of these in the form redraws it exactly as it was.
--
-- The seven most recent days carry the full CBT/ABC breakdown; the rest are
-- mood, emotions and levels only, which is how a diary actually gets filled on
-- an average evening.
INSERT INTO diary (id_diary, id_medical, current_mood, current_strongest_emotion,
                   stress_level, energy_level, tension_level,
                   situation, situation_place, time_of_day, emotion_note, thought,
                   how_situation_handled, notes, risky_behavior_note, created_at) VALUES
    ('e0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000005', 'Dobrze',        'Spokój',     2, 7, 2,
     'Wieczór bez planów, pierwszy taki od tygodnia.', 'Dom', 'evening', 'Ulga i spokój.', 'Chyba wracam do siebie.',
     'Nic nie musiałem robić — po prostu odpoczywałem.', 'Dobry dzień. Warto zapamiętać, co go takim zrobiło.', NULL,
     now()),
    ('e0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Lęk',        5, 5, 6,
     'Jutro prezentacja dla całego zespołu.', 'Praca', 'evening', 'Ucisk w klatce, płytki oddech.', 'Na pewno się pomylę i wszyscy to zobaczą.',
     'Przećwiczyłem wstęp na głos trzy razy.', 'Pomogło mniej, niż liczyłem.', NULL,
     now() - INTERVAL '1 day'),
    ('e0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Złość',      7, 3, 8,
     'Kłótnia o podział obowiązków, podniesione głosy.', 'Dom', 'evening', 'Gorąco, ręce się trzęsły.', 'Nikt się tu ze mną nie liczy.',
     'Wyszedłem z pokoju, zanim powiedziałem coś gorszego.', 'Wieczorem nie umiałem tego odpuścić.', 'Wieczorem dwa piwa, żeby się uspokoić.',
     now() - INTERVAL '2 days'),
    ('e0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Smutek',     6, 2, 5,
     'Cały dzień w łóżku, odwołałem spotkanie ze znajomymi.', 'Sam/sama w domu', 'morning', 'Ciężko, pusto.', 'Nie mam po co wstawać.',
     'Nic. Zasnąłem po południu.', NULL, NULL,
     now() - INTERVAL '3 days'),
    ('e0000000-0000-0000-0000-000000000105', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Frustracja', 5, 4, 6,
     'Trzecia poprawka tego samego dokumentu.', 'Praca', 'noon', 'Napięcie w szczęce.', 'To i tak nie ma znaczenia.',
     'Zrobiłem przerwę i wyszedłem na dwór.', 'Przerwa pomogła bardziej niż myślałem.', NULL,
     now() - INTERVAL '5 days'),
    ('e0000000-0000-0000-0000-000000000106', 'c0000000-0000-0000-0000-000000000005', 'Bardzo dobrze', 'Radość',     1, 9, 1,
     'Urodziny przyjaciela, dużo śmiechu.', 'Wśród ludzi', 'evening', 'Lekko, ciepło.', 'Dobrze, że jednak poszedłem.',
     'Zostałem dłużej, niż planowałem.', 'Najlepszy dzień od dawna.', NULL,
     now() - INTERVAL '6 days'),
    ('e0000000-0000-0000-0000-000000000107', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Wstyd',      4, 4, 4,
     'Powiedziałem coś niezręcznego na spotkaniu i wszyscy zamilkli.', 'Praca', 'noon', 'Gorące uszy.', 'Wyszedłem na idiotę.',
     'Przeprosiłem i zmieniłem temat.', 'Wracało do mnie jeszcze wieczorem.', NULL,
     now() - INTERVAL '7 days')
ON CONFLICT (id_diary) DO NOTHING;

INSERT INTO diary (id_diary, id_medical, current_mood, current_strongest_emotion,
                   stress_level, energy_level, tension_level, time_of_day, notes, created_at) VALUES
    ('e0000000-0000-0000-0000-000000000108', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Lęk',            5, 5, 5, 'night',   NULL,                                now() - INTERVAL '8 days'),
    ('e0000000-0000-0000-0000-000000000111', 'c0000000-0000-0000-0000-000000000005', 'Dobrze',        'Spokój',         3, 6, 3, 'noon',    'Spokojny weekend.',                 now() - INTERVAL '11 days'),
    ('e0000000-0000-0000-0000-000000000112', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Frustracja',     5, 4, 6, 'noon',    NULL,                                now() - INTERVAL '12 days'),
    ('e0000000-0000-0000-0000-000000000113', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Poczucie winy',  6, 3, 6, 'evening', 'Znowu odwołałem spotkanie.',        now() - INTERVAL '13 days'),
    ('e0000000-0000-0000-0000-000000000114', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Lęk',            5, 4, 6, 'night',   NULL,                                now() - INTERVAL '14 days'),
    ('e0000000-0000-0000-0000-000000000115', 'c0000000-0000-0000-0000-000000000005', 'Dobrze',        'Radość',         3, 7, 3, 'morning', NULL,                                now() - INTERVAL '15 days'),
    ('e0000000-0000-0000-0000-000000000116', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Smutek',         5, 4, 5, NULL,      NULL,                                now() - INTERVAL '16 days'),
    ('e0000000-0000-0000-0000-000000000118', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Frustracja',     7, 3, 7, 'evening', NULL,                                now() - INTERVAL '18 days'),
    ('e0000000-0000-0000-0000-000000000119', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Złość',          7, 3, 8, 'evening', NULL,                                now() - INTERVAL '19 days'),
    ('e0000000-0000-0000-0000-000000000120', 'c0000000-0000-0000-0000-000000000005', 'Neutralnie',    'Lęk',            6, 4, 6, 'night',   NULL,                                now() - INTERVAL '20 days'),
    ('e0000000-0000-0000-0000-000000000121', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Smutek',         7, 2, 6, NULL,      NULL,                                now() - INTERVAL '21 days'),
    ('e0000000-0000-0000-0000-000000000122', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Bezradność',     8, 2, 7, 'morning', 'Nie wiem, od czego zacząć.',        now() - INTERVAL '22 days'),
    ('e0000000-0000-0000-0000-000000000124', 'c0000000-0000-0000-0000-000000000005', 'Bardzo źle',    'Bezradność',     8, 2, 8, 'night',   'Najgorszy dzień w tym miesiącu.',   now() - INTERVAL '24 days'),
    ('e0000000-0000-0000-0000-000000000125', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Wstyd',          7, 3, 7, 'evening', NULL,                                now() - INTERVAL '25 days'),
    ('e0000000-0000-0000-0000-000000000126', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Lęk',            8, 2, 8, 'night',   NULL,                                now() - INTERVAL '26 days'),
    ('e0000000-0000-0000-0000-000000000127', 'c0000000-0000-0000-0000-000000000005', 'Bardzo źle',    'Smutek',         8, 1, 7, NULL,      NULL,                                now() - INTERVAL '27 days'),
    ('e0000000-0000-0000-0000-000000000129', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Lęk',            7, 3, 7, 'night',   NULL,                                now() - INTERVAL '29 days'),
    ('e0000000-0000-0000-0000-000000000130', 'c0000000-0000-0000-0000-000000000005', 'Źle',           'Złość',          7, 3, 7, 'evening', NULL,                                now() - INTERVAL '30 days')
ON CONFLICT (id_diary) DO NOTHING;

-- Ratings for the entries above. NULL rather than 0 for an emotion the entry
-- never picked: the app treats "not rated" and "rated, and it was nothing" as
-- different answers, and zeroes here would put all nine emotions on every day
-- of the chart. 'Stres' is not in this table -- it is rated on
-- `diary.stress_level`, which the rows above already set.
INSERT INTO mood_scale (id_diary, sadness_scale, anxiety_scale, anger_scale, happiness_scale, guilt_scale, frustration_scale, helplessness_scale, shame_scale, calm_scale)
SELECT v.id_diary, v.sadness_scale, v.anxiety_scale, v.anger_scale, v.happiness_scale, v.guilt_scale, v.frustration_scale, v.helplessness_scale, v.shame_scale, v.calm_scale
FROM (VALUES
    ('e0000000-0000-0000-0000-000000000100'::uuid, NULL,    2, NULL,    6, NULL, NULL, NULL, NULL,    8),
    ('e0000000-0000-0000-0000-000000000101'::uuid,    3,    7, NULL, NULL, NULL,    2, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000102'::uuid, NULL, NULL,    8, NULL, NULL,    6, NULL,    3, NULL),
    ('e0000000-0000-0000-0000-000000000103'::uuid,    8, NULL, NULL, NULL,    4, NULL,    6, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000105'::uuid, NULL,    3,    4, NULL, NULL,    7, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000106'::uuid, NULL, NULL, NULL,    9, NULL, NULL, NULL, NULL,    7),
    ('e0000000-0000-0000-0000-000000000107'::uuid,    3, NULL, NULL, NULL,    5, NULL, NULL,    7, NULL),
    ('e0000000-0000-0000-0000-000000000108'::uuid,    3,    6, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000111'::uuid, NULL, NULL, NULL,    5, NULL, NULL, NULL, NULL,    6),
    ('e0000000-0000-0000-0000-000000000112'::uuid, NULL, NULL,    3, NULL, NULL,    6, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000113'::uuid,    5, NULL, NULL, NULL,    7, NULL, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000114'::uuid, NULL,    6, NULL, NULL, NULL,    3, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000115'::uuid, NULL, NULL, NULL,    7, NULL, NULL, NULL, NULL,    5),
    ('e0000000-0000-0000-0000-000000000116'::uuid,    5,    4, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000118'::uuid, NULL, NULL,    5, NULL, NULL,    8, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000119'::uuid, NULL, NULL,    7, NULL, NULL,    5, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000120'::uuid, NULL,    6, NULL, NULL, NULL, NULL,    4, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000121'::uuid,    7, NULL, NULL, NULL, NULL, NULL,    5, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000122'::uuid,    6, NULL, NULL, NULL, NULL, NULL,    8, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000124'::uuid,    7, NULL, NULL, NULL,    4, NULL,    9, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000125'::uuid, NULL, NULL, NULL, NULL,    6, NULL, NULL,    7, NULL),
    ('e0000000-0000-0000-0000-000000000126'::uuid, NULL,    8, NULL, NULL, NULL, NULL,    5, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000127'::uuid,    9, NULL, NULL, NULL, NULL, NULL,    6, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000129'::uuid,    5,    7, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('e0000000-0000-0000-0000-000000000130'::uuid, NULL, NULL,    6, NULL, NULL,    6, NULL, NULL, NULL)
) AS v(id_diary, sadness_scale, anxiety_scale, anger_scale, happiness_scale, guilt_scale, frustration_scale, helplessness_scale, shame_scale, calm_scale)
WHERE NOT EXISTS (SELECT 1 FROM mood_scale m WHERE m.id_diary = v.id_diary);

INSERT INTO raport (id_medical, id_technique, most_frequent_emotion, avg_mood, stress_level, energy_level, number_of_bad_days, most_frequent_emotion_triggers, technique_efficiency)
SELECT v.id_medical, v.id_technique, v.most_frequent_emotion, v.avg_mood, v.stress_level, v.energy_level, v.number_of_bad_days, v.most_frequent_emotion_triggers, v.technique_efficiency
FROM (VALUES
    ('c0000000-0000-0000-0000-000000000001'::uuid, 2::smallint, 'niepokój',   'dobry',      3, 6, 2, 'praca, terminy',           7),
    ('c0000000-0000-0000-0000-000000000002'::uuid, 3::smallint, 'frustracja', 'neutralny',  5, 4, 4, 'konflikty z rówieśnikami', 6),
    ('c0000000-0000-0000-0000-000000000003'::uuid, 1::smallint, 'radość',     'dobry',      2, 7, 1, 'brak',                     8),
    ('c0000000-0000-0000-0000-000000000004'::uuid, 2::smallint, 'zmęczenie',  'przeciętny', 4, 5, 3, 'praca zdalna, brak snu',   5),
    -- Demo account. Without a raport row the home screen simply leaves the
    -- technique card out, so this is what makes it appear.
    ('c0000000-0000-0000-0000-000000000005'::uuid, 3::smallint, 'Lęk',        'neutralny',  4, 5, 2, 'praca, wystąpienia',       7)
) AS v(id_medical, id_technique, most_frequent_emotion, avg_mood, stress_level, energy_level, number_of_bad_days, most_frequent_emotion_triggers, technique_efficiency)
WHERE NOT EXISTS (
    SELECT 1 FROM raport r WHERE r.id_medical = v.id_medical AND r.id_technique = v.id_technique
);

-- ============================================================
-- MODUŁ DIETETYCZNY — demo data for test@wp.pl (id_medical c0...05)
--
-- The psychotherapy half of this file has been seeding a month of entries for
-- that account for a while, which is why its home screen, charts and reports
-- have something to draw. The diet module had nothing at all: its two first
-- screens read an empty day out of `api/diet.ts` because no table existed, and
-- once `hydration` (0015) and then `diet_meal`/`supplement`/`supplement_intake`
-- (0016) did, an unseeded database still meant "0 posiłków, 0 szklanek, pusta
-- lista" on every one of them.
--
-- EVERYTHING BELOW IS RELATIVE TO CURRENT_DATE, not a fixed date, for the same
-- reason the diary entries above are: the module's screens all show today and
-- the last seven days, so hard-coded dates would fall out of the window and the
-- seed would be empty again by next week.
--
-- WHAT IT IS SHAPED TO SHOW, deliberately rather than at random:
--   * four days of meals back to back ending today  -> a streak of 4, and a
--     "dzień rozpoczęty" home screen rather than the empty one
--   * gaps 4, 8, 10 and 11 days back                -> days with no meal, which
--     every real diary has, and what stops the streak at 4
--   * one meal with no kind, one with no hour and one with no description ->
--     §05's rule that no field blocks a save, so the history screen's
--     "Zapisany bez opisu" branch is reachable from seeded data
--   * water below the goal on some days and over it on others -> the bar full
--     without a word of congratulation, which is the rule §08 states
--   * the three preparations from §08's own artboard, with two of the three
--     ticked off for today -- exactly the state it draws
--   * meals going back 24 days, with emotions on some of them in every closed
--     week -> §10's "Najczęstsze emocje przy jedzeniu" and §11's three emotion
--     crossings have something to draw. This is the one part of the seed that
--     is shaped for a screen showing *last* week rather than today: a report
--     covers a week that has ended, so chips on today's meals appear in no
--     report at all, and a seed that stopped at three days back left that
--     section empty everywhere it can be opened.
--
-- NOTHING HERE COUNTS FOOD. There is no portion, no weight and no calorie
-- column to seed: §04 states that scope outright ("nie liczy jedzenia --
-- opisuje je"), and this file is not the place to work around it.
-- ============================================================

-- ----------------------------
-- DIET_MEAL
-- Descriptions are the patient's own words, so they are written the way
-- somebody types them into a phone: short, lowercase where it happens, and with
-- no nutritional vocabulary anywhere.
-- ----------------------------
INSERT INTO diet_meal (id_meal, id_medical, entry_date, kind, eaten_at, description) VALUES
    -- Today: three meals, so the home screen shows the "started day" state.
    ('f1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,                    'Śniadanie',       '08:10', 'Owsianka na mleku, do tego banan i łyżka masła orzechowego.'),
    ('f1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,                    'Obiad',           '13:40', 'Zupa pomidorowa i kanapka z serem, zjedzone przy biurku.'),
    ('f1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,                    'Przekąska',       '16:20', 'Garść orzechów, bardziej z nudów niż z głodu.'),

    ('f1000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1,                'Śniadanie',       '07:50', 'Jajecznica na dwóch jajkach, kromka chleba.'),
    ('f1000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1,                'Drugie śniadanie','10:30', 'Jogurt naturalny.'),
    ('f1000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1,                'Obiad',           '14:00', 'Makaron z warzywami, duża porcja.'),
    ('f1000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1,                'Kolacja',         '19:30', 'Kanapki, jedzone przed telewizorem.'),

    ('f1000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2,                'Śniadanie',       '09:00', 'Kawa i drożdżówka, w biegu.'),
    ('f1000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2,                'Obiad',           '13:15', 'Ryż z kurczakiem i surówką.'),
    -- No kind: a meal saved without saying which one it was. §05 allows it and
    -- the history screen leads with the description instead.
    ('f1000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2,                NULL,              '22:10', 'Podjadanie po kłótni — nie liczyłem, ile.'),

    ('f1000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 3,                'Obiad',           '15:00', 'Pierwszy posiłek tego dnia, cały dzień w łóżku.'),
    -- No hour: the "nulls_last" case, so this row sits after the one above it
    -- in the day rather than opening it.
    ('f1000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 3,                'Kolacja',         NULL,    'Zupa z torebki, nie pamiętam o której.'),

    -- Gap at -4: the streak above ends here, at four days.
    ('f1000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5,                'Śniadanie',       '08:20', 'Kanapka z awokado.'),
    ('f1000000-0000-0000-0000-000000000052', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5,                'Obiad',           '13:00', 'Obiad na mieście, z Anią.'),
    ('f1000000-0000-0000-0000-000000000053', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5,                'Kolacja',         '20:00', 'Sałatka, bez wielkiego apetytu.'),

    ('f1000000-0000-0000-0000-000000000061', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 6,                'Śniadanie',       '10:00', 'Późne śniadanie, weekend.'),
    ('f1000000-0000-0000-0000-000000000062', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 6,                'Obiad',           '16:00', 'Urodziny u przyjaciela — tort i dużo przekąsek.'),

    ('f1000000-0000-0000-0000-000000000071', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 7,                'Śniadanie',       '08:00', 'Owsianka.'),
    -- Empty description: the field was on screen and left blank. The history
    -- screen says "Zapisany bez opisu" rather than rendering a blank row.
    ('f1000000-0000-0000-0000-000000000072', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 7,                'Przekąska',       '17:30', ''),
    ('f1000000-0000-0000-0000-000000000073', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 7,                'Kolacja',         '19:00', 'Naleśniki z serem.'),

    ('f1000000-0000-0000-0000-000000000091', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 9,                'Obiad',           '13:30', 'Kotlet z ziemniakami u rodziców.'),
    ('f1000000-0000-0000-0000-000000000092', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 9,                'Kolacja',         '20:30', 'Herbata i dwa ciastka.'),

    ('f1000000-0000-0000-0000-000000000121', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 12,               'Śniadanie',       '07:40', 'Kanapki do pracy, zjedzone dopiero w biurze.'),
    ('f1000000-0000-0000-0000-000000000122', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 12,               'Podwieczorek',    '17:00', 'Jabłko.'),
    ('f1000000-0000-0000-0000-000000000123', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 12,               'Kolacja',         '21:00', 'Późna kolacja, po prezentacji.'),

    ('f1000000-0000-0000-0000-000000000131', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 13,               'Obiad',           '14:20', 'Zupa jarzynowa.'),
    ('f1000000-0000-0000-0000-000000000141', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 14,               'Śniadanie',       '08:30', 'Kawa z mlekiem i tost.'),
    ('f1000000-0000-0000-0000-000000000142', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 14,               'Obiad',           '13:00', 'Ryba z warzywami.'),
    ('f1000000-0000-0000-0000-000000000151', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 15,               'Obiad',           '12:50', 'Pierogi, bardzo dużo.'),
    ('f1000000-0000-0000-0000-000000000181', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 18,               'Śniadanie',       '09:10', 'Omlet.'),
    ('f1000000-0000-0000-0000-000000000182', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 18,               'Kolacja',         '19:40', 'Kasza z warzywami.'),
    ('f1000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 20,               'Obiad',           '13:20', 'Obiad w kantynie, nie pamiętam co.'),

    -- The oldest stretch, and it is here for the weekly report rather than for
    -- the history screen.
    --
    -- **A DIET WEEK IS SEVEN DAYS FROM THE PATIENT'S FIRST ENTRY**, not a
    -- Monday, and a report exists only once its week has *ended*. With the run
    -- starting 20 days back that gave two closed weeks; starting it at 24 gives
    -- three, and — because 25 days do not divide by seven — it also makes the
    -- last bucket of §11's "Emocje w czasie" a short one, which is the state
    -- that column's own caption exists to explain. Both are states a demo
    -- cannot otherwise be walked into.
    ('f1000000-0000-0000-0000-000000000211', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 21,               'Śniadanie',       '08:00', 'Płatki z mlekiem.'),
    ('f1000000-0000-0000-0000-000000000212', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 21,               'Kolacja',         '19:20', 'Kanapki, sama w domu.'),
    ('f1000000-0000-0000-0000-000000000221', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 22,               'Obiad',           '13:45', 'Coś na szybko między spotkaniami.'),
    ('f1000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 24,               'Śniadanie',       '08:40', 'Chleb z twarożkiem.'),
    ('f1000000-0000-0000-0000-000000000242', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 24,               'Obiad',           '13:10', 'Zupa z pracy.'),
    -- After 22:00, so it lands in the "Noc" column — the bucket that wraps
    -- midnight, and the module's deliberate departure from the artboard's own
    -- bands. Without a row here the night column is empty in every closed week
    -- and §11's map looks like it has three parts of the day.
    ('f1000000-0000-0000-0000-000000000243', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 24,               'Kolacja',         '22:40', 'Jadłam późno, po powrocie.')
-- DO UPDATE rather than DO NOTHING, unlike most of this file, and the reason is
-- the dates rather than the columns.
--
-- **EVERY ROW HERE IS RELATIVE TO CURRENT_DATE, SO A RE-RUN HAS TO RE-ANCHOR
-- IT.** Skipped, a database seeded three weeks ago keeps these meals at the
-- absolute dates they got then — so they slide out of §02's today, out of §07's
-- history, out of §11's rolling window, and the whole diet module goes quiet
-- while the script reports success. Worse on a second run: the rows added since
-- would land at today's reckoning next to rows from the old one, which is two
-- different weeks' worth of data on one screen.
--
-- Re-running the seed is the way this file is meant to be used (the header says
-- so of the diary half too), so it has to leave the same picture every time
-- rather than only the first.
ON CONFLICT (id_meal) DO UPDATE SET
    entry_date = EXCLUDED.entry_date,
    kind = EXCLUDED.kind,
    eaten_at = EXCLUDED.eaten_at,
    description = EXCLUDED.description;

-- ----------------------------
-- DIET_MEAL_EMOTION
-- What was felt at some of the meals above (mockups §04/§05).
--
-- Not on every meal, and that is the point: §05's rule is that no field blocks
-- a save, so a meal with no emotion beside it is the ordinary case and the
-- screens have to render it as one. The three states a seed has to contain are
-- all here -- a rated chip, a chip picked and left UNRATED (intensity NULL,
-- which is not a 0), and a meal with none at all.
--
-- The names are core.emotions.EMOTIONS, spelled exactly: the API refuses
-- anything else, and a row seeded with a name outside the ten would render a
-- chip with no colour.
--
-- **THE CHIPS HAVE TO REACH THE CLOSED WEEKS, NOT ONLY THE LAST FEW DAYS.**
-- This block used to stop at CURRENT_DATE - 2, which lit up the meal rows on
-- §02 and §07 and left §10's "Najczęstsze emocje przy jedzeniu" empty on every
-- report the demo can open — a report covers a week that has *ended*, so the
-- chips on today's meals are in no report at all. The spread below puts a
-- ranking in each of the three closed weeks.
--
-- SHAPED SO EACH SCREEN'S AWKWARD CASE IS REACHABLE, rather than scattered:
--   * one emotion clearly the most frequent          -> a ranking with an order
--     ('Stres'), and two tied on count in week -10   to read, and the tie-break
--     with different averages ('Spokój'/'Radość')    on the average visible
--   * a chip picked and left UNRATED in every week   -> "Natężenie nie zostało
--     ('Bezradność', 'Wstyd', 'Smutek')                 ocenione" on a row
--   * chips on the meal with NO KIND and on the one  -> the "Bez rodzaju" and
--     with NO HOUR                                      "Bez godziny" columns of
--                                                       §11's crossings, which
--                                                       are drawn only when such
--                                                       a meal exists
--   * meals with no chip at all, in every week       -> the ordinary case §05
--                                                       allows, and the measured
--                                                       zero in a crossing
--
-- Deliberately mixed rather than uniformly bleak: this is a demo of a food
-- diary, not a portrait of a patient, and a seed where every meal is 'Wstyd'
-- would put a verdict on the module's own screens. Nothing here is a judgement
-- of the food — the number rates a feeling, which is the line §05's section is
-- built on (see core/diet_reports._rank_meal_emotions).
-- ----------------------------
INSERT INTO diet_meal_emotion (id_meal, emotion, intensity) VALUES
    -- === The running week (CURRENT_DATE - 3 .. today) ===
    -- Visible on §02, §07 and §11, and in no report yet: its week has not ended.

    -- Today: a calm breakfast, a stressful lunch, and a snack the patient
    -- named an emotion for without rating it.
    ('f1000000-0000-0000-0000-000000000001', 'Spokój',        6),
    ('f1000000-0000-0000-0000-000000000002', 'Stres',         7),
    ('f1000000-0000-0000-0000-000000000003', 'Frustracja', NULL),
    ('f1000000-0000-0000-0000-000000000003', 'Wstyd',         4),

    -- Yesterday: two on one meal, and two meals with none.
    ('f1000000-0000-0000-0000-000000000011', 'Spokój',        5),
    ('f1000000-0000-0000-0000-000000000014', 'Smutek',        4),
    ('f1000000-0000-0000-0000-000000000014', 'Bezradność', NULL),

    ('f1000000-0000-0000-0000-000000000021', 'Stres',         8),
    ('f1000000-0000-0000-0000-000000000022', 'Radość',        5),
    -- The meal saved with NO KIND, at 22:10. It is what puts a "Bez rodzaju"
    -- column on §11's "Emocje a rodzaj posiłku" and a row in "Noc".
    ('f1000000-0000-0000-0000-000000000023', 'Wstyd',         6),
    ('f1000000-0000-0000-0000-000000000023', 'Poczucie winy', NULL),

    ('f1000000-0000-0000-0000-000000000031', 'Bezradność',    6),
    -- The meal saved with NO HOUR — the "Bez godziny" column of "Emocje a pora
    -- dnia", which is drawn only when the window holds such a meal.
    ('f1000000-0000-0000-0000-000000000032', 'Smutek',        5),

    -- === Week CURRENT_DATE - 10 .. - 4 (closed, the newest report) ===
    -- 'Spokój' and 'Radość' both land at three meals here, with different
    -- averages: the ranking's tie-break on the average, on screen.
    ('f1000000-0000-0000-0000-000000000051', 'Spokój',        5),
    ('f1000000-0000-0000-0000-000000000052', 'Radość',        6),
    ('f1000000-0000-0000-0000-000000000053', 'Smutek',     NULL),
    ('f1000000-0000-0000-0000-000000000061', 'Spokój',        7),
    ('f1000000-0000-0000-0000-000000000062', 'Radość',        8),
    ('f1000000-0000-0000-0000-000000000071', 'Spokój',        6),
    ('f1000000-0000-0000-0000-000000000072', 'Frustracja',    5),
    ('f1000000-0000-0000-0000-000000000091', 'Radość',        7),
    ('f1000000-0000-0000-0000-000000000092', 'Poczucie winy', 5),

    -- === Week CURRENT_DATE - 17 .. - 11 (closed) ===
    ('f1000000-0000-0000-0000-000000000121', 'Stres',         6),
    ('f1000000-0000-0000-0000-000000000122', 'Radość',        5),
    ('f1000000-0000-0000-0000-000000000123', 'Stres',         8),
    ('f1000000-0000-0000-0000-000000000123', 'Wstyd',      NULL),
    ('f1000000-0000-0000-0000-000000000131', 'Spokój',        6),
    ('f1000000-0000-0000-0000-000000000141', 'Spokój',        5),
    ('f1000000-0000-0000-0000-000000000142', 'Stres',         4),
    ('f1000000-0000-0000-0000-000000000151', 'Poczucie winy', 6),

    -- === Week CURRENT_DATE - 24 .. - 18 (closed, the oldest report) ===
    ('f1000000-0000-0000-0000-000000000181', 'Spokój',        6),
    ('f1000000-0000-0000-0000-000000000182', 'Bezradność', NULL),
    ('f1000000-0000-0000-0000-000000000201', 'Stres',         7),
    ('f1000000-0000-0000-0000-000000000212', 'Smutek',        6),
    ('f1000000-0000-0000-0000-000000000221', 'Stres',         5),
    ('f1000000-0000-0000-0000-000000000241', 'Spokój',        5),
    ('f1000000-0000-0000-0000-000000000242', 'Stres',         6),
    -- The 22:40 supper: the "Noc" column in a week a report actually covers.
    ('f1000000-0000-0000-0000-000000000243', 'Poczucie winy', 7),
    ('f1000000-0000-0000-0000-000000000243', 'Wstyd',         4)
-- DO UPDATE for the same reason the meals above take one: a re-run has to leave
-- the same picture. Here it is the rating rather than a date -- an intensity
-- edited in this file would otherwise never reach a database that already held
-- the row, and the difference between 7 and NULL is a whole branch of the
-- screens (an average, or the sentence that says there is none).
ON CONFLICT (id_meal, emotion) DO UPDATE SET
    intensity = EXCLUDED.intensity;

-- ----------------------------
-- HYDRATION
-- A row per serving, so the seven-day chart is a GROUP BY over these and today
-- is correctable serving by serving.
--
-- The amounts are the screen's own two buttons (250 ml "szklanka", 500 ml
-- "butelka") plus one custom 400 ml, which is what makes the count read "1,6"
-- rather than a whole number -- the case the rounding rule exists for.
--
-- Only water counts towards the goal. The tea and the coffee below are recorded
-- and deliberately not converted, which is the client's rule ("decyzja
-- merytoryczna zostaje po stronie specjalisty"), so they appear in today's list
-- and move no figure at all. Their amount_ml is NULL: the "Inne napoje" card
-- offers a chip and no quantity, and inventing one would put a number nobody
-- entered into a clinical record.
-- ----------------------------
INSERT INTO hydration (id_hydration, id_medical, entry_date, drink, amount_ml) VALUES
    -- Today: 250 + 500 + 400 = 1150 ml -> 4,6 z 6 szklanek, bar not yet full.
    ('f2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,     'Woda',    250),
    ('f2000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,     'Woda',    500),
    ('f2000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,     'Woda',    400),
    ('f2000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,     'Herbata', NULL),
    ('f2000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE,     'Kawa',    NULL),

    -- Yesterday: 1750 ml -> 7 glasses, i.e. over the goal. The bar is simply
    -- full and the day still says what it was; there is no message either way.
    ('f2000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 1, 'Woda',    250),

    ('f2000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2, 'Woda',    250),
    ('f2000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2, 'Woda',    250),
    ('f2000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 2, 'Napar ziołowy', NULL),

    ('f2000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 3, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000032', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 3, 'Woda',    250),
    ('f2000000-0000-0000-0000-000000000033', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 3, 'Woda',    250),

    -- Nothing four days back: a day with no serving is a legitimate 0 column,
    -- not a gap the chart has to invent a value for.

    ('f2000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000052', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000053', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5, 'Woda',    250),
    ('f2000000-0000-0000-0000-000000000054', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 5, 'Woda z cytryną', NULL),

    ('f2000000-0000-0000-0000-000000000061', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 6, 'Woda',    250),
    ('f2000000-0000-0000-0000-000000000062', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 6, 'Woda',    500),
    ('f2000000-0000-0000-0000-000000000063', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 6, 'Kompot',  NULL)
ON CONFLICT (id_hydration) DO NOTHING;

-- ----------------------------
-- SUPPLEMENT
-- The three rows §08's artboard draws, with its own wording for each: a vitamin
-- with no end date ("bezterminowo"), a magnesium with both dates, and a
-- medicine whose end is the doctor's call -- which goes in `frequency`, because
-- there is no third column for it and `frequency` is free text.
--
-- Sertralina is the artboard's own example. It is a real medicine and this is a
-- mental-health service, so the seed says the same thing the client's mockup
-- says rather than substituting something vaguer -- a screen reviewed against
-- the mockup should show the mockup's list.
-- ----------------------------
INSERT INTO supplement (id_supplement, id_medical, name, dose, frequency, start_date, end_date, reminder_enabled) VALUES
    ('f3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000005', 'Witamina D3', '2000 IU', 'raz dziennie',                  CURRENT_DATE - 180, NULL,                TRUE),
    ('f3000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000005', 'Magnez',      '200 mg',  'raz dziennie',                  CURRENT_DATE - 99,  CURRENT_DATE + 7,    TRUE),
    ('f3000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', 'Sertralina',  '50 mg',   'raz dziennie, wg zaleceń lekarza', CURRENT_DATE - 190, NULL,                FALSE),
    -- Twice a day: one position on the list, two hours on its row. Seeded so
    -- the case supplement_hour exists for is visible without typing it.
    ('f3000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005', 'Probiotyk',   NULL,      'dwa razy dziennie, na czczo',   CURRENT_DATE - 45,  NULL,                TRUE)
ON CONFLICT (id_supplement) DO NOTHING;

-- ----------------------------
-- SUPPLEMENT_HOUR
-- The hours each preparation is taken at. Zero rows would be "no fixed hour".
-- ----------------------------
INSERT INTO supplement_hour (id_supplement_hour, id_supplement, hour) VALUES
    ('f5000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', '08:00'),
    ('f5000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002', '21:00'),
    ('f5000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003', '08:00'),
    ('f5000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000004', '06:45'),
    ('f5000000-0000-0000-0000-000000000005', 'f3000000-0000-0000-0000-000000000004', '12:00')
ON CONFLICT (id_supplement_hour) DO NOTHING;

-- ----------------------------
-- SUPPLEMENT_INTAKE
-- Two of the three ticked off for today, which is exactly the state the
-- artboard draws (`supp: { d3: true, mg: false, sert: true }`). The third being
-- unticked is the point: an absent row is a question nobody answered yet, not a
-- record of a missed dose, and nothing in the app treats it as one.
--
-- A few earlier days as well, so the table is not only ever today -- nothing
-- renders them yet (the screen shows today), and they are here so that a
-- history view added later has something to read instead of one flat day.
-- ----------------------------
INSERT INTO supplement_intake (id_intake, id_supplement, entry_date) VALUES
    ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', CURRENT_DATE),
    ('f4000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000003', CURRENT_DATE),
    ('f4000000-0000-0000-0000-000000000011', 'f3000000-0000-0000-0000-000000000001', CURRENT_DATE - 1),
    ('f4000000-0000-0000-0000-000000000012', 'f3000000-0000-0000-0000-000000000002', CURRENT_DATE - 1),
    ('f4000000-0000-0000-0000-000000000013', 'f3000000-0000-0000-0000-000000000003', CURRENT_DATE - 1),
    ('f4000000-0000-0000-0000-000000000021', 'f3000000-0000-0000-0000-000000000001', CURRENT_DATE - 2),
    ('f4000000-0000-0000-0000-000000000022', 'f3000000-0000-0000-0000-000000000003', CURRENT_DATE - 2)
ON CONFLICT (id_intake) DO NOTHING;


-- ============================================================
-- GŁĘBOKA HISTORIA DIETETYCZNA — 120 dni, generowana
--
-- WHY THIS BLOCK IS GENERATED WHILE THE REST OF THE FILE IS LITERAL. Everything
-- above is written out row by row, because each row is there for a reason
-- somebody can read: the meal with no kind, the one with no hour, the empty
-- description, the gap that stops the streak at four. Those are *shapes*, and a
-- shape has to be legible.
--
-- This block is not shapes, it is **volume**. §10's report list, its pagination
-- (7 per page) and §11's rolling window all need more history than anybody will
-- hand-write correctly: 120 days is around 300 meals, and 300 literal rows is a
-- file nobody reads and nobody keeps accurate. So the days are generated from a
-- rotation, and what is worth reading is the rotation rather than its output.
--
-- WHAT IT ADDS THAT THE FILE DID NOT HAVE AT ALL: `diet_activity`,
-- `diet_activity_day` and `diet_sleep`. Those tables arrived with migration 0018
-- and this seed never wrote them, so every day of every weekly report said "nie
-- wpisano" for three of its four diaries — a report that looked like a week
-- somebody only ate in.
--
-- **EVERY ROW HERE HAS A UUID BEGINNING `fe5eed00`**, and that is load-bearing
-- rather than decorative: it is what lets the block be deleted and rewritten on
-- a re-run (the dates are relative to CURRENT_DATE, so they have to be)
-- **without touching anything a person entered through the app**. A meal
-- somebody typed into the demo account keeps a random UUID and survives every
-- re-seed.
--
-- EIGHT HEX CHARACTERS RATHER THAN TWO, and the length is the whole point. A
-- two-character marker matches a random UUID once in 256 -- measured against a
-- real development database, `LIKE 'fe%'` already matched three rows nobody
-- generated -- so the delete below would eventually take somebody's own entry
-- with it. At eight the chance is one in four billion per row, which is the
-- difference between a marker and a coincidence.
--
-- **`d % 23 <> 5` APPEARS IN EVERY BLOCK BELOW, AND IT IS ONE RULE RATHER THAN
-- SIX COINCIDENCES.** Each diary skips days of its own (a day with no meal, a
-- day nobody logged a walk on), but those gaps fall on different days, so with
-- four diaries running the patient ends up having written *something* every
-- single day of 120 -- and "brak wpisu" becomes unreachable. It is a real state
-- of a real diary, the report draws a day chip and a line for it, and §02 is
-- explicit that an empty day "nie jest brakiem". So one shared rule silences
-- every diary on the same handful of days. They are single days, never a whole
-- week: a week nobody wrote in has no report at all (`build_diet_reports` skips
-- it), which would read as a hole in the archive rather than as a quiet week.
--
-- NOTHING HERE COUNTS FOOD, exactly as above: no portion, no weight, no calorie.
-- The emotions are the one thing that is counted, and what they count is a
-- feeling the patient rated -- see core/diet_reports._rank_meal_emotions.
-- ============================================================

-- The previous generation, removed before it is rewritten. `diet_meal_emotion`
-- goes with its meals (ON DELETE CASCADE), so it is not named here.
DELETE FROM diet_meal
 WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
   AND id_meal::text LIKE 'fe5eed00-%';
DELETE FROM hydration
 WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
   AND id_hydration::text LIKE 'fe5eed00-%';
DELETE FROM diet_activity
 WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
   AND id_activity::text LIKE 'fe5eed00-%';
DELETE FROM diet_activity_day
 WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
   AND id_activity_day::text LIKE 'fe5eed00-%';
DELETE FROM diet_sleep
 WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
   AND id_sleep::text LIKE 'fe5eed00-%';

-- ----------------------------
-- DIET_MEAL — dni 25..119
--
-- Starts at 25 because the hand-written block above ends at 24, and the two have
-- to meet: a gap between them would be a week with no entry, which drops out of
-- the report list entirely (`build_diet_reports` skips a week nobody wrote in)
-- and would read as data loss rather than as a quiet week.
--
-- A seven-day rotation, two to four meals a day, and roughly every thirteenth
-- day left empty. The gaps matter: a diary with an entry on all 120 days is not
-- a diary anybody recognises, and §02's rule is that an empty day "nie jest
-- brakiem". They are single days, never a whole week, for the reason above.
-- ----------------------------
INSERT INTO diet_meal (id_meal, id_medical, entry_date, kind, eaten_at, description)
SELECT
    ('fe5eed00' || substr(md5('posilek:' || d || ':' || v.idx), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    v.kind,
    v.eaten_at,
    v.description
FROM generate_series(25, 119) AS d
JOIN (VALUES
    -- idx, rotacja, rodzaj, godzina, opis
    (1, 0, 'Śniadanie'::TEXT,        TIME '07:40', 'Owsianka z owocami.'),
    (2, 0, 'Obiad',                  TIME '13:20', 'Zupa i drugie danie w pracy.'),
    (3, 0, 'Kolacja',                TIME '19:10', 'Kanapki z warzywami.'),
    (4, 0, 'Przekąska',              TIME '16:00', 'Orzechy przy komputerze.'),

    (1, 1, 'Śniadanie',              TIME '08:15', 'Jajecznica z pieczywem.'),
    (2, 1, 'Obiad',                  TIME '14:00', 'Makaron z sosem warzywnym.'),
    (3, 1, 'Kolacja',                TIME '20:30', 'Sałatka, bez apetytu.'),
    (4, 1, 'Drugie śniadanie',       TIME '10:40', 'Jogurt.'),

    (1, 2, 'Śniadanie',              TIME '09:30', 'Kawa i kanapka, w biegu.'),
    (2, 2, 'Obiad',                  TIME '15:10', 'Obiad u rodziców.'),
    -- Po 22:00, czyli kolumna „Noc" — kubełek, który obejmuje północ.
    (3, 2, 'Kolacja',                TIME '22:30', 'Jadłam późno, po pracy.'),
    (4, 2, 'Podwieczorek',           TIME '17:20', 'Jabłko i herbata.'),

    (1, 3, 'Śniadanie',              TIME '07:20', 'Płatki z mlekiem.'),
    (2, 3, 'Obiad',                  TIME '12:50', 'Ryż z warzywami.'),
    -- Bez rodzaju: §05 pozwala zapisać posiłek, nie mówiąc którym był.
    (3, 3, NULL,                     TIME '21:40', 'Podjadanie wieczorem, po trudnym dniu.'),
    (4, 3, 'Przekąska',              TIME '11:30', 'Baton, bardziej z nudów.'),

    (1, 4, 'Śniadanie',              TIME '08:50', 'Twarożek z pieczywem.'),
    (2, 4, 'Obiad',                  TIME '13:45', 'Zupa krem.'),
    (3, 4, 'Kolacja',                TIME '18:40', 'Naleśniki.'),
    -- Bez godziny: pytanie, na które nikt nie odpowiedział, nie jest północą.
    (4, 4, 'Przekąska',              NULL,         'Coś między posiłkami, nie pamiętam o której.'),

    (1, 5, 'Śniadanie',              TIME '10:10', 'Późne śniadanie, weekend.'),
    (2, 5, 'Obiad',                  TIME '16:20', 'Obiad ze znajomymi.'),
    (3, 5, 'Kolacja',                TIME '20:00', 'Kolacja w domu, spokojnie.'),
    (4, 5, 'Drugie śniadanie',       TIME '11:00', 'Kanapka.'),

    (1, 6, 'Śniadanie',              TIME '07:55', 'Omlet.'),
    (2, 6, 'Obiad',                  TIME '14:30', 'Kasza z warzywami.'),
    -- Pusty opis: pole było na ekranie i zostało puste.
    (3, 6, 'Kolacja',                TIME '19:50', ''),
    (4, 6, 'Podwieczorek',           TIME '17:00', 'Herbatniki przy pracy.')
) AS v(idx, rot, kind, eaten_at, description)
  ON v.rot = d % 7
WHERE d % 13 <> 0
  AND d % 23 <> 5          -- dzień całkiem bez wpisu (patrz niżej)
  AND v.idx <= 2 + (d % 3);

-- ----------------------------
-- DIET_MEAL_EMOTION — dla wygenerowanych posiłków
--
-- Derived from the meal rather than written beside it: the day and the hour are
-- already in the row, and a rotation over them gives a spread that is varied and
-- still reproducible. Deliberately mixed rather than uniformly bleak — this is a
-- demo of a food diary, not a portrait of a patient.
--
-- ROUGHLY TWO MEALS IN THREE CARRY A CHIP. The rest carry none, which is the
-- ordinary case §05 allows and the state the screens have to render as ordinary.
-- One rating in nine is NULL: a chip pressed with the slider never moved, which
-- is what `intensity` is nullable for and the branch that prints a sentence
-- instead of an average.
-- ----------------------------
INSERT INTO diet_meal_emotion (id_meal, emotion, intensity)
SELECT
    m.id_meal,
    e.emotion,
    CASE WHEN (m.d + m.h + e.pos) % 9 = 0 THEN NULL
         ELSE 2 + ((m.d * 2 + m.h + e.pos * 3) % 9) END
FROM (
    SELECT id_meal,
           (CURRENT_DATE - entry_date)::int AS d,
           COALESCE(EXTRACT(HOUR FROM eaten_at)::int, 0) AS h
      FROM diet_meal
     WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
       AND id_meal::text LIKE 'fe5eed00-%'
) AS m
JOIN (VALUES
    (0, 'Radość'::TEXT), (1, 'Smutek'), (2, 'Lęk'), (3, 'Złość'), (4, 'Stres'),
    (5, 'Poczucie winy'), (6, 'Frustracja'), (7, 'Wstyd'), (8, 'Bezradność'),
    (9, 'Spokój')
) AS e(pos, emotion)
  ON e.pos = (m.d * 3 + m.h) % 10
WHERE (m.d + m.h) % 3 <> 0
ON CONFLICT (id_meal, emotion) DO NOTHING;

-- A second chip on some of them, because one meal can hold several feelings and
-- a ranking whose rows never overlap hides that its counts are per *chip* while
-- the caption counts *meals*.
INSERT INTO diet_meal_emotion (id_meal, emotion, intensity)
SELECT
    m.id_meal,
    e.emotion,
    CASE WHEN (m.d + m.h) % 7 = 0 THEN NULL
         ELSE 1 + ((m.d + m.h * 3 + e.pos) % 10) END
FROM (
    SELECT id_meal,
           (CURRENT_DATE - entry_date)::int AS d,
           COALESCE(EXTRACT(HOUR FROM eaten_at)::int, 0) AS h
      FROM diet_meal
     WHERE id_medical = 'c0000000-0000-0000-0000-000000000005'
       AND id_meal::text LIKE 'fe5eed00-%'
) AS m
JOIN (VALUES
    (0, 'Radość'::TEXT), (1, 'Smutek'), (2, 'Lęk'), (3, 'Złość'), (4, 'Stres'),
    (5, 'Poczucie winy'), (6, 'Frustracja'), (7, 'Wstyd'), (8, 'Bezradność'),
    (9, 'Spokój')
) AS e(pos, emotion)
  ON e.pos = (m.d * 7 + m.h + 4) % 10
WHERE (m.d + m.h) % 5 = 0
ON CONFLICT (id_meal, emotion) DO NOTHING;

-- ----------------------------
-- HYDRATION — dni 7..119
--
-- Starts at 7 because the hand-written week above covers 0..6, which is exactly
-- what §08's chart draws. This is for the *report*, which lists a water figure
-- per day and said "nie wpisano" for every day older than a week.
--
-- Servings, never a total: the table holds one row per glass and every figure
-- the app shows is a GROUP BY over these. Three to six a day, one in four a
-- bottle rather than a glass, and roughly every seventeenth day with nothing --
-- a day below the goal is not a failure, which is what §08 says in words.
-- ----------------------------
INSERT INTO hydration (id_hydration, id_medical, entry_date, drink, amount_ml)
SELECT
    ('fe5eed00' || substr(md5('woda:' || d || ':' || s), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    'Woda',
    CASE WHEN (d + s) % 4 = 0 THEN 500 ELSE 250 END
FROM generate_series(7, 119) AS d
CROSS JOIN generate_series(1, 6) AS s
WHERE d % 17 <> 0
  AND d % 23 <> 5
  AND s <= 3 + (d % 4);

-- The other drinks, recorded and deliberately never converted into water. Their
-- `amount_ml` is NULL because §08's "Inne napoje" card offers a chip and no
-- quantity, and inventing one would put a number nobody entered into a record.
INSERT INTO hydration (id_hydration, id_medical, entry_date, drink, amount_ml)
SELECT
    ('fe5eed00' || substr(md5('napoj:' || d || ':' || v.rot), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    v.drink,
    NULL
FROM generate_series(7, 119) AS d
JOIN (VALUES
    (0, 'Herbata'::TEXT), (1, 'Kawa'), (2, 'Napar ziołowy'),
    (3, 'Woda z cytryną'), (4, 'Kompot')
) AS v(rot, drink)
  ON v.rot = d % 5
WHERE d % 3 <> 2
  AND d % 23 <> 5;

-- ----------------------------
-- DIET_ACTIVITY — dni 0..119
--
-- §09's movement diary, which this file has never seeded. Roughly two days in
-- three, never every day: most people do not move every day, and a seed that
-- said otherwise would make the screen read as a target to hit — which §09 is
-- explicit that it is not.
--
-- `feeling_after` is how somebody felt *after*, not how hard it was, and 'worse'
-- is one of the three: an activity that left somebody feeling worse is a real
-- entry and the report has to render it without comment.
-- ----------------------------
INSERT INTO diet_activity
    (id_activity, id_medical, entry_date, logged_at, kind, kind_other, duration_minutes, feeling_after)
SELECT
    ('fe5eed00' || substr(md5('ruch:' || d), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    v.logged_at, v.kind, v.kind_other, v.duration_minutes, v.feeling_after
FROM generate_series(0, 119) AS d
JOIN (VALUES
    (0, TIME '07:10', 'Joga'::TEXT,     ''::TEXT,          25, 'better'::TEXT),
    (1, TIME '18:30', 'Spacer',         '',                45, 'better'),
    (2, TIME '08:00', 'Rower',          '',                40, 'neutral'),
    (3, TIME '19:15', 'Basen',          '',                50, 'better'),
    (4, TIME '17:40', 'Siłownia',       '',                60, 'worse'),
    -- 'Inne' to chip, który odsłania pole tekstowe — dwie kolumny, jedna
    -- odpowiedź, czytane razem przez `kind_label`.
    (5, TIME '12:20', 'Inne',           'Nordic walking',  35, 'neutral')
) AS v(rot, logged_at, kind, kind_other, duration_minutes, feeling_after)
  ON v.rot = d % 6
WHERE d % 3 <> 1
  AND d % 23 <> 5;

-- ----------------------------
-- DIET_ACTIVITY_DAY — kroki
--
-- Its own table because a step count is a fact about a *day* rather than about
-- an activity: somebody who walked to work and filed no entry still took the
-- steps. Some days carry one with no activity beside it, some days carry neither
-- -- NULL steps is "nobody wrote it down", which is not zero steps.
-- ----------------------------
INSERT INTO diet_activity_day (id_activity_day, id_medical, entry_date, steps)
SELECT
    ('fe5eed00' || substr(md5('kroki:' || d), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    2600 + (d * 371) % 9200
FROM generate_series(0, 119) AS d
WHERE d % 5 <> 3
  AND d % 23 <> 5
ON CONFLICT (id_medical, entry_date) DO NOTHING;

-- ----------------------------
-- DIET_SLEEP — noce
--
-- **A NIGHT IS FILED UNDER THE MORNING IT ENDED ON**, which is what
-- `diet_sleep.entry_date` holds: the night from Monday to Tuesday belongs to
-- Tuesday, and therefore to whichever week Tuesday is in. Nothing in the data
-- says so -- a row holding 23:40 and 06:50 reads equally well as either day --
-- so it is worth saying here as well as in core/sleep.py.
--
-- Some nights are left undescribed, so the report's "nie wpisano" branch is
-- reachable, and the hours cross midnight in both directions.
-- ----------------------------
INSERT INTO diet_sleep
    (id_sleep, id_medical, entry_date, fell_asleep_at, woke_up_at, quality, awakenings, wake_feeling)
SELECT
    ('fe5eed00' || substr(md5('sen:' || d), 9))::uuid,
    'c0000000-0000-0000-0000-000000000005',
    CURRENT_DATE - d,
    v.fell_asleep_at, v.woke_up_at, v.quality, v.awakenings, v.wake_feeling
FROM generate_series(0, 119) AS d
JOIN (VALUES
    (0, TIME '23:20', TIME '06:45', 4, 0, 'rested'::TEXT),
    (1, TIME '00:15', TIME '07:30', 2, 2, 'heavy'),
    (2, TIME '22:50', TIME '06:20', 5, 0, 'calm'),
    (3, TIME '01:10', TIME '08:00', 1, 3, 'tense'),
    (4, TIME '23:05', TIME '07:10', 3, 1, 'rested'),
    (5, TIME '22:35', TIME '05:50', 4, 0, 'calm'),
    (6, TIME '00:40', TIME '07:45', 2, 1, 'heavy')
) AS v(rot, fell_asleep_at, woke_up_at, quality, awakenings, wake_feeling)
  ON v.rot = d % 7
WHERE d % 9 <> 4
  AND d % 23 <> 5
ON CONFLICT (id_medical, entry_date) DO NOTHING;
