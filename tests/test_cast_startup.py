import asyncio
import unittest
from unittest.mock import AsyncMock, Mock, patch
from test_regressions import module


class CastStartupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = module.Plugin()
        self.plugin._check_audio_updates = AsyncMock()
        self.plugin._load_settings = Mock()
        self.plugin._try_init_ytmusic = Mock()
        self.plugin._start_cast_backend = AsyncMock()
        self.plugin._stop_cast_backend = AsyncMock()

    async def test_startup_uses_existing_settings_restart_after_initial_start(self):
        events = []
        self.plugin._start_cast_backend.side_effect = lambda: events.append('start')
        self.plugin._stop_cast_backend.side_effect = lambda: events.append('stop')
        self.plugin.queue = [{'videoId': 'old-session'}]
        self.plugin.queue_position = 2
        self.plugin.shuffle_order = [2, 1]
        self.plugin.is_playing = True
        self.plugin.volume = .65
        self.plugin.cast_device_name = 'My Deck'
        with patch.object(self.plugin, 'hard_reset', wraps=self.plugin.hard_reset) as reset:
            await self.plugin._main()
            reset.assert_awaited_once_with()
        self.assertEqual(events, ['start', 'stop', 'start'])
        self.assertEqual(self.plugin.queue, [])
        self.assertEqual(self.plugin.queue_position, 0)
        self.assertEqual(self.plugin.shuffle_order, [])
        self.assertFalse(self.plugin.is_playing)
        self.assertEqual(self.plugin.volume, .65)
        self.assertEqual(self.plugin.cast_device_name, 'My Deck')

    async def test_restart_waits_for_initial_start_to_finish(self):
        entered, ready = asyncio.Event(), asyncio.Event()
        async def initial_start():
            entered.set()
            await ready.wait()
        self.plugin._start_cast_backend.side_effect = initial_start
        self.plugin.hard_reset = AsyncMock(return_value={'success': True})
        boot = asyncio.create_task(self.plugin._main())
        await asyncio.wait_for(entered.wait(), 1)
        self.plugin.hard_reset.assert_not_awaited()
        ready.set()
        await asyncio.wait_for(boot, 1)
        self.plugin.hard_reset.assert_awaited_once_with()

    async def test_failed_restart_is_logged_without_a_retry_loop(self):
        self.plugin.hard_reset = AsyncMock(return_value={'success': False, 'error': 'Restart failed'})
        with patch.object(module.decky.logger, 'error') as log:
            await self.plugin._main()
        log.assert_called_once_with('Restart failed')
        self.plugin.hard_reset.assert_awaited_once_with()


if __name__ == '__main__':
    unittest.main()
