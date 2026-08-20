MEDICAL_MODELS = {'diary', 'moodscale', 'technique', 'raport'}


class CoreDatabaseRouter:
    """
    Keeps `core` app tables split across the two physical databases even
    though they all live in one Django app. This only governs migrations
    (`allow_migrate`) - reads/writes still need an explicit
    `.using('medical')` since db_for_read/db_for_write aren't overridden.
    """

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label != 'core':
            return db == 'default'
        if model_name in MEDICAL_MODELS:
            return db == 'medical'
        return db == 'default'
