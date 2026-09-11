import uuid

from django.db import models

from .drinks import DRINKS, WATER
from .technique_vocabulary import AVAILABILITY_GENERAL
from .time_of_day import TIME_OF_DAY_CHOICES

class UserRole(models.Model):
    id_user_role = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'user_role'

    def __str__(self):
        return self.name or str(self.id_user_role)


class User(models.Model):
    id_user = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_role = models.ForeignKey(
        UserRole, db_column='id_user_role', on_delete=models.PROTECT,
        null=True, blank=True, related_name='users',
    )
    email = models.CharField(max_length=255, null=True, blank=True, unique=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    name = models.TextField(null=True, blank=True)
    surname = models.TextField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    # RODO art. 7(1) puts the burden of proof on us, so the consents collected by
    # the registration form are stored as the moment they were granted rather
    # than as a boolean. NULL means "never granted".
    data_consent_at = models.DateTimeField(null=True, blank=True)
    services_consent_at = models.DateTimeField(null=True, blank=True)
    # And the moment each was withdrawn, if it was. Not a reset of the column
    # above: art. 7(3) makes withdrawal a right, so it is a fact to record
    # rather than the erasure of the fact that consent was once given. A consent
    # is active when granted and not withdrawn since -- see core/consents.py,
    # which is the one place that comparison is written.
    data_consent_withdrawn_at = models.DateTimeField(null=True, blank=True)
    services_consent_withdrawn_at = models.DateTimeField(null=True, blank=True)
    # TRUE while the account is still holding a password somebody else chose for
    # it. Exactly one thing sets it: core/colleagues.py, where a specialist
    # creates another specialist's account and the first password is generated,
    # read off a note and typed by hand -- a credential its owner did not pick
    # and at least one other person knows. `core.permissions.HasOwnPassword`
    # answers everything but the form that changes it until this is cleared,
    # which `PasswordChangeSerializer.save` does.
    #
    # A boolean rather than a moment, unlike the consent columns above: nothing
    # has to be *proved* about it afterwards. `updated_at` already records when
    # the password last changed; this only decides which screen the account may
    # reach. FALSE for every account that chose its own password at
    # registration, which is why the column is NOT NULL with that default --
    # existing rows are correct without a backfill.
    must_change_password = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # DRF's IsAuthenticated permission duck-types Django's auth user and checks
    # this attribute. core.User is a plain model, not an AbstractBaseUser, so it
    # has to answer for itself; an instance is only ever attached to a request by
    # core.authentication.SessionUserAuthentication, i.e. from a live session.
    is_authenticated = True

    class Meta:
        db_table = 'user'

    def __str__(self):
        return self.email or str(self.id_user)


class Specjalist(models.Model):
    user = models.OneToOneField(
        User, primary_key=True, db_column='id_user', on_delete=models.CASCADE,
        related_name='specjalist_profile',
    )
    specjalization = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'specjalist'

    def __str__(self):
        return f'{self.user_id} ({self.specjalization})'


class Patient(models.Model):
    user = models.OneToOneField(
        User, primary_key=True, db_column='id_user', on_delete=models.CASCADE,
        related_name='patient_profile',
    )
    id_medical = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    specjalist = models.ForeignKey(
        Specjalist, db_column='id_specjalist', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='patients',
    )
    # The specialist who has *asked* to take this patient on, and the moment the
    # patient said yes to the one above. Two columns rather than a second table,
    # because `id_specjalist` is a single FK: this schema gives a patient one
    # treating specialist, so an invitation is one slot too.
    #
    # `id_specjalist_pending` set is a request nobody has answered; accepting
    # moves it into `id_specjalist` and stamps `specjalist_accepted_at`, and
    # refusing clears it -- the same shape as `parent_child.accepted_at`, and for
    # the same reason (see 0011). The state therefore lives in exactly one place
    # per phase: pending in one column, accepted in the other two.
    specjalist_pending = models.ForeignKey(
        Specjalist, db_column='id_specjalist_pending', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='pending_patients',
    )
    specjalist_accepted_at = models.DateTimeField(null=True, blank=True)
    is_child = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = 'patient'

    def __str__(self):
        return str(self.user_id)


class ParentChild(models.Model):
    id_parent_child = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(
        User, db_column='id_parent', on_delete=models.CASCADE,
        null=True, blank=True, related_name='children_links',
    )
    child = models.ForeignKey(
        User, db_column='id_child', on_delete=models.CASCADE,
        null=True, blank=True, related_name='parent_links',
    )
    # NULL means the child has named this guardian but the guardian has not
    # answered yet. Stored as the moment of the decision rather than a boolean
    # for the same reason as the consent columns on `user`: RODO art. 7(1) puts
    # the burden of proving consent on us, and "yes" without a date proves
    # nothing. A refusal deletes the row instead of setting a third state —
    # nothing in the app can undo a link, so a refused invitation that lingered
    # would leave the child permanently stuck with no way to ask anyone else.
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'parent_child'
        constraints = [
            models.UniqueConstraint(
                fields=['parent', 'child'], name='uniq_parent_child',
            ),
            models.CheckConstraint(
                condition=~models.Q(parent=models.F('child')),
                name='parent_child_not_self',
            ),
        ]


class ParentInvitation(models.Model):
    """A specialist's invitation for a guardian to create an account.

    Why it exists: a guardian account can be registered from the public form
    already, but nothing there can *link* it to a child -- that link is started
    by the child (`parent_child`, see core/guardian.py). A specialist sitting
    with a family needs the other direction: name the parent's address, name the
    child, and hand over a code the parent finishes registration with.

    Why a code and not a link in an e-mail: this deployment sends no mail at all
    (see CLAUDE.md), so an activation link has nothing to travel on. The code is
    given to the parent in the consulting room.

    WHAT IS NOT STORED IS THE POINT. `code_hash` holds the code the way
    `user.password_hash` holds a password -- hashed, so a database dump does not
    hand over usable invitations, and so the plaintext exists only in the one
    response that created it. A specialist who loses it revokes the invitation
    and issues another; there is deliberately no way to read it back.

    `email` binds the invitation to one address: the code alone is not enough,
    the parent has to register with the address the specialist named. `used_at`
    marks a redeemed invitation rather than deleting the row, so a specialist can
    see that the parent did register -- and so a code cannot be redeemed twice.
    """

    id_parent_invitation = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False,
    )
    specjalist = models.ForeignKey(
        Specjalist, db_column='id_specjalist', on_delete=models.CASCADE,
        related_name='parent_invitations',
    )
    # The patient this guardian will be linked to. A `user` row rather than a
    # `patient` one, because `parent_child` links two users -- and the check that
    # the child is actually this specialist's patient belongs to the request that
    # creates the invitation, not to the column.
    child = models.ForeignKey(
        User, db_column='id_child', on_delete=models.CASCADE,
        related_name='parent_invitations',
    )
    email = models.CharField(max_length=255)
    code_hash = models.CharField(max_length=255)
    # An invitation that is never redeemed stops working rather than waiting
    # forever: it carries the right to link itself to a named minor's account.
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'parent_invitation'

    def __str__(self):
        return f'{self.email} -> {self.child_id}'


class Diary(models.Model):
    id_diary = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_medical = models.UUIDField(db_index=True)
    current_mood = models.TextField(null=True, blank=True)
    current_strongest_emotion = models.TextField(null=True, blank=True)
    # How strongly 'Stres' was felt. The entry form rates it on the emotion
    # picker like the other nine, and `emotions.py` reads it as that emotion's
    # intensity -- there is no second, separate "stress slider" competing for
    # this column.
    stress_level = models.IntegerField(null=True, blank=True)
    energy_level = models.IntegerField(null=True, blank=True)
    tension_level = models.IntegerField(null=True, blank=True)
    # The CBT/ABC breakdown: what happened, where, what was felt, what was
    # thought, what was done. `situation_place` holds either one of the
    # suggested places or the free-text answer the patient typed instead --
    # one column, because a separate "was it from the list" flag is not worth
    # a schema of its own.
    situation = models.TextField(null=True, blank=True)
    situation_place = models.TextField(null=True, blank=True)
    # When the situation happened, as one of four buckets -- not when the entry
    # was written, which is `updated_at`. NULL is a perfectly normal answer:
    # the question is optional on the form and every entry written before the
    # column existed has nothing here, which is not a gap to backfill (nobody
    # can say afterwards what time of day those describe). The Polish labels
    # stay in `frontend/src/utils/timeOfDay.ts`; the column holds the key.
    # TextField like every other text column on this table -- `choices` is what
    # constrains the value, so a length limit would only be a second thing to
    # keep in step with `database_setup.sql` (see core.0002 for how that goes).
    time_of_day = models.TextField(
        choices=TIME_OF_DAY_CHOICES, null=True, blank=True,
    )
    emotion_note = models.TextField(null=True, blank=True)
    thought = models.TextField(null=True, blank=True)
    how_situation_handled = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    # Risky behaviour (self-harm, substance use, ...). NULL means the entry
    # reported none: there is no separate boolean, so an entry flagged without
    # a description cannot be told apart from an unflagged one -- see the note
    # in the entry form about keeping the description mandatory once flagged.
    risky_behavior_note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'diary'


class MoodScale(models.Model):
    id_scale = models.BigAutoField(primary_key=True)
    diary = models.ForeignKey(
        Diary, db_column='id_diary', on_delete=models.CASCADE,
        null=True, blank=True, related_name='mood_scales',
    )
    sadness_scale = models.IntegerField(null=True, blank=True)
    anxiety_scale = models.IntegerField(null=True, blank=True)
    anger_scale = models.IntegerField(null=True, blank=True)
    happiness_scale = models.IntegerField(null=True, blank=True)
    guilt_scale = models.IntegerField(null=True, blank=True)
    frustration_scale = models.IntegerField(null=True, blank=True)
    helplessness_scale = models.IntegerField(null=True, blank=True)
    shame_scale = models.IntegerField(null=True, blank=True)
    calm_scale = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'mood_scale'


class Technique(models.Model):
    """One therapeutic technique, as the catalogue shows it.

    The first four columns are the original table (and what `mock_data.sql`
    seeds); everything below them was added by 0012 so that a technique written
    by a specialist can be the *same kind of thing* as the ones the app ships
    with. `frontend/src/types/technique.ts` is the shape that was matched --
    schools as a list, an ordered list of steps, the availability flag -- and
    `core/techniques.py` holds the vocabularies, checked against that file by
    `test_techniques.py` the way `test_emotions.py` checks the emotion names.

    THE CATALOGUE THE APP SHIPS WITH IS STILL IN THE FRONTEND
    (`frontend/src/data/techniques.ts`), transcribed from the client's materials
    and awaiting clinical review. This table is what the specialist panel writes
    to, and the patient's catalogue is the two merged. Moving the hardcoded half
    in here is the obvious next step and deliberately not part of this change:
    that text is clinical content under review, and a copy in a database nobody
    reviews is how the reviewed version stops being the one on screen.

    `author_id_specjalist` is a **logical** reference to
    `user_db.specjalist.id_user`, not a foreign key -- `technique` lives in
    medical_db, and this project never crosses the two databases in a query (see
    the note on `id_medical` in `scripts/database_setup.sql`). NULL is what the
    app's own techniques would carry; every row written through the panel has it.
    It is not a permission: a technique is visible to every patient regardless of
    who wrote it (the decision behind this change), and this column says who to
    ask about the wording and whose panel may edit it.
    """

    id_technique = models.SmallAutoField(primary_key=True)
    name = models.TextField(null=True, blank=True)
    type = models.TextField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    # The stable identifier the URL carries (`/techniques/tipp`). Nullable
    # because the seeded rows predate it and nothing can invent one for them;
    # every row the panel writes has one, and it is what the merge with the
    # hardcoded catalogue is keyed on -- so a slug that collides with a built-in
    # technique is refused by the serializer rather than silently shadowing it.
    slug = models.CharField(max_length=64, unique=True, null=True, blank=True)
    subtitle = models.TextField(null=True, blank=True)
    # Which tabs the technique appears in: a list, not one value, because a
    # technique can genuinely belong to two schools at once (paced breathing is
    # both a component of TIPP and a classic relaxation technique). Copying the
    # description into two rows instead is what this avoids -- see the long note
    # on `Technique.szkola` in frontend/src/types/technique.ts.
    schools = models.JSONField(default=list, blank=True)
    dbt_group = models.TextField(null=True, blank=True)
    dbt_module = models.TextField(null=True, blank=True)
    # 'ogolna' or 'wymagaSpecjalisty'. The second is a safety flag rather than a
    # category: four techniques in the source material carry medical
    # contraindications, and `techniques.published` withholds anything not
    # 'ogolna' from the patient catalogue.
    availability = models.TextField(default=AVAILABILITY_GENERAL)
    intro = models.TextField(null=True, blank=True)
    # The ordered component skills, each `{"nazwa": str|None, "opis": str,
    # "przyklady": [str]}`. JSON rather than a `technique_step` table: a step has
    # no identity of its own, nothing ever queries one, and the whole list is
    # written and read as a unit by the form that edits it.
    steps = models.JSONField(default=list, blank=True)
    duration_min = models.IntegerField(null=True, blank=True)
    # Whether there is a description to open. False is a technique whose name is
    # known before its content, which the catalogue must not offer as a row --
    # see `isPublished` in frontend/src/utils/techniques.ts. The seeded rows are
    # False as well: they hold a name and a one-line `description` and none of
    # the structure the detail screen renders.
    description_ready = models.BooleanField(default=False)
    # Logical reference to user_db.specjalist.id_user -- see the class docstring.
    author_id_specjalist = models.UUIDField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        db_table = 'technique'

    def __str__(self):
        return self.name or str(self.id_technique)


class Raport(models.Model):
    id_raport = models.BigAutoField(primary_key=True)
    id_medical = models.UUIDField(db_index=True)
    technique = models.ForeignKey(
        Technique, db_column='id_technique', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='raports',
    )
    most_frequent_emotion = models.TextField(null=True, blank=True)
    avg_mood = models.TextField(null=True, blank=True)
    stress_level = models.IntegerField(null=True, blank=True)
    energy_level = models.IntegerField(null=True, blank=True)
    number_of_bad_days = models.IntegerField(null=True, blank=True)
    most_frequent_emotion_triggers = models.TextField(null=True, blank=True)
    technique_efficiency = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'raport'


class Hydration(models.Model):
    """One thing the patient drank, in the diet module's hydration screen.

    A row per serving rather than a running total per day, and that is the
    decision the rest of the feature rests on. A counter column would make "+1
    szklanka" a read-modify-write over a shared number -- two taps in the same
    second lose one of each other -- and it would leave nothing to undo: a
    mis-tap on a phone would be uncorrectable, because there would be no
    individual act to withdraw. Rows also make the "Ostatnie 7 dni" chart a
    GROUP BY rather than a second table.

    `entry_date` is stored rather than derived from `created_at`, unlike
    `diary`. The two are the same question -- which calendar day, in
    `settings.TIME_ZONE`, this belongs to -- but the diary answers it once per
    row in Python, while this table is grouped by day seven days at a time. A
    date column keeps that a single indexed query instead of a timezone
    conversion Postgres would have to run over every row. `core/days.py` is
    still the only place the boundary itself is decided; nothing here computes
    it.

    `drink` holds one of `core.drinks.DRINKS`, the Polish name as written. Only
    'Woda' counts towards the daily goal -- everything else is recorded and
    deliberately not converted, which is the client's rule and not a rounding
    we have not got round to (see core/drinks.py).

    `amount_ml` is NULL for every drink but water. The mockup's "Inne napoje"
    card offers a chip and no quantity, so a serving of tea is recorded as
    having happened and nothing more; inventing 250 ml for it would put a number
    in a clinical record that nobody entered.

    `id_medical` is the same logical, application-level reference `diary` uses:
    this table is in medical_db and `patient` is in user_db, so Postgres
    enforces nothing across it.
    """

    id_hydration = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_medical = models.UUIDField(db_index=True)
    # The calendar day this serving belongs to, in settings.TIME_ZONE. Indexed
    # together with id_medical, because every query here is "this patient, these
    # seven days".
    entry_date = models.DateField()
    drink = models.TextField(choices=[(name, name) for name in DRINKS], default=WATER)
    amount_ml = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hydration'
        indexes = [
            models.Index(fields=['id_medical', 'entry_date'], name='idx_hydration_patient_day'),
        ]


class DietMeal(models.Model):
    """One meal, in the diet module's food diary (mockups §04-§07).

    A row per meal, and a day is the group of them — the module's own vocabulary
    ("DZISIEJSZY DZIENNICZEK", "Historia dzienniczków żywieniowych"). There is
    no `diet_day` table above it: a day has nothing of its own to store that is
    not derivable from its meals, and one would only be a second answer to "how
    many meals did Tuesday hold".

    WHAT A MEAL MAY HOLD is decided by §04, which states the scope outright: no
    product search and no numeric field, a photo and a description being the
    only two sources of its content. So there is no weight column here, no
    portion size, no calorie count and no product reference — not missing, but
    excluded, and this is the table somebody would add them to.

    THE PHOTO IS NOT HERE YET, and that is the module's largest open question
    rather than an oversight: it would be the first file this deployment ever
    stored, and where it lives, how long it is kept and which consent covers it
    are all unanswered (see CLAUDE.md). It joins this table when it has somewhere
    to live; nothing else about the shape changes when it does.

    NOTHING IS REQUIRED, which is §05's rule ("Żadne pole nie blokuje zapisu")
    expressed in the schema rather than only in a form: `kind` and `eaten_at`
    are nullable and `description` may be empty. A meal that answers nothing is
    an ordinary row, and the history screen renders it as one.

    `entry_date` is stored rather than derived from `created_at`, for the same
    reason `hydration` stores it: this table is grouped by day, seven or thirty
    days at a time, and a date column plus `(id_medical, entry_date)` keeps that
    one indexed query instead of a timezone conversion over every row.
    `core/days.py` is still the only place the boundary itself is decided.

    `id_medical` is the same logical, application-level reference `diary` uses:
    this table is in medical_db and `patient` in user_db, so Postgres enforces
    nothing across it.
    """

    id_meal = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_medical = models.UUIDField(db_index=True)
    # The calendar day this meal belongs to, in settings.TIME_ZONE.
    entry_date = models.DateField()
    # One of core.meals.MEAL_KINDS, the Polish name as written -- or NULL, which
    # is a meal saved without saying which one it was. TextField like every
    # other text column on these tables; the serializer is what constrains the
    # value, so a length limit would only be a second thing to keep in step with
    # database_setup.sql (see core.0002 for how that goes).
    kind = models.TextField(null=True, blank=True)
    # 'Przekąska · 16:20' -- the hour as the mockups label a meal. A time rather
    # than a moment, and nullable: an hour left blank is an answer not given,
    # not a midnight.
    eaten_at = models.TimeField(null=True, blank=True)
    # What the patient typed. '' rather than NULL for "saved without a
    # description", because unlike `kind` there is no third state to tell apart
    # -- the field was on screen and left empty.
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'diet_meal'
        indexes = [
            models.Index(fields=['id_medical', 'entry_date'], name='idx_diet_meal_patient_day'),
        ]

    def __str__(self):
        return f'{self.entry_date} {self.kind or "posiłek"}'


class Supplement(models.Model):
    """One preparation the patient takes — "Suplementy i leki", mockups §08.

    "Lista z dawką, częstotliwością, godziną oraz datami rozpoczęcia i
    zakończenia" is the section's own description of it, and those are the
    columns. Nothing here is computed and nothing is scored: this module counts
    no missed doses and holds no adherence figure, which is a deliberate absence
    on a screen a patient opens every morning (see core/supplements.py).

    ONLY `name` IS REQUIRED. Somebody who knows they take magnesium and not the
    dose should be able to write it down, so every other column is nullable and
    the serializer normalises a blank answer to NULL — one representation of "not
    answered" rather than two.

    `end_date` NULL means **bezterminowo**, the artboard's own wording, rather
    than an unanswered question. There is no third column for the mockup's "wg
    zaleceń lekarza" variant: `frequency` is free text and that is where it goes.

    `reminder_enabled` is stored although **nothing sends a reminder**: this
    deployment has no push and no mail. It is the patient's answer to a question
    the screen asks, kept so that the day a scheduler exists it reads a column
    rather than asking everybody again — and the screen says out loud that
    nothing is sent yet, because a switch that silently promises a notification
    is the mistake the home screen's technique card was.

    Medicines are health data of the most ordinary kind, so this table is in
    medical_db behind the same `id_medical` as everything else. The open question
    §08 states — whether this is the same list as the health profile's
    "przyjmowane leki" — cannot be answered until §13 exists; today this is the
    only place a medicine lives.
    """

    id_supplement = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_medical = models.UUIDField(db_index=True)
    name = models.TextField()
    # '2000 IU', '200 mg' -- free text, deliberately: a unit picker would be a
    # dictionary to maintain for a line nothing computes from.
    dose = models.TextField(null=True, blank=True)
    # 'raz dziennie', 'wg zaleceń lekarza'.
    frequency = models.TextField(null=True, blank=True)
    # The hours are their own table (`SupplementHour`, reachable as `.hours`),
    # because a preparation can be taken more than once a day. No rows there is
    # "no fixed hour", which is what a NULL in the old single column meant.
    start_date = models.DateField(null=True, blank=True)
    # NULL is 'bezterminowo' -- see the class docstring.
    end_date = models.DateField(null=True, blank=True)
    reminder_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'supplement'
        indexes = [
            models.Index(fields=['id_medical'], name='idx_supplement_patient'),
        ]

    def __str__(self):
        return self.name


class SupplementHour(models.Model):
    """One of the hours a preparation is taken at.

    A row per hour rather than one column, because somebody takes a probiotic
    at 06:45 and again at 12:00 and that is *one* preparation — two rows on the
    list would read as two different probiotics. Zero rows means no fixed hour,
    which is what a NULL in the old `supplement.hour` meant.

    A TABLE RATHER THAN A JSONB COLUMN, unlike `technique.schools`/`steps`. The
    argument there was that a step has no identity and nothing queries one;
    both are false here. `reminder_enabled` exists so that the day a scheduler
    arrives it reads a value rather than asking everybody again, and what that
    scheduler asks is "which preparations are due at 06:45" — a query by hour.

    `supplement` is a real foreign key with CASCADE, like `SupplementIntake`'s
    and for the same reason: both tables are in medical_db, so Postgres can
    enforce it, and an hour belongs to the preparation it is an hour of. The
    application-only join is the one that crosses databases.
    """

    id_supplement_hour = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    supplement = models.ForeignKey(
        Supplement, on_delete=models.CASCADE, db_column='id_supplement',
        related_name='hours',
    )
    hour = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'supplement_hour'
        indexes = [
            models.Index(fields=['hour'], name='idx_supplement_hour_hour'),
        ]
        constraints = [
            # The same hour twice is a double-submitted form, not a second
            # dose — the same choice `uq_supplement_intake_day` makes.
            models.UniqueConstraint(
                fields=['supplement', 'hour'], name='uq_supplement_hour',
            ),
        ]

    def __str__(self):
        return f'{self.supplement_id} {self.hour}'


class SupplementIntake(models.Model):
    """"Odhacz, kiedy weźmiesz" — one tick, for one preparation, on one day.

    A row per (supplement, day) rather than a boolean on `supplement`, which is
    the same argument `hydration` makes for a row per serving: a column would be
    a running value two taps can race, it could not be undone in a way that
    leaves the earlier days intact, and it could not answer "did I take it on
    Tuesday" at all. The unique constraint is what makes a double-tapped
    checkbox one row instead of two.

    AN ABSENT ROW IS NOT A RECORD OF A MISSED DOSE. There is no third state
    here: unticking deletes, and nothing in this app stores that somebody did
    not take a medicine. Recording that would be a judgement the app is not
    entitled to make, and it is the column an adherence score would be built
    from.

    A REAL FOREIGN KEY, unlike `id_medical` everywhere else in medical_db: both
    tables are in the same database, so Postgres can and does enforce it, and
    CASCADE is right — a tick belongs to the preparation it ticks off, and
    deleting the preparation is the patient saying it is no longer part of their
    regimen. Whose row it is comes from `supplement.id_medical`, deliberately
    not copied here: two places recording that are two places free to disagree.
    """

    id_intake = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplement = models.ForeignKey(
        Supplement, db_column='id_supplement', on_delete=models.CASCADE,
        related_name='intakes',
    )
    # The calendar day it was taken on, in settings.TIME_ZONE. Only today is
    # tickable; the view is what passes today in.
    entry_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'supplement_intake'
        constraints = [
            models.UniqueConstraint(
                fields=['supplement', 'entry_date'],
                name='uq_supplement_intake_day',
            ),
        ]

    def __str__(self):
        return f'{self.supplement_id} {self.entry_date}'
