"""Synthetic HTTP failures: retries cannot turn an integrity failure into success."""
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from verify_live_integrity import download_resource

BASE = 'https://synthetic.invalid/app/'
URL = BASE + 'index.html?v=' + '0' * 40


def response(url=URL):
    result = MagicMock()
    result.__enter__.return_value.url = url
    result.__enter__.return_value.read.return_value = b'fixed asset'
    return result


class LiveDownloadTests(unittest.TestCase):
    @patch('verify_live_integrity.time.sleep')
    @patch('verify_live_integrity.urllib.request.urlopen')
    def test_transient_failure_recovers_same_url(self, fetch, sleep):
        for status in (429, 500, 502, 503, 504):
            with self.subTest(status=status):
                fetch.reset_mock()
                sleep.reset_mock()
                fetch.side_effect = [HTTPError(URL, status, 'temporary', {}, None), response()]
                self.assertEqual(download_resource(URL, BASE), b'fixed asset')
                self.assertEqual(fetch.call_count, 2)
                self.assertTrue(all(call.args == (URL,) for call in fetch.call_args_list))
                sleep.assert_called_once_with(1)

    @patch('verify_live_integrity.time.sleep')
    @patch('verify_live_integrity.urllib.request.urlopen')
    def test_persistent_failure_is_bounded_and_fatal(self, fetch, sleep):
        fetch.side_effect = HTTPError(URL, 503, 'temporary', {}, None)
        with self.assertRaises(HTTPError):
            download_resource(URL, BASE)
        self.assertEqual(fetch.call_count, 4)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [1, 2, 4])

    @patch('verify_live_integrity.time.sleep')
    @patch('verify_live_integrity.urllib.request.urlopen')
    def test_other_errors_fail_immediately(self, fetch, sleep):
        for status in (400, 401, 403, 404, 410, 501):
            with self.subTest(status=status):
                fetch.reset_mock()
                fetch.side_effect = HTTPError(URL, status, 'permanent', {}, None)
                with self.assertRaises(HTTPError):
                    download_resource(URL, BASE)
                self.assertEqual(fetch.call_count, 1)
        sleep.assert_not_called()

    @patch('verify_live_integrity.time.sleep')
    @patch('verify_live_integrity.urllib.request.urlopen')
    def test_redirect_escape_fails_without_retry(self, fetch, sleep):
        fetch.return_value = response('https://synthetic.invalid/other/index.html')
        with self.assertRaisesRegex(ValueError, 'redirect left'):
            download_resource(URL, BASE)
        fetch.assert_called_once()
        sleep.assert_not_called()

    @patch('verify_live_integrity.time.sleep')
    @patch('verify_live_integrity.urllib.request.urlopen')
    def test_timeouts_retry_but_certificate_failures_do_not(self, fetch, sleep):
        from urllib.error import URLError
        import ssl
        for error in (TimeoutError('read timeout'), URLError(TimeoutError('connect timeout'))):
            fetch.reset_mock()
            fetch.side_effect = [error, response()]
            self.assertEqual(download_resource(URL, BASE), b'fixed asset')
            self.assertEqual(fetch.call_count, 2)
        fetch.reset_mock()
        fetch.side_effect = TimeoutError('persistent timeout')
        with self.assertRaises(TimeoutError):
            download_resource(URL, BASE)
        self.assertEqual(fetch.call_count, 4)
        fetch.reset_mock()
        sleep.reset_mock()
        fetch.side_effect = URLError(ssl.SSLCertVerificationError('invalid certificate'))
        with self.assertRaises(URLError):
            download_resource(URL, BASE)
        fetch.assert_called_once()
        sleep.assert_not_called()
