import asyncio
import unittest
from unittest.mock import AsyncMock, Mock
from test_regressions import module
from ytm_catalog import entry, entries


class CatalogTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.p=module.Plugin()
        self.p.ytmusic=Mock()
        self.p._api_call=AsyncMock()

    def test_normalization_skips_unavailable_and_keeps_album_metadata(self):
        items=[None,{}, {'videoId':'hidden','isAvailable':False},
               {'videoId':'song','title':'Song','duration':'3:21','album':'Album'}]
        result=entries(items,'song',{'artist':'Artist','image':'cover'})
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['track'],{'videoId':'song','title':'Song','artist':'Artist',
                                           'album':'Album','albumArt':'cover','duration':201})
        self.assertEqual(entry({'browseId':'VLPLabc','title':'Playlist'},'playlist')['id'],'PLabc')
        self.assertEqual(entry({'browseId':'UCabc','artist':'Artist'},'artist')['title'],'Artist')
        self.assertEqual(entry({'browseId':'album','playlistId':'PLalbum'},'album')['playlistId'],'PLalbum')

    async def test_library_preview_and_complete_limits(self):
        self.p._api_call.return_value=[{'videoId':str(i),'title':'Song'} for i in range(25)]
        preview=await self.p.get_library_items('songs',limit=0)
        self.p._api_call.assert_awaited_with('get_library_songs',limit=0)
        self.assertTrue(preview['hasMore'])
        complete=await self.p.get_library_items('songs',limit=None)
        self.p._api_call.assert_awaited_with('get_library_songs',limit=None)
        self.assertFalse(complete['hasMore'])
        self.p._api_call.return_value=[]
        self.assertFalse((await self.p.get_library_items('albums',limit=0))['hasMore'])
        for limit in (-1,5001,'bad'):
            self.assertIn('error',await self.p.get_library_items('songs',limit=limit))

    async def test_refresh_invalidates_previous_library_windows(self):
        self.p._api_call.return_value=[{'videoId':'old','title':'Old'}]
        await self.p.get_library_items('songs',limit=200)
        self.p._api_call.return_value=[{'videoId':'new','title':'New'}]
        await self.p.get_library_items('songs',refresh=True,limit=0)
        result=await self.p.get_library_items('songs',limit=200)
        self.assertEqual(result['entries'][0]['id'],'new')

    async def test_playlist_library_preview_then_full_refresh(self):
        self.p._api_call.return_value=[{'playlistId':'old','title':'Old'}]
        await self.p.get_library_playlists()
        self.p._api_call.return_value=[{'playlistId':'new','title':'New'}]
        first=await self.p.get_library_playlists(refresh=True,limit=0)
        self.assertTrue(first['hasMore'])
        self.p._api_call.assert_awaited_with('get_library_playlists',limit=0)
        complete=await self.p.get_library_playlists()
        self.p._api_call.assert_awaited_with('get_library_playlists',limit=None)
        self.assertFalse(complete['hasMore'])
        self.assertEqual(complete['playlists'][1]['playlistId'],'new')
        count=self.p._api_call.await_count
        await self.p.get_library_playlists()
        self.assertEqual(self.p._api_call.await_count,count)

    async def test_playlist_refresh_discards_late_old_read(self):
        started,release=asyncio.Event(),asyncio.Event()
        async def read(method,**kwargs):
            if kwargs['limit'] is None:
                started.set();await release.wait()
                return [{'playlistId':'old','title':'Old'}]
            return [{'playlistId':'new','title':'New'}]
        self.p._api_call.side_effect=read
        old=asyncio.create_task(self.p.get_library_playlists())
        await started.wait()
        fresh=await self.p.get_library_playlists(refresh=True,limit=0)
        release.set()
        self.assertIn('error',await old)
        self.assertEqual(fresh['playlists'][1]['playlistId'],'new')
        self.assertIsNone(self.p._cached_playlists)
        preview=await self.p.get_library_playlists(limit=0)
        self.assertEqual(preview['playlists'][1]['playlistId'],'new')

    async def test_category_refresh_rejects_old_continuation(self):
        started,release=asyncio.Event(),asyncio.Event()
        async def read(method,**kwargs):
            if kwargs['limit']==200:
                started.set();await release.wait()
                return [{'videoId':'old','title':'Old'}]
            return [{'videoId':'new','title':'New'}]
        self.p._api_call.side_effect=read
        old=asyncio.create_task(self.p.get_library_items('songs',limit=200))
        await started.wait()
        fresh=await self.p.get_library_items('songs',refresh=True,limit=0)
        release.set()
        self.assertIn('error',await old)
        self.assertEqual(fresh['entries'][0]['id'],'new')
        self.assertFalse(any(value[1].get('entries',[{}])[0].get('id')=='old' for value in self.p._catalog_cache.values()))

    async def test_playlist_preview_deduplicates_and_validates(self):
        started,release=asyncio.Event(),asyncio.Event()
        async def read(*args,**kwargs):
            started.set();await release.wait();return []
        self.p._api_call.side_effect=read
        first=asyncio.create_task(self.p.get_library_playlists(limit=0))
        await started.wait()
        second=asyncio.create_task(self.p.get_library_playlists(limit=0))
        await asyncio.sleep(0);release.set()
        a,b=await asyncio.gather(first,second)
        self.assertEqual(a,b)
        self.assertFalse(a['hasMore'])
        self.p._api_call.assert_awaited_once()
        for limit in (-1,True,'bad',200):
            self.assertIn('error',await self.p.get_library_playlists(limit=limit))

    async def test_categories_map_to_correct_library_endpoints(self):
        for category,kind,id_key in [('albums','album','browseId'),('artists','artist','browseId'),('songs','song','videoId')]:
            self.p._api_call.return_value=[{id_key:'id','title':'Title'}]
            result=await self.p.get_library_items(category)
            self.assertEqual(result['entries'][0]['kind'],kind)
            self.p._api_call.assert_awaited_with('get_library_'+category,limit=100)

    async def test_search_filters_and_mixed_results(self):
        self.p._api_call.return_value=[
            {'resultType':'song','videoId':'song','title':'Song'},
            {'resultType':'album','browseId':'album','title':'Album'},
            {'resultType':'artist','browseId':'artist','artist':'Artist'},
            {'resultType':'playlist','browseId':'VLplaylist','title':'Playlist'}]
        result=await self.p.search_catalog(' query ')
        self.assertEqual([item['kind'] for item in result['entries']],['song','album','artist','playlist'])
        self.p._api_call.assert_awaited_with('search','query',filter=None,limit=40)
        self.p._api_call.return_value=[{'videoId':'another','title':'Another'}]
        await self.p.search_catalog('query','songs')
        self.p._api_call.assert_awaited_with('search','query',filter='songs',limit=40)

    async def test_album_inherits_cover_and_artist_without_new_song_lookups(self):
        self.p._api_call.return_value={'title':'Album','artists':[{'name':'Artist'}],
            'audioPlaylistId':'PLalbum','thumbnails':[{'url':'small'},{'url':'large'}],
            'tracks':[{'videoId':'song','title':'Song','duration_seconds':123,'thumbnails':None}]}
        result=await self.p.get_catalog_detail('album','MPREalbum')
        self.assertEqual(result['playlistId'],'PLalbum')
        self.assertEqual(result['entries'][0]['track']['artist'],'Artist')
        self.assertEqual(result['entries'][0]['image'],'large')
        self.p._api_call.assert_awaited_once_with('get_album','MPREalbum')

    async def test_artist_filters_load_full_release_lists_and_reuse_artist(self):
        artist={'name':'Artist','songs':{'results':[{'videoId':'song','title':'Song'}]},
                'albums':{'browseId':'UCrelease','params':'albums-token','results':[{'browseId':'album','title':'Album'}]},
                'singles':{'params':'single-token','results':[]},
                'related':{'results':[{'browseId':'related','title':'Other Artist'}]}}
        async def read(method,*args,**kwargs):
            if method=='get_artist':return artist
            if method=='get_artist_albums':return [{'browseId':'fullalbum','title':'Full Album'}]
            raise AssertionError(method)
        self.p._api_call.side_effect=read
        all_items=await self.p.get_catalog_detail('artist','UCartist')
        self.assertEqual([e['kind'] for e in all_items['entries']],['song','album','artist'])
        albums=await self.p.get_catalog_detail('artist','UCartist','albums')
        self.assertEqual([e['id'] for e in albums['entries']],['fullalbum'])
        self.p._api_call.assert_any_await('get_artist_albums','UCrelease','albums-token',limit=200)
        self.assertEqual(sum(c.args[0]=='get_artist' for c in self.p._api_call.await_args_list),1)

    async def test_artist_songs_resolve_playlist_pointer(self):
        self.p._api_call.return_value={'name':'Artist','songs':{'browseId':'VLPLsongs','results':[]}}
        self.p.get_playlist_tracks=AsyncMock(return_value={'tracks':[{'videoId':'s','title':'Song','artist':'Artist','duration':90,'albumArt':'cover'}]})
        result=await self.p.get_catalog_detail('artist','UCartist','songs')
        self.p.get_playlist_tracks.assert_awaited_once_with('PLsongs',100)
        self.assertEqual(result['entries'][0]['track']['duration'],90)
        self.assertEqual(result['playlistId'],'PLsongs')

    async def test_artist_overview_can_play_without_loading_song_continuations(self):
        self.p._api_call.return_value={'name':'Artist','songs':{'browseId':'VLPLsongs','results':[]}}
        self.p.get_playlist_tracks=AsyncMock()
        result=await self.p.get_catalog_detail('artist','UCartist','all')
        self.assertEqual(result['playlistId'],'PLsongs')
        self.p.get_playlist_tracks.assert_not_awaited()

    async def test_artist_without_song_pointer_uses_artist_shuffle_collection(self):
        self.p._api_call.return_value={'name':'Artist','songs':{},'shuffleId':'RDAOartist','radioId':'RDEMothers'}
        result=await self.p.get_catalog_detail('artist','UCartist','songs')
        self.assertEqual(result['playlistId'],'RDAOartist')

    async def test_duplicate_reads_share_task_and_signout_rejects_inflight_data(self):
        started,release=asyncio.Event(),asyncio.Event()
        async def read(*args,**kwargs):
            started.set()
            await release.wait()
            return [{'videoId':'song','title':'Song'}]
        self.p._api_call.side_effect=read
        first=asyncio.create_task(self.p.get_library_items('songs'))
        await started.wait()
        second=asyncio.create_task(self.p.get_library_items('songs'))
        await asyncio.sleep(0)
        self.p.ytmusic=None
        release.set()
        results=await asyncio.gather(first,second)
        self.assertTrue(all('Account changed' in result['error'] for result in results))
        self.p._api_call.assert_awaited_once()
        self.assertEqual(self.p._catalog_cache,{})

    async def test_invalid_and_unauthenticated_requests_do_not_call_api(self):
        for result in [await self.p.get_library_items([]),await self.p.search_catalog('song',[]),
                       await self.p.get_catalog_detail('song','id'),await self.p.get_playlist_tracks([])]:
            self.assertIn('error',result)
        self.p.ytmusic=None
        self.assertIn('error',await self.p.get_library_items('albums'))
        self.p._api_call.assert_not_awaited()

    async def test_playlist_preview_calls_are_coalesced(self):
        started,release=asyncio.Event(),asyncio.Event()
        async def read(*args,**kwargs):
            started.set();await release.wait()
            return {'tracks':[{'videoId':'s','title':'Song'}]}
        self.p._api_call.side_effect=read
        first=asyncio.create_task(self.p.get_playlist_tracks('playlist',0))
        await started.wait()
        second=asyncio.create_task(self.p.get_playlist_tracks('playlist',0))
        await asyncio.sleep(0);release.set()
        a,b=await asyncio.gather(first,second)
        self.assertEqual(a,b)
        self.p._api_call.assert_awaited_once()
        self.assertEqual(self.p._playlist_reads,{})

    async def test_upcoming_artwork_follows_shuffle_without_returning_whole_queue(self):
        self.p.queue=[{'albumArt':str(i)} for i in range(5)]
        self.p.queue_position=3
        self.p.shuffle=True
        self.p.shuffle_order=[3,1,4,0,2]
        self.p.repeat='NONE'
        self.assertEqual(await self.p.get_upcoming_artwork(),{'urls':['1','4']})
        self.p.queue_position=2;self.p.repeat='ALL'
        self.assertEqual(await self.p.get_upcoming_artwork(),{'urls':['3','1']})


if __name__=='__main__':
    unittest.main()
