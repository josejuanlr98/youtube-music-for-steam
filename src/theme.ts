// Scoped theme; cover motion is limited to the mounted fullscreen reader.
export const themeCss = `
.ytm-ui { --ytm-accent:#ff0000; --ytm-focus:#66c0f4; --ytm-muted:#b2becd; color:#f4f6fa; width:100%; max-width:100%; min-width:0; box-sizing:border-box; }
.ytm-ui .ytm-card,.ytm-ui.ytm-card { background:linear-gradient(135deg,#202c3c,#18212e); border:1px solid #354052; border-radius:12px; }
.ytm-ui .ytm-eyebrow { color:var(--ytm-muted); font-size:10px; letter-spacing:.12em; text-transform:uppercase; font-weight:700; }
.ytm-ui .ytm-muted { color:var(--ytm-muted); }
.ytm-ui.ytm-settings { background:#20262e; border:1px solid #39434f; border-radius:10px; max-width:820px; margin:12px auto; padding:22px !important; }
.ytm-settings button { border-radius:7px !important; box-shadow:none !important; }
.ytm-settings .ytm-settings-toggle { background:#29323d !important; color:#eef2f6 !important; border:1px solid #3d4856 !important; }
.ytm-settings .ytm-settings-toggle.gpfocus,.ytm-settings .ytm-settings-toggle:focus-visible { background:#dce5ee !important; color:#19232d !important; border-color:#dce5ee !important; }
.ytm-settings .ytm-settings-toggle::before,.ytm-settings .ytm-settings-toggle::after { display:none !important; }
.ytm-settings .ytm-settings-toggle:disabled { opacity:.45; }
.ytm-switch { display:block; flex:0 0 34px; width:34px; height:20px; border-radius:20px; background:#64707d; }
.ytm-switch[data-checked="true"] { background:#3295bd; }
.ytm-switch > span { display:block; width:14px; height:14px; margin:3px; border-radius:50%; background:white; }
.ytm-switch[data-checked="true"] > span { transform:translateX(14px); }
.ytm-settings .gpfocus,.ytm-settings :focus,.ytm-settings .gpfocus::before,.ytm-settings .gpfocus::after { border-radius:7px !important; }
.ytm-settings .gpfocus { outline:none !important; box-shadow:none !important; }
.ytm-settings .gpfocus .gpfocus { background:transparent !important; outline:none !important; box-shadow:none !important; }
.ytm-settings .gpfocus .gpfocus::before,.ytm-settings .gpfocus .gpfocus::after { box-shadow:none !important; outline:none !important; border-color:transparent !important; }
.ytm-ui .ytm-error { margin:12px 2px 16px; }
.ytm-settings input,.ytm-settings textarea { border-radius:7px !important; background:#171d24 !important; color:#f4f6fa !important; }
.ytm-settings .ytm-eyebrow { font-size:13px; letter-spacing:.04em; margin-bottom:14px !important; }
.ytm-ui .ytm-stop { background:transparent !important; border-color:transparent !important; color:#b8c1cb; }
.ytm-ui.ytm-player-view .ytm-stop:is(.gpfocus,:focus,:focus-visible,:hover,:active) { background:#46515e !important; color:#fff !important; outline:none !important; box-shadow:none !important; }
.ytm-ui.ytm-player-view .ytm-stop:is(.gpfocus,:focus,:focus-visible) * { color:#fff !important; }
@keyframes ytm-view-enter { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
.ytm-player-view,.ytm-lyrics-view { animation:ytm-view-enter 180ms ease-out; }
@media (prefers-reduced-motion:reduce) { .ytm-player-view,.ytm-lyrics-view { animation:none; } }
.ytm-ui .ytm-button { border:1px solid #3b485b; border-radius:8px !important; background:#273446; color:#f4f6fa; min-width:0 !important; max-width:100%; box-sizing:border-box; }
.ytm-ui .ytm-button:hover { background:#36465b; }
.ytm-ui .ytm-compact-slider.gpfocus,.ytm-ui .ytm-compact-slider:focus,.ytm-ui .ytm-button:focus,.ytm-ui .ytm-button.gpfocus { outline:none !important; outline-offset:0; border-color:#596572; background-color:#35445a; color:#fff; box-shadow:none !important; }
.ytm-ui .ytm-compact-slider,.ytm-ui .ytm-compact-slider.gpfocus,.ytm-ui .ytm-compact-slider:focus,.ytm-ui .ytm-compact-slider > *,.ytm-ui .ytm-compact-slider *:focus,.ytm-ui .ytm-compact-slider .gpfocus { border-radius:8px !important; }
.ytm-ui .ytm-reader:focus,.ytm-ui .ytm-reader.gpfocus,.ytm-ui .ytm-reader-focus { outline:none !important; box-shadow:none !important; }
.ytm-ui .ytm-button:disabled { opacity:.4; }
.ytm-ui .ytm-primary { background:#ff0000; color:#fff; border-color:#ff5c5c; }
.ytm-ui .ytm-primary:hover { background:#d90000; }
.ytm-ui .ytm-selected { color:#fff; background:#3a424b; border-color:#414952; }
.ytm-ui .ytm-error { padding:10px 12px; border:1px solid #9a5363; border-radius:8px; color:#ffc3cb; background:#3d2431; font-size:12px; line-height:1.45; }
.ytm-ui .ytm-list-row { border-radius:9px !important; margin:4px 6px; border:1px solid #334052; min-width:0 !important; max-width:100%; }
.ytm-ui .ytm-list-row img { border-radius:8px 0 0 8px; }
.ytm-ui button { min-width:0 !important; max-width:100%; box-sizing:border-box; }
.ytm-translation-indicator { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; line-height:1; }
.ytm-translation-indicator svg { display:block; flex-shrink:0; }
.ytm-ui .ytm-reader { scrollbar-width:auto; scrollbar-color:#ff0000 #273446; }
.ytm-ui .ytm-reader::-webkit-scrollbar { width:10px; }
.ytm-ui .ytm-reader::-webkit-scrollbar-track { background:#273446; border-radius:8px; }
.ytm-ui .ytm-reader::-webkit-scrollbar-thumb { background:#ff0000; border:2px solid #273446; border-radius:8px; }
.ytm-ui .ytm-compact-slider input[type="range"] { accent-color:var(--ytm-accent); }
.ytm-ui .ytm-hint { font-size:12px; color:#b2becd; line-height:1.5; }
.ytm-ui .ytm-key { padding:2px 6px; border:1px solid #536177; border-radius:5px; color:#f4f6fa; font-size:11px; }
.ytm-lyrics-layout { display:flex; flex-direction:row; gap:10px; flex:1; min-width:0; min-height:0; overflow:hidden; }
.ytm-player-view,.ytm-lyrics-view { position:relative; isolation:isolate; --ytm-cover-accent:78,108,132; }
.ytm-player-view { overflow:hidden; border-radius:12px; background:transparent; }
.ytm-ui.ytm-player-view .ytm-card { background:linear-gradient(135deg,rgba(var(--ytm-cover-secondary),.40),rgba(var(--ytm-cover-accent),.18)); border-color:rgba(var(--ytm-cover-accent),.42); }
.ytm-ui.ytm-player-view .ytm-button { background:linear-gradient(145deg,rgba(var(--ytm-cover-secondary),.22),rgba(var(--ytm-cover-tertiary),.12)); border-color:rgba(var(--ytm-cover-accent),.25); box-shadow:none; backdrop-filter:none; }
.ytm-ui.ytm-player-view .ytm-button.gpfocus,.ytm-ui.ytm-player-view .ytm-button:focus { background:linear-gradient(145deg,rgba(var(--ytm-cover-secondary),.45),rgba(var(--ytm-cover-accent),.24)); border-color:rgba(var(--ytm-cover-accent),.58); }
.ytm-ui.ytm-player-view .ytm-selected { color:#fff; background:linear-gradient(145deg,rgba(var(--ytm-cover-accent),.42),rgba(var(--ytm-cover-secondary),.22)); border-color:rgba(var(--ytm-cover-accent),.56); }
.ytm-ui.ytm-player-view .ytm-button:focus,.ytm-ui.ytm-player-view .ytm-button.gpfocus { outline:none !important; border-color:rgba(var(--ytm-cover-accent),.48); box-shadow:none !important; }
.ytm-ui .ytm-button::before,.ytm-ui .ytm-button::after { border-radius:inherit; }
.ytm-collection { padding:6px 2px 12px; }
.ytm-collection-heading { display:flex; align-items:center; justify-content:space-between; min-height:32px; padding:0 6px 6px; font-size:12px; font-weight:600; }
.ytm-collection-heading .ytm-muted { font-size:10px; font-weight:400; }
.ytm-ui .ytm-media-row { display:flex; align-items:center; gap:4px; min-width:0; margin:0 0 8px; padding:6px; border:1px solid #343c45; border-radius:10px; background:#252b32; }
.ytm-ui .ytm-media-current { background:#303944; border-color:#54606d; }
.ytm-ui .ytm-media-main { flex:1 1 0; width:0; display:flex; align-items:center; gap:9px; height:58px; padding:0 !important; margin:0 !important; border:0 !important; background:transparent !important; border-radius:5px !important; text-align:left; box-shadow:none !important; }
.ytm-media-art { width:38px; height:38px; flex:0 0 38px; display:grid; place-items:center; border-radius:4px; overflow:hidden; background:#34404c; color:#d3deeb; }
.ytm-media-art img { width:100%; height:100%; object-fit:cover; display:block; }
.ytm-media-copy { min-width:0; flex:1; }
.ytm-media-title { font-size:13px; font-weight:600; line-height:1.4; overflow:hidden; white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ytm-media-subtitle { font-size:11px; font-weight:400; color:#acb6c2; margin-top:3px; line-height:1.4; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ytm-media-actions { display:flex; gap:3px; align-items:center; flex-shrink:0; }
.ytm-ui .ytm-row-action { padding:0 !important; min-width:30px !important; max-width:30px !important; flex:0 0 30px !important; }
.ytm-ui .ytm-row-action svg { display:block !important; width:19px !important; height:19px !important; flex-shrink:0 !important; }
.ytm-ui .ytm-row-action { width:27px; min-width:0; height:34px; min-height:34px; padding:0; margin:0; display:flex; align-items:center; justify-content:center; border:0; border-radius:5px !important; background:#30363e; box-shadow:none; color:#d4dce5; }
.ytm-ui .ytm-collection-heading .ytm-row-action { width:30px; height:28px; min-height:28px; }
.ytm-ui .ytm-media-row[data-ytm-row-focused="true"] { background:#36424f; border-color:#8b98a6; }
.ytm-ui .ytm-media-row.ytm-library-tint { background:linear-gradient(110deg,rgba(var(--ytm-row-accent),.24),rgba(var(--ytm-row-accent),.09)),rgba(25,31,39,.78) !important; border-color:rgba(var(--ytm-row-accent),.30); }
.ytm-ui .ytm-media-row.ytm-library-tint[data-ytm-row-focused="true"] { background:linear-gradient(110deg,rgba(var(--ytm-row-accent),.38),rgba(var(--ytm-row-accent),.18)),rgba(25,31,39,.76) !important; border-color:rgba(var(--ytm-row-accent),.76); }
.ytm-ui .ytm-media-row,.ytm-ui .ytm-media-row .ytm-button { transition:none !important; animation:none !important; }
.ytm-ui .ytm-media-row::before,.ytm-ui .ytm-media-row::after { content:none !important; display:none !important; }
.ytm-ui .ytm-liked-icon { background:linear-gradient(145deg,#855df0,#f04fb1); border-radius:8px; box-shadow:0 0 14px rgba(166,102,255,.4); color:#fff; }
.ytm-ui .ytm-media-main.gpfocus,.ytm-ui .ytm-media-main:focus { background:transparent !important; color:#fff !important; outline:none !important; box-shadow:none !important; }
.ytm-ui .ytm-row-action.gpfocus,.ytm-ui .ytm-row-action:focus { background:#596a7b !important; color:#fff !important; outline:none !important; box-shadow:none !important; }
.ytm-ui .ytm-media-main.gpfocus .ytm-media-subtitle,.ytm-ui .ytm-media-main:focus .ytm-media-subtitle { color:#d4dce5; }
.ytm-ui .ytm-media-row:not([data-ytm-row-focused="true"]) .ytm-row-action:is(.gpfocus,:focus,:focus-visible) { background:#30363e !important; color:#d4dce5 !important; }
.ytm-ui .ytm-media-row:not([data-ytm-row-focused="true"]) .ytm-media-subtitle { color:#acb6c2 !important; }
.ytm-ui .ytm-media-main::before,.ytm-ui .ytm-media-main::after,.ytm-ui .ytm-row-action::before,.ytm-ui .ytm-row-action::after { display:none !important; }
.ytm-move-row { min-height:54px; }
.ytm-empty { padding:20px 12px; text-align:center; font-size:12px; line-height:1.6; color:#b2becd; }
.ytm-empty strong { color:#edf2f7; }
.ytm-collection-note { padding:8px 6px; font-size:11px; color:#bdcedd; }
.ytm-search-page { position:fixed; inset:40px 0; padding:18px 24px; background:#171b20; display:flex; }
.ytm-search-content { max-width:900px; width:100%; min-width:0; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
.ytm-search-header { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
.ytm-search-header h2 { font-size:22px; margin:5px 0 0; }
.ytm-search-header .ytm-button { width:auto; padding:8px 14px; font-size:12px; }
.ytm-search-form { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.ytm-search-input { flex:1; min-width:0; }
.ytm-search-input input { border-radius:7px !important; background:#252b32 !important; color:#f4f6fa !important; }
.ytm-search-form .ytm-button { width:130px; margin:0; padding:10px; }
.ytm-search-results { flex:1; min-height:0; overflow-y:auto; padding:2px; }
.ytm-search-results .ytm-media-main { height:58px; }
.ytm-search-results .ytm-media-title { font-size:15px; }
.ytm-search-results .ytm-media-subtitle { font-size:12px; }
.ytm-search-results .ytm-row-action { width:40px; height:40px; }
.ytm-ui .ytm-media-end-icon { display:flex; align-items:center; color:#c4cfda; opacity:.72; flex-shrink:0; }
.ytm-playlist-page { position:fixed; inset:40px 0; padding:18px 24px; background:#171b20; display:flex; }
.ytm-playlist-shell { width:100%; max-width:900px; min-width:0; min-height:0; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
.ytm-playlist-top { display:flex; justify-content:space-between; align-items:center; gap:12px; min-width:0; }
.ytm-playlist-top .ytm-button { display:flex; align-items:center; gap:8px; width:auto; padding:8px 14px; font-size:12px; }
.ytm-playlist-hero { display:flex; align-items:center; gap:18px; flex-shrink:0; min-width:0; padding:14px; border-radius:12px; border:1px solid rgba(var(--ytm-playlist-accent),.36); background:linear-gradient(110deg,rgba(var(--ytm-playlist-accent),.25),rgba(var(--ytm-playlist-accent),.04)),#20262e; }
.ytm-playlist-cover { width:84px; height:84px; flex:0 0 84px; display:grid; place-items:center; overflow:hidden; border-radius:8px; background:#354050; color:#e9f0f5; }
.ytm-playlist-cover img { display:block; width:100%; height:100%; object-fit:cover; }
.ytm-playlist-details { flex:1 1 0; min-width:0; }
.ytm-playlist-details h2 { margin:5px 0; font-size:clamp(18px,2vw,26px); line-height:1.2; overflow-wrap:anywhere; }
.ytm-playlist-details p { margin:0; font-size:12px; color:#b2becd; }
.ytm-playlist-actions { display:flex; align-items:center; gap:7px; flex:0 0 auto; margin-right:clamp(22px,5vw,64px); }
.ytm-playlist-actions .ytm-button { position:relative; display:block; box-sizing:border-box; width:42px; min-width:42px !important; max-width:42px; height:42px; min-height:42px; margin:0; padding:0 !important; border-radius:9px !important; border-color:rgba(var(--ytm-playlist-accent),.38); background:rgba(17,27,34,.40); color:#f5f8fa; }
.ytm-playlist-actions .ytm-button:hover,.ytm-playlist-actions .ytm-button:focus,.ytm-playlist-actions .ytm-button.gpfocus { background:rgba(var(--ytm-playlist-accent),.33); border-color:rgba(var(--ytm-playlist-accent),.85); }
.ytm-playlist-action-icon { position:absolute; inset:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; line-height:0; pointer-events:none; }
.ytm-playlist-actions .ytm-button svg { display:block; width:23px; height:23px; margin:0; flex:none; }
.ytm-playlist-pagination { display:flex; align-items:center; justify-content:center; gap:8px; flex-shrink:0; font-size:12px; }
.ytm-playlist-pagination .ytm-button { flex:1 1 0; min-width:92px !important; margin:0; padding:5px 10px; font-size:12px; }
.ytm-button[aria-disabled="true"] { opacity:.4; }
.ytm-playlist-tracks { flex:1 1 0; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:2px 4px 8px; }
.ytm-playlist-tracks .ytm-media-main { height:58px; }
.ytm-playlist-tracks .ytm-row-action { width:40px; height:40px; }
.ytm-translation-reveal { display:inline-block; animation:ytm-translation-reveal 680ms cubic-bezier(.16,1,.3,1) both; }
@keyframes ytm-translation-reveal { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
@media (prefers-reduced-motion: reduce) { .ytm-translation-reveal { animation:none; } }
@media (max-width:620px) { .ytm-playlist-page { padding:12px; } .ytm-playlist-actions { gap:5px; margin-right:12px; } .ytm-playlist-actions .ytm-button { width:36px; min-width:36px !important; max-width:36px; height:36px; min-height:36px; } .ytm-playlist-actions .ytm-button svg { width:20px; height:20px; } .ytm-playlist-cover { width:64px; height:64px; flex-basis:64px; } .ytm-playlist-hero { padding:10px; gap:10px; } .ytm-playlist-tracks .ytm-track-duration { padding:0 6px; } }
.ytm-track-duration { color:#acb6c2; font-size:11px; padding:0 12px; font-variant-numeric:tabular-nums; }
.ytm-ui.ytm-player-view .ytm-rating-button { border-color:rgba(var(--ytm-cover-accent),.25); color:#fff; }
.ytm-ui.ytm-player-view .ytm-rating-button.ytm-selected { border-color:rgba(var(--ytm-cover-accent),.56); }
.ytm-ui.ytm-player-view .ytm-rating-button:focus,.ytm-ui.ytm-player-view .ytm-rating-button.gpfocus { outline:none; border-color:rgba(var(--ytm-cover-accent),.58); box-shadow:none; }
.ytm-atmosphere { position:absolute; inset:0; overflow:hidden; z-index:0; pointer-events:none; background:#101c28; }
.ytm-player-view > :not(.ytm-atmosphere) { position:relative; z-index:1; }
.ytm-cover-logo { color:rgb(var(--ytm-cover-accent)); flex-shrink:0; transition:color 800ms ease; }
@media (min-width:1500px) and (min-height:900px) {
  .ytm-cover-logo { width:88px !important; height:88px !important; min-height:88px !important; }
}
.ytm-ui.ytm-player-view > .ytm-card { background:linear-gradient(135deg,rgba(var(--ytm-cover-secondary),.40),rgba(var(--ytm-cover-accent),.18)); border:1px solid rgba(var(--ytm-cover-accent),.42); box-shadow:none; backdrop-filter:none; }
.ytm-ui.ytm-player-view > .ytm-card { border-top-color:rgba(var(--ytm-cover-accent),.12); }
.ytm-ui.ytm-lyrics-view:not(.ytm-immersive) { border:1px solid rgba(var(--ytm-cover-accent),.28); border-radius:12px; background:linear-gradient(135deg,rgba(var(--ytm-cover-accent),.15),rgba(var(--ytm-cover-accent),.04)),rgba(10,14,20,.24) !important; }
.ytm-ui.ytm-lyrics-view:not(.ytm-immersive) .ytm-reader { border:0 !important; border-radius:10px; background:linear-gradient(135deg,rgba(var(--ytm-cover-accent),.14),rgba(var(--ytm-cover-accent),.04)),rgba(15,20,27,.42); box-shadow:none !important; }
.ytm-ui .ytm-lyrics-source { margin-top:14px; font-size:10px; line-height:1.5; color:rgba(255,255,255,.42); overflow-wrap:anywhere; }
.ytm-ui .ytm-lyric-line { min-height:1em; transition:none; }
.ytm-ui.ytm-immersive .ytm-lyrics-layout { max-width:min(860px,90%) !important; }
.ytm-ui .ytm-lyric-active { color:#fff; text-shadow:none; }
.ytm-ui.ytm-immersive .ytm-reader { background:transparent; border:0; border-radius:0; outline:none; box-shadow:none; scrollbar-width:none; mask-image:linear-gradient(transparent,#000 12%,#000 86%,transparent); -webkit-mask-image:linear-gradient(transparent,#000 12%,#000 86%,transparent); }
.ytm-ui.ytm-immersive .ytm-reader::-webkit-scrollbar { display:none; }
.ytm-ui.ytm-immersive .ytm-button:focus,.ytm-ui.ytm-immersive .ytm-button.gpfocus { outline:none !important; border-color:rgba(255,255,255,.28); background:rgba(255,255,255,.06); box-shadow:none !important; }
.ytm-ui.ytm-lyrics-view .ytm-reader { scrollbar-color:rgba(var(--ytm-cover-accent),.55) transparent; }
.ytm-ui.ytm-lyrics-view .ytm-reader::-webkit-scrollbar-thumb { background:rgba(var(--ytm-cover-accent),.55); border-color:transparent; }
@media (prefers-reduced-motion:reduce) { .ytm-ui .ytm-lyric-line,.ytm-ui .ytm-lyric-pair { transition:none !important; } }
/* The Quick Access panel becomes narrower on some external display layouts. */
.ytm-catalog-select { margin:0 0 12px; }
.ytm-catalog-select > .ytm-button { display:flex !important; align-items:center !important; justify-content:space-between !important; width:100% !important; min-width:0 !important; padding:8px 12px !important; height:36px !important; }
.ytm-catalog-options { display:flex; flex-direction:column; gap:4px; padding:5px 0; }
.ytm-catalog-options .ytm-button { width:100% !important; min-width:0 !important; padding:8px 12px !important; }
.ytm-ui .ytm-catalog-select .ytm-button { position:relative; border-radius:7px !important; font-weight:500; line-height:1.2; transition:background-color 120ms ease,border-color 120ms ease; }
.ytm-ui .ytm-catalog-select .ytm-button[aria-pressed="true"] { color:#f4f6fa !important; border-color:rgba(var(--ytm-cover-accent,125,145,165),.65) !important; }
.ytm-ui .ytm-catalog-select .ytm-button:is(:hover,:focus,:focus-visible,.gpfocus),.ytm-ui .ytm-catalog-select .ytm-button[aria-pressed="true"]:is(:hover,:focus,:focus-visible,.gpfocus) { color:#19232d !important; background:#dce5ee !important; border:1px solid #dce5ee !important; box-shadow:none !important; outline:none !important; transform:none !important; }
.ytm-ui .ytm-catalog-select .ytm-button::before,.ytm-ui .ytm-catalog-select .ytm-button::after { content:none !important; display:none !important; border-radius:inherit !important; box-shadow:none !important; outline:none !important; }
.ytm-catalog-filters { display:flex; flex-shrink:0; gap:8px; margin:0 0 12px; }
.ytm-catalog-filters .ytm-button { min-width:0 !important; flex:1 1 0; padding:8px 12px !important; border-radius:20px !important; }
.ytm-catalog-filters .ytm-button[aria-pressed="true"],.ytm-catalog-options .ytm-button[aria-pressed="true"] { background:rgba(var(--ytm-cover-accent,125,145,165),.3) !important; color:#fff; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-catalog-filters .ytm-button { position:relative; transition:background-color 120ms ease,border-color 120ms ease; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-catalog-filters .ytm-button:is(:hover,:focus,:focus-visible,.gpfocus) { border-color:#a4b7c7 !important; background:#394959 !important; box-shadow:none !important; outline:none !important; transform:none !important; color:#f4f6fa !important; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-catalog-filters .ytm-button[aria-pressed="true"]:is(:hover,:focus,:focus-visible,.gpfocus) { background:#485969 !important; border-color:#d0dbe4 !important; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-catalog-filters .ytm-button::before,.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-catalog-filters .ytm-button::after { content:none !important; border-radius:inherit !important; box-shadow:none !important; outline:none !important; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-button:is(:hover,:focus,:focus-visible,.gpfocus) { transform:none !important; }
.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-button::before,.ytm-ui:is(.ytm-search-page,.ytm-playlist-page) .ytm-button::after { content:none !important; box-shadow:none !important; border-radius:inherit !important; }
.ytm-queue-pagination { margin:8px 0; }
.ytm-queue-pagination .ytm-button { min-width:0 !important; }
.ytm-catalog-library { display:flex; flex-direction:column; gap:12px; min-width:0; padding-bottom:4px; }
.ytm-catalog-library > .ytm-media-row,.ytm-catalog-results > .ytm-media-row:last-child { margin-bottom:0; }
.ytm-catalog-library .ytm-playlist-pagination { margin:0; }
.ytm-catalog-library .ytm-playlist-pagination .ytm-button { min-width:0 !important; }
.ytm-catalog-library .ytm-playlist-pagination > span { flex:0 0 auto; white-space:nowrap; font-variant-numeric:tabular-nums; color:#bdcedd; }
/* Library tools share one row in every category; lists retain breathing room. */
.ytm-library-toolbar { display:flex; align-items:flex-start; gap:6px; margin:0 0 8px; min-width:0; }
.ytm-library-toolbar-filter { flex:1 1 0; min-width:0; }
.ytm-library-toolbar-filter .ytm-catalog-select { margin:0; min-width:0; }
.ytm-library-toolbar-filter .ytm-catalog-select > .ytm-button { gap:6px; padding:8px !important; }
.ytm-library-toolbar-filter .ytm-catalog-select > .ytm-button > span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ytm-library-toolbar-actions { display:flex; flex:0 0 auto; gap:4px; }
.ytm-ui .ytm-library-toolbar-actions .ytm-row-action { height:36px; min-height:36px; }
.ytm-catalog-library .ytm-library-toolbar { margin-bottom:0; }
.ytm-catalog-library .ytm-collection-heading { padding-bottom:0; min-height:20px; }
.ytm-artist-cover { border-radius:8px !important; }
.ytm-artist-cover img { object-fit:contain; }
@media (max-width:360px) {
  .ytm-player-view { padding-left:0 !important; padding-right:0 !important; }
  .ytm-player-view .ytm-card { padding-left:7px !important; padding-right:7px !important; }
  .ytm-player-view .ytm-button { padding-left:4px !important; padding-right:4px !important; }
  .ytm-lyrics-layout { gap:7px; }
}
`;
