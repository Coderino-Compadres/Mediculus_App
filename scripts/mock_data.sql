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

INSERT INTO specjalist (id_user, specjalization) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Psychoterapia'),
    ('b0000000-0000-0000-0000-000000000002', 'Dietetyka')
ON CONFLICT (id_user) DO NOTHING;

INSERT INTO patient (id_user, id_medical, id_specjalist, is_child) VALUES
    ('b0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', FALSE),
    ('b0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', TRUE),
    ('b0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', FALSE),
    ('b0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', FALSE)
ON CONFLICT (id_user) DO NOTHING;

INSERT INTO parent_child (id_parent_child, id_parent, id_child) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000005')
ON CONFLICT (id_parent_child) DO NOTHING;

-- MEDICAL DB

\connect medical_db

INSERT INTO technique (id_technique, name, type, description) VALUES
    (1, 'Body scan',            'DBT', 'Skanowanie ciała w celu zwiększenia świadomości somatycznej.'),
    (2, 'Dziennik emocji',      'CBT', 'Codzienne zapisywanie emocji i wyzwalających je sytuacji.'),
    (3, 'Technika 5-4-3-2-1',   'DBT', 'Technika uziemiająca wykorzystująca pięć zmysłów.')
ON CONFLICT (id_technique) DO NOTHING;

INSERT INTO diary (id_diary, id_medical, current_mood, current_strongest_emotion, stress_level, energy_level, overall_feeling, situation, situation_place, how_situation_handled, notes) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'neutralny', 'niepokój',    4, 5, 'w porządku',    'Rozmowa z przełożonym o projekcie', 'praca',   'Głębokie oddychanie przed rozmową',      'Poszło lepiej niż się bałem.'),
    ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'dobry',     'spokój',      2, 7, 'dobre',         'Spacer wieczorny',                  'park',    'Brak, dzień był spokojny',               NULL),
    ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'smutny',    'frustracja',  6, 3, 'ciężkie',       'Kłótnia z koleżanką w szkole',      'szkoła',  'Rozmowa z rodzicem wieczorem',            'Wciąż o tym myślę.'),
    ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'dobry',     'radość',      1, 8, 'bardzo dobre',  'Udany trening na siłowni',           'siłownia','Brak potrzeby',                          NULL),
    ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'neutralny', 'zmęczenie',   5, 4, 'przeciętne',    'Długi dzień w pracy zdalnej',        'dom',     'Krótka przerwa na herbatę',               'Potrzebuję więcej snu.')
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

INSERT INTO raport (id_medical, id_technique, most_frequent_emotion, avg_mood, stress_level, energy_level, number_of_bad_days, most_frequent_emotion_triggers, technique_efficiency)
SELECT v.id_medical, v.id_technique, v.most_frequent_emotion, v.avg_mood, v.stress_level, v.energy_level, v.number_of_bad_days, v.most_frequent_emotion_triggers, v.technique_efficiency
FROM (VALUES
    ('c0000000-0000-0000-0000-000000000001'::uuid, 2::smallint, 'niepokój',   'dobry',      3, 6, 2, 'praca, terminy',           7),
    ('c0000000-0000-0000-0000-000000000002'::uuid, 3::smallint, 'frustracja', 'neutralny',  5, 4, 4, 'konflikty z rówieśnikami', 6),
    ('c0000000-0000-0000-0000-000000000003'::uuid, 1::smallint, 'radość',     'dobry',      2, 7, 1, 'brak',                     8),
    ('c0000000-0000-0000-0000-000000000004'::uuid, 2::smallint, 'zmęczenie',  'przeciętny', 4, 5, 3, 'praca zdalna, brak snu',   5)
) AS v(id_medical, id_technique, most_frequent_emotion, avg_mood, stress_level, energy_level, number_of_bad_days, most_frequent_emotion_triggers, technique_efficiency)
WHERE NOT EXISTS (
    SELECT 1 FROM raport r WHERE r.id_medical = v.id_medical AND r.id_technique = v.id_technique
);
