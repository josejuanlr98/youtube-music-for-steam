"""Reapply the packaged watch-tab fix after installing pinned dependencies."""
import ast
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--modules', type=Path, default=Path(__file__).resolve().parents[1] / 'py_modules')
    target = parser.parse_args().modules / 'ytmusicapi/parsers/watch.py'
    source = target.read_text(encoding='utf-8')
    function = next(node for node in ast.parse(source).body
                    if isinstance(node, ast.FunctionDef) and node.name in ('get_tab_browse_id', 'get_tab_browse_ids'))
    replacement = '''def get_tab_browse_id(watchNextRenderer: JsonDict, tab_id: int) -> str | None:
    # YouTube can omit optional lyrics/related tabs or their endpoints.
    tabs = watchNextRenderer.get("tabs") or []
    if tab_id < 0 or tab_id >= len(tabs):
        return None
    tab = tabs[tab_id].get("tabRenderer") or {}
    if tab.get("unselectable"):
        return None
    endpoint = tab.get("endpoint") or tab.get("navigationEndpoint") or {}
    browse_id = (endpoint.get("browseEndpoint") or {}).get("browseId")
    return browse_id if isinstance(browse_id, str) else None
'''
    if function.name == 'get_tab_browse_ids':
        replacement = '''def get_tab_browse_ids(watchNextRenderer: JsonDict) -> dict[str, str]:
    # Optional tabs and incomplete endpoints are normal YouTube responses.
    browse_ids = {}
    for tab in watchNextRenderer.get("tabs") or []:
        renderer = tab.get("tabRenderer") or {}
        if renderer.get("unselectable"):
            continue
        endpoint = renderer.get("endpoint") or renderer.get("navigationEndpoint") or {}
        browse = endpoint.get("browseEndpoint") or {}
        browse_id = browse.get("browseId")
        if not isinstance(browse_id, str):
            continue
        config = browse.get("browseEndpointContextSupportedConfigs") or {}
        page_type = (config.get("browseEndpointContextMusicConfig") or {}).get("pageType")
        if not page_type and browse_id.startswith("MPLYt_"):
            page_type = "MUSIC_PAGE_TYPE_TRACK_LYRICS"
        if page_type:
            browse_ids[page_type] = browse_id
    return browse_ids
'''
    lines = source.splitlines(keepends=True)
    updated = ''.join(lines[:function.lineno - 1]) + replacement + ''.join(lines[function.end_lineno:])
    ast.parse(updated)
    if updated != source:
        target.write_text(updated, encoding='utf-8')
    print('ytmusicapi watch-tab compatibility patch applied')


if __name__ == '__main__':
    main()
