import uuid

from django.db import models

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
