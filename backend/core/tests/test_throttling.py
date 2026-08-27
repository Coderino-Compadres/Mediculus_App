"""What the throttle writes into the cache key.

The cap itself is covered where the endpoints are (test_auth_api.ThrottleTests,
test_guardian_api.ThrottleTests); this file is about the *ident* those counters
are keyed on, which is a privacy decision rather than a rate-limiting one — see
core/throttling.py. No database.
"""

import hashlib

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory

from core.throttling import IDENT_LENGTH, AuthThrottle, GuardianLinkThrottle

ADDRESS = '198.51.100.7'
OTHER_ADDRESS = '203.0.113.9'


def ident_for(address, **extra):
    request = APIRequestFactory().post('/api/auth/login/', REMOTE_ADDR=address, **extra)
    return AuthThrottle().get_ident(request)


class HashedIdentTests(SimpleTestCase):
    def test_the_address_does_not_appear_in_the_ident(self):
        """DRF puts this straight into the cache key, and that key can end up in
        a database table next to the PII. An IP is personal data; the throttle
        does not need it, only a way to tell two callers apart."""
        ident = ident_for(ADDRESS)

        self.assertNotIn(ADDRESS, ident)
        self.assertNotEqual(ident, ADDRESS)

    def test_it_is_a_sha256_digest(self):
        ident = ident_for(ADDRESS)

        self.assertEqual(len(ident), IDENT_LENGTH)
        self.assertTrue(all(character in '0123456789abcdef' for character in ident))

    def test_the_same_caller_still_lands_on_the_same_counter(self):
        """The whole point of the ident: hashing must not turn every request
        into a fresh budget, which would make the cap count nothing."""
        self.assertEqual(ident_for(ADDRESS), ident_for(ADDRESS))

    def test_two_callers_do_not_share_a_counter(self):
        self.assertNotEqual(ident_for(ADDRESS), ident_for(OTHER_ADDRESS))

    def test_the_digest_is_keyed_on_the_secret(self):
        """A bare SHA-256 of an IPv4 address is 2**32 candidates — reversible in
        seconds, and therefore not pseudonymization at all. Keying on SECRET_KEY
        is what makes the digest mean nothing to whoever reads the table."""
        self.assertNotEqual(ident_for(ADDRESS), hashlib.sha256(ADDRESS.encode()).hexdigest())

        with override_settings(SECRET_KEY='a-different-secret'):
            under_another_secret = ident_for(ADDRESS)

        self.assertNotEqual(ident_for(ADDRESS), under_another_secret)

    def test_a_request_with_no_address_at_all_is_survivable(self):
        """get_ident returns None when there is neither REMOTE_ADDR nor a usable
        X-Forwarded-For. Hashing must not turn that into an AttributeError."""
        request = APIRequestFactory().post('/api/auth/login/')
        del request.META['REMOTE_ADDR']

        self.assertIsNone(AuthThrottle().get_ident(request))

    def test_the_guardian_throttle_hashes_too(self):
        """It keys on the account's primary key while the view requires a
        session, so this only matters if that ever changes — which is exactly
        when nobody would remember to add it."""
        request = APIRequestFactory().post('/api/auth/guardian/', REMOTE_ADDR=ADDRESS)

        self.assertNotIn(ADDRESS, GuardianLinkThrottle().get_ident(request))


class IdentReadsForwardedForTests(SimpleTestCase):
    """Hashing sits on top of DRF's own ident logic rather than replacing it, so
    whatever NUM_PROXIES decides is what gets hashed. These pin that the mixin
    did not accidentally start reading REMOTE_ADDR directly."""

    def test_the_forwarded_header_still_reaches_the_digest(self):
        with_header = ident_for(ADDRESS, HTTP_X_FORWARDED_FOR='192.0.2.1')

        self.assertNotEqual(with_header, ident_for(ADDRESS))
