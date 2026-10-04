"""Normalize public catalogue metadata without exposing account headers."""
KINDS = {'songs': 'song', 'albums': 'album', 'artists': 'artist', 'playlists': 'playlist'}


def artwork(item):
    thumbs = item.get('thumbnails') or []
    return next((thumb.get('url', '') for thumb in reversed(thumbs) if isinstance(thumb, dict)), '')


def entry(item, kind=None, defaults=None):
    if not isinstance(item, dict):
        return None
    defaults = defaults or {}
    kind = kind or item.get('resultType')
    if kind not in KINDS.values():
        return None
    identifier = item.get('videoId') if kind == 'song' else (
        item.get('playlistId') or item.get('browseId') if kind == 'playlist' else item.get('browseId') or item.get('channelId'))
    if not identifier or item.get('isAvailable') is False:
        return None
    if kind == 'playlist' and identifier.startswith('VL'):
        identifier = identifier[2:]
    artists = item.get('artists') or defaults.get('artists') or []
    artist = ', '.join(str(a.get('name') or '') for a in artists if isinstance(a, dict))
    artist = artist or str(item.get('artist') or defaults.get('artist') or '')
    title = item.get('title') or item.get('artist') or item.get('name') or 'Unknown'
    image = artwork(item) or defaults.get('image') or ''
    subtitle = artist or str(item.get('year') or '')
    if kind == 'artist':
        subtitle = str(item.get('subscribers') or '')
    elif kind == 'album':
        subtitle = ' · '.join(part for part in (artist, str(item.get('year') or '')) if part)
    elif kind == 'playlist':
        author = item.get('author') or []
        if isinstance(author, list):
            subtitle = ', '.join(str(a.get('name') or '') for a in author if isinstance(a, dict))
        elif isinstance(author, str):
            subtitle = author
    try:
        count = int(item.get('count'))
    except (TypeError, ValueError):
        count = None
    result = {'kind': kind, 'id': identifier, 'title': title,
              'subtitle': subtitle, 'image': image, 'count': count}
    if kind == 'album' and (item.get('audioPlaylistId') or item.get('playlistId')):
        result['playlistId'] = item.get('audioPlaylistId') or item['playlistId']
    if kind == 'song':
        duration = item.get('duration_seconds') or 0
        if not duration:
            try:
                for part in str(item.get('duration') or '0').split(':'):
                    duration = duration * 60 + int(part)
            except (TypeError, ValueError):
                duration = 0
        album = item.get('album') or defaults.get('album') or {}
        result['track'] = {'videoId': identifier, 'title': title, 'artist': artist,
                           'album': album.get('name', '') if isinstance(album, dict) else str(album),
                           'albumArt': image, 'duration': duration}
    return result


def entries(items, kind=None, defaults=None):
    return [normalized for item in items or [] if (normalized := entry(item, kind, defaults))]
