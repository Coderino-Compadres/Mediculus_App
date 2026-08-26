import uuid

from django.db import models

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
    id_technique = models.SmallAutoField(primary_key=True)
    name = models.TextField(null=True, blank=True)
    type = models.TextField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)

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
