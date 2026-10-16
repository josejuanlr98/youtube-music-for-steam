import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit
from test_regressions import module


class AudioTransportTests(unittest.TestCase):
    def lookup(self, results):
        self.plugin = module.Plugin()
        self.plugin._check_audio_runtime = Mock()
        self.commands = []
        with tempfile.TemporaryDirectory() as directory:
            auth = Path(directory) / 'browser.json'
            auth.write_text(json.dumps({'cookie': 'SID=synthetic'}))
            binary = Path(directory) / 'yt-dlp'
            binary.touch()
            def run(command, **kwargs):
                self.commands.append(list(command))
                code, output, error = results.pop(0)
                return SimpleNamespace(returncode=code, stdout=output, stderr=error)
            with patch.object(module, 'BROWSER_AUTH_FILE', str(auth)), \
                 patch.object(module, 'YTDLP_BIN', str(binary)), \
                 patch.object(module.subprocess, 'run', side_effect=run):
                return self.plugin._get_streaming_url('song')

    def test_public_audio_omits_cookies_and_routes_through_local_relay(self):
        source = 'https://rr1.googlevideo.com/videoplayback?clen=100&sig=synthetic'
        result = self.lookup([(0, source, '')])
        self.assertEqual(len(self.commands), 1)
        self.assertNotIn('--cookies', self.commands[0])
        self.assertEqual(urlsplit(result).netloc, '127.0.0.1:39281')
        self.assertEqual(parse_qs(urlsplit(result).query)['src'], [source])

    def test_auth_required_lookup_retries_with_private_cookie_file(self):
        result = self.lookup([(1, '', 'Sign in required'), (0, 'https://audio.test/private', '')])
        self.assertEqual(result, 'https://audio.test/private')
        self.assertNotIn('--cookies', self.commands[0])
        self.assertIn('--cookies', self.commands[1])
        cookie_file = self.commands[1][self.commands[1].index('--cookies') + 1]
        self.assertFalse(Path(cookie_file).exists())
        self.assertNotIn('synthetic', ' '.join(self.commands[1]))

    def test_auth_failure_is_reported_and_cookie_file_is_removed(self):
        with self.assertRaises(module.AudioLookupError) as caught:
            self.lookup([(1, '', 'Sign in required'), (1, '', 'Sign in required')])
        self.assertEqual(caught.exception.code, 'YOUTUBE_AUTH_REQUIRED')
        cookie_file = self.commands[1][self.commands[1].index('--cookies') + 1]
        self.assertFalse(Path(cookie_file).exists())
