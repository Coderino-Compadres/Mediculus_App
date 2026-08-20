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
    email = models.CharField(max_length=255, null=True, blank=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True)
    name = models.TextField(null=True, blank=True)
    surname = models.TextField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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

    class Meta:
        db_table = 'parent_child'


class Diary(models.Model):
    id_diary = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    id_medical = models.UUIDField()
    current_mood = models.TextField(null=True, blank=True)
    current_strongest_emotion = models.TextField(null=True, blank=True)
    stress_level = models.IntegerField(null=True, blank=True)
    energy_level = models.IntegerField(null=True, blank=True)
    overall_feeling = models.TextField(null=True, blank=True)
    situation = models.TextField(null=True, blank=True)
    situation_place = models.TextField(null=True, blank=True)
    how_situation_handled = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
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
    id_medical = models.UUIDField()
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
