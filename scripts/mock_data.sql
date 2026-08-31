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

INSERT INTO specjalist (id_user, specjalization) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Psychoterapia'),
    ('b0000000-0000-0000-0000-000000000002', 'Dietetyka')
ON CONFLICT (id_user) DO NOTHING;

INSERT INTO patient (id_user, id_medical, id_specjalist, is_child) VALUES
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', FALSE),
    ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', TRUE),
    ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', FALSE),
    ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', FALSE),
    ('b0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', FALSE)
ON CONFLICT (id_user) DO NOTHING;

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
