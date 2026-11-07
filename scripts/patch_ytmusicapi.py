"""Reapply the packaged watch-tab fix after installing pinned dependencies."""
import ast
import argparse
from pathlib import Path


def _replace_function(target: Path, names: tuple[str, ...], replacement_fn):
    if not target.is_file():
        return
    source = target.read_text(encoding='utf-8')
    function = next((node for node in ast.parse(source).body
                     if isinstance(node, ast.FunctionDef) and node.name in names), None)
    if function is None:
        return
    replacement = replacement_fn(function.name)
    lines = source.splitlines(keepends=True)
    updated = ''.join(lines[:function.lineno - 1]) + replacement + ''.join(lines[function.end_lineno:])
    ast.parse(updated)
    if updated != source:
        target.write_text(updated, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--modules', type=Path, default=Path(__file__).resolve().parents[1] / 'py_modules')
    modules = parser.parse_args().modules
    watch_target = modules / 'ytmusicapi/parsers/watch.py'

    def watch_replacement(name: str) -> str:
        if name == 'get_tab_browse_ids':
            return '''def get_tab_browse_ids(watchNextRenderer: JsonDict) -> dict[str, str]:
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
        return '''def get_tab_browse_id(watchNextRenderer: JsonDict, tab_id: int) -> str | None:
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

    _replace_function(watch_target, ('get_tab_browse_id', 'get_tab_browse_ids'), watch_replacement)

    library_target = modules / 'ytmusicapi/parsers/library.py'
    _replace_function(library_target, ('get_library_contents',), lambda _: '''def get_library_contents(response: JsonDict, renderer: list[str]) -> JsonDict | None:
    section = nav(response, SINGLE_COLUMN_TAB + SECTION_LIST, True)
    if section is None:
        tabs = nav(response, [*SINGLE_COLUMN, "tabs"], True) or []
        if not tabs:
            return None
        num_tabs = len(tabs)
        LIBRARY_TAB = TAB_1_CONTENT if num_tabs < 3 else TAB_2_CONTENT
        contents = nav(response, SINGLE_COLUMN + LIBRARY_TAB + SECTION_LIST_ITEM + renderer, True)
    else:
        results = find_object_by_key(section, "itemSectionRenderer")
        if results is None:
            contents = nav(response, SINGLE_COLUMN_TAB + SECTION_LIST_ITEM + renderer, True)
        else:
            contents = nav(results, ITEM_SECTION + renderer, True)
    return contents
''')

    helpers_target = modules / 'ytmusicapi/helpers.py'
    _replace_function(helpers_target, ('get_visitor_id',), lambda _: '''def get_visitor_id(request_func: Callable[[str], Response]) -> dict[str, str]:
    visitor_id = ""
    try:
        response = request_func(YTM_DOMAIN)
        text = getattr(response, "text", "") or ""
        for raw in re.findall(r"ytcfg\\.set\\s*\\(\\s*({.+?})\\s*\\)\\s*;", text):
            try:
                candidate = json.loads(raw).get("VISITOR_DATA")
                if isinstance(candidate, str) and candidate:
                    visitor_id = candidate
                    break
            except Exception:
                continue
        if not visitor_id:
            match = re.search(r\'"VISITOR_DATA"\\s*:\\s*"([^"]+)"\', text)
            if match:
                visitor_id = match.group(1)
    except Exception:
        visitor_id = ""
    return {"X-Goog-Visitor-Id": visitor_id or ""}
''')

    _replace_function(helpers_target, ('sapisid_from_cookie',), lambda _: '''def sapisid_from_cookie(raw_cookie: str) -> str:
    cleaned = (raw_cookie or "").replace(\'"\', "")
    match = re.search(r"(?:^|;\\s*)(?:__Secure-3PAPISID|SAPISID)=([^;\\s]+)", cleaned)
    if match:
        return match.group(1)
    cookie = SimpleCookie()
    cookie.load(cleaned)
    return cookie["__Secure-3PAPISID"].value
''')

    print('ytmusicapi watch-tab, library and auth-helper compatibility patches applied')


if __name__ == '__main__':
    main()
