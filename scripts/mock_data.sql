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
    ('f1000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000005', CURRENT_DATE - 20,               'Obiad',           '13:20', 'Obiad w kantynie, nie pamiętam co.')
ON CONFLICT (id_meal) DO NOTHING;

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
