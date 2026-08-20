MEDICAL_MODELS = {'diary', 'moodscale', 'technique', 'raport'}


def _db_for_model(model):
    if model._meta.app_label != 'core':
        return None
    return 'medical' if model._meta.model_name in MEDICAL_MODELS else 'default'


class CoreDatabaseRouter:
    def db_for_read(self, model, **hints):
        return _db_for_model(model)

    def db_for_write(self, model, **hints):
        return _db_for_model(model)

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label != 'core':
            return db == 'default'
        if model_name is None:
            target_db = hints.get('target_db')
            return True if target_db is None else db == target_db
        if model_name in MEDICAL_MODELS:
            return db == 'medical'
        return db == 'default'
