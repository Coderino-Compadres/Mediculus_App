"""Unit tests for CoreDatabaseRouter — pure logic, no database needed."""

import importlib

from django.contrib.auth.models import User as AuthUser
from django.contrib.sessions.models import Session
from django.test import SimpleTestCase

from core import models
from core.routers import MEDICAL_MODELS, CoreDatabaseRouter

MEDICAL = [models.Diary, models.MoodScale, models.Technique, models.Raport]
USER_SIDE = [models.User, models.UserRole, models.Specjalist,
             models.Patient, models.ParentChild]


class RouterPlacementTests(SimpleTestCase):
    def setUp(self):
        self.router = CoreDatabaseRouter()

    def test_medical_models_route_to_medical(self):
        for model in MEDICAL:
            with self.subTest(model=model.__name__):
                self.assertEqual(self.router.db_for_read(model), 'medical')
                self.assertEqual(self.router.db_for_write(model), 'medical')

    def test_user_models_route_to_default(self):
        for model in USER_SIDE:
            with self.subTest(model=model.__name__):
                self.assertEqual(self.router.db_for_read(model), 'default')
                self.assertEqual(self.router.db_for_write(model), 'default')

    def test_non_core_models_are_not_claimed(self):
        """Returning None lets Django fall back to its own default."""
        for model in (AuthUser, Session):
            with self.subTest(model=model.__name__):
                self.assertIsNone(self.router.db_for_read(model))
                self.assertIsNone(self.router.db_for_write(model))

    def test_medical_models_set_has_no_stale_names(self):
        """A typo in MEDICAL_MODELS would silently send a model to 'default'."""
        core_model_names = {m._meta.model_name for m in models.__dict__.values()
                            if hasattr(m, '_meta') and m._meta.app_label == 'core'}
        self.assertLessEqual(MEDICAL_MODELS, core_model_names)
        self.assertEqual(MEDICAL_MODELS, {m._meta.model_name for m in MEDICAL})


class AllowMigrateTests(SimpleTestCase):
    def setUp(self):
        self.router = CoreDatabaseRouter()

    def test_medical_tables_only_on_medical(self):
        for name in sorted(MEDICAL_MODELS):
            with self.subTest(model=name):
                self.assertTrue(self.router.allow_migrate('medical', 'core', model_name=name))
                self.assertFalse(self.router.allow_migrate('default', 'core', model_name=name))

    def test_user_tables_only_on_default(self):
        for model in USER_SIDE:
            name = model._meta.model_name
            with self.subTest(model=name):
                self.assertTrue(self.router.allow_migrate('default', 'core', model_name=name))
                self.assertFalse(self.router.allow_migrate('medical', 'core', model_name=name))

    def test_other_apps_only_on_default(self):
        """Why 'Applying auth.0001... OK' on --database=medical creates no tables."""
        for app in ('auth', 'admin', 'sessions', 'contenttypes'):
            with self.subTest(app=app):
                self.assertTrue(self.router.allow_migrate('default', app, model_name='whatever'))
                self.assertFalse(self.router.allow_migrate('medical', app, model_name='whatever'))

    def test_unhinted_data_migration_runs_on_both(self):
        """RunPython/RunSQL arrive with model_name=None; unpinned means both DBs."""
        for db in ('default', 'medical'):
            with self.subTest(db=db):
                self.assertTrue(self.router.allow_migrate(db, 'core', model_name=None))

    def test_hinted_data_migration_is_pinned(self):
        """Django spreads an operation's hints as kwargs, so target_db arrives flat."""
        for target in ('default', 'medical'):
            other = 'medical' if target == 'default' else 'default'
            with self.subTest(target_db=target):
                self.assertTrue(self.router.allow_migrate(
                    target, 'core', model_name=None, target_db=target))
                self.assertFalse(self.router.allow_migrate(
                    other, 'core', model_name=None, target_db=target))

    def test_migration_0002_hints_match_what_the_router_expects(self):
        """Pins the hint key: renaming it would silently run the RunSQL on both DBs."""
        module = importlib.import_module('core.migrations.0002_align_faked_schema')
        targets = sorted(op.hints.get('target_db') for op in module.Migration.operations)
        self.assertEqual(targets, ['default', 'medical'])
        for target in targets:
            for db in ('default', 'medical'):
                with self.subTest(target_db=target, db=db):
                    self.assertEqual(
                        self.router.allow_migrate(db, 'core', model_name=None, target_db=target),
                        db == target)
