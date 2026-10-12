import { SAGE_PREVIEW_PANEL_WIDTH } from '../../contracts.js'

// Geometry adapted from clean Sanbao b861d04 src/styles/prototype.css:1,7,
// session.css:1 (950/700px breakpoints), composer-context.css:1–14 and context-menu.css:1–2.
// Palette, focus, shadow and motion remain owned by Sage product/theme-tokens.ts.
export const SAGE_DESKTOP_CSS: string = `
html, body, #sage-desktop-root { margin: 0; width: 100%; min-height: 100%; }
body { background: var(--sage-canvas); color: var(--sage-ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.sage-desktop, .sage-desktop * { box-sizing: border-box; }
.sage-desktop { font-size: 12px; line-height: 1.5; }
.sage-desktop [hidden] { display: none !important; }
.sage-desktop button, .sage-desktop textarea, .sage-desktop select { font: inherit; color: inherit; }
.sage-desktop button { border: 0; background: none; cursor: pointer; }
.sage-desktop button:hover:not(:disabled) { background: var(--sage-overlay); }
.sage-desktop button:disabled { cursor: not-allowed; color: var(--sage-faint); }
.sage-desktop button:focus-visible, .sage-desktop textarea:focus-visible, .sage-desktop select:focus-visible { outline: 2px solid var(--sage-focus); outline-offset: 2px; }
.sage-desktop svg { flex-shrink: 0; }
.sage-desktop p, .sage-desktop h1 { margin: 0; }
.sage-desktop.product-window { min-width: 0; display: flex; height: 100dvh; padding: 0 8px 8px 0; background: var(--sage-canvas); position: relative; }
.sage-desktop .product-sidebar { width: 227px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--sage-sidebar); transition: width var(--sage-motion); }
.sage-desktop .sidebar-top { height: 47px; flex-shrink: 0; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; }
.sage-desktop .window-dots { width: 49px; height: 11px; }
.sage-desktop .sidebar-content { padding: 0 13px 12px; display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; }
.sage-desktop .mode-tabs { display: flex; border-bottom: 1px solid var(--sage-divider); padding: 0 0 11px; margin-bottom: 9px; gap: 5px; }
.sage-desktop .mode-tabs button { flex: 1; padding: 7px 5px; border-radius: 5px; display: flex; align-items: center; gap: 6px; justify-content: center; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .mode-tabs .active { background: var(--sage-surface); color: var(--sage-ink); }
.sage-desktop .sidebar-row { min-height: 34px; width: 100%; padding: var(--sage-density-nav-item-padding); display: flex; align-items: center; gap: 9px; border-radius: 6px; text-align: left; font-size: 12px; }
.sage-desktop .sidebar-row svg { color: var(--sage-muted); }
.sage-desktop .sidebar-row.active { background: var(--sage-overlay); }
.sage-desktop .sidebar-label { margin: 16px 4px 3px 10px; font-size: 11px; display: flex; align-items: center; justify-content: space-between; color: var(--sage-muted); }
.sage-desktop .icon-button { height: 27px; width: 27px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 5px; padding: 4px; color: var(--sage-muted); }
.sage-desktop .sidebar-label .icon-button { width: 22px; height: 22px; }
.sage-desktop .workspace-mark { background: var(--sage-overlay); width: 20px; height: 20px; flex-shrink: 0; border-radius: 5px; display: grid; place-items: center; color: var(--sage-brand); }
.sage-desktop .workspace-row > span:nth-child(2) { min-width: 0; overflow-wrap: anywhere; }
.sage-desktop .workspace-row > svg { margin-left: auto; }
.sage-desktop .sidebar-bottom { margin-top: auto; padding-top: 24px; }
.sage-desktop .sidebar-divider { height: 1px; background: var(--sage-divider); margin: 12px 3px; }
.sage-desktop .account-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: var(--sage-density-nav-item-padding); border-radius: 6px; text-align: left; }
.sage-desktop .account-row strong { font-size: 12px; font-weight: 500; display: block; }
.sage-desktop .account-row small { font-size: 11px; color: var(--sage-muted); display: block; margin-top: 3px; }
.sage-desktop .account-row > svg { margin-left: auto; color: var(--sage-muted); }
.sage-desktop .avatar { height: 29px; width: 29px; flex-shrink: 0; display: grid; place-items: center; background: var(--sage-overlay); color: var(--sage-muted); font-size: 13px; border-radius: 50%; }
.sage-desktop .product-sidebar.collapsed { width: 48px; }
.sage-desktop .product-sidebar.collapsed .window-dots { display: none; }
.sage-desktop .product-sidebar.collapsed .sidebar-top { padding: 12px 10px; }
.sage-desktop .product-surface { background: var(--sage-surface); flex: 1; min-width: 0; margin-top: 9px; border-radius: 13px; border: 1px solid var(--sage-border); position: relative; overflow: auto; }
.sage-desktop .home-page { min-height: 100%; display: flex; flex-direction: column; }
.sage-desktop .home-top { height: 47px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
.sage-desktop .text-button { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; border-radius: 4px; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .welcome-content { width: min(740px, calc(100% - 80px)); margin: auto auto 27px; flex-shrink: 0; }
.sage-desktop .welcome-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; gap: 12px; }
.sage-desktop .welcome-heading h1 { font-size: 31px; line-height: 1.45; letter-spacing: .2px; font-weight: 500; color: var(--sage-ink); }
.sage-desktop .welcome-heading p { font-size: 12px; color: var(--sage-muted); margin-top: 12px; }
.sage-desktop .tree-stamp { width: 107px; flex-shrink: 0; transform: rotate(7deg); margin-right: 22px; color: var(--sage-muted); }
.sage-desktop .tree-stamp svg { display: block; width: 100%; }
.sage-desktop .tree-paper { color: var(--sage-raised); }
.sage-desktop .tree-edge { color: var(--sage-divider); }
.sage-desktop .tree-trunk { color: var(--sage-muted); }
.sage-desktop .tree-leaves { color: var(--sage-brand); }
.sage-desktop .tree-fruit { color: var(--sage-surface); }
.sage-desktop .workspace-summary { display: flex; align-items: center; gap: 9px; margin: -8px 0 17px; padding: 9px 11px; border: 1px solid var(--sage-border); border-radius: 8px; background: var(--sage-raised); color: var(--sage-muted); }
.sage-desktop .workspace-summary .workspace-mark { width: 25px; height: 25px; }
.sage-desktop .workspace-summary div { display: grid; gap: 2px; min-width: 0; }
.sage-desktop .workspace-summary strong { font-size: 12px; font-weight: 500; color: var(--sage-ink); }
.sage-desktop .workspace-summary span, .sage-desktop .workspace-summary small { font-size: 11px; }
.sage-desktop .workspace-summary small { margin-left: auto; color: var(--sage-faint); }
.sage-desktop .activity-card { border-top: 1px solid var(--sage-divider); padding-top: 15px; }
.sage-desktop .activity-heading { display: flex; justify-content: space-between; align-items: center; color: var(--sage-muted); font-size: 11px; margin-bottom: 14px; gap: 12px; }
.sage-desktop .activity-heading > span { display: flex; align-items: center; gap: 4px; }
.sage-desktop .activity-tabs { display: flex; gap: 12px; }
.sage-desktop .activity-tabs button { padding: 4px 0; font-size: 11px; border-radius: 0; color: var(--sage-muted); }
.sage-desktop .activity-tabs .active { color: var(--sage-ink); border-bottom: 1px solid var(--sage-brand); }
.sage-desktop .activity-unavailable { width: 100%; min-height: 84px; aspect-ratio: 53 / 7; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px; border: 1px dashed var(--sage-divider); border-radius: 3px; background: var(--sage-raised); color: var(--sage-muted); text-align: center; }
.sage-desktop .activity-unavailable small { font-size: 11px; }
.sage-desktop .activity-caption { display: flex; justify-content: space-between; font-size: 11px; color: var(--sage-muted); margin-top: 12px; gap: 12px; }
.sage-desktop .welcome-prompts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 26px; }
.sage-desktop .welcome-prompts button { display: flex; align-items: center; gap: 6px; font-size: 11px; border: 1px solid var(--sage-border); border-radius: 6px; padding: 8px 10px; color: var(--sage-muted); }
.sage-desktop .home-composer { width: min(740px, calc(100% - 80px)); margin: 0 auto 23px; flex-shrink: 0; }
.sage-desktop .home-composer > p { text-align: center; font-size: 11px; color: var(--sage-muted); margin-top: 11px; }
.sage-desktop .composer { border: 0; border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); padding: 12px 12px 0; }
.sage-desktop .composer-with-context { position: relative; }
.sage-desktop .composer textarea { display: block; resize: vertical; border: 0; background: var(--sage-surface); width: 100%; height: 64px; min-height: 64px; max-height: 240px; font-size: 12px; line-height: 1.7; padding: 2px; color: var(--sage-ink); }
.sage-desktop .composer textarea::placeholder { color: var(--sage-faint); }
.sage-desktop .composer-toolbar { display: flex; justify-content: space-between; align-items: center; min-height: 37px; gap: 8px; }
.sage-desktop .composer-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0; }
.sage-desktop .send-button { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 29px; height: 29px; border-radius: 50%; background: var(--sage-brand); color: var(--sage-surface); }
.sage-desktop .send-button:not(:disabled):hover { background: var(--sage-brand); outline: 1px solid var(--sage-focus); }
.sage-desktop .send-button:disabled { background: var(--sage-overlay); color: var(--sage-faint); }
.sage-desktop .composer-context { display: flex; flex-wrap: wrap; gap: 10px; border-top: 1px solid var(--sage-divider); margin: 6px -12px 0; padding: 8px 11px; background: var(--sage-canvas); border-radius: 0 0 11px 11px; }
.sage-desktop .composer-context button { font-size: 11px; color: var(--sage-muted); display: flex; align-items: center; gap: 5px; padding: 2px; border-radius: 3px; }
.sage-desktop .relative { position: relative; }
.sage-desktop .small-menu { position: absolute; bottom: 100%; left: 0; min-width: 165px; z-index: 25; background: var(--sage-surface); border: 1px solid var(--sage-border); border-radius: 7px; padding: 5px; box-shadow: var(--sage-shadow); }
.sage-desktop .small-menu button { text-align: left; width: 100%; padding: 7px; font-size: 11px; border-radius: 4px; }
.sage-desktop .small-menu.context-menu { width: 218px; max-width: calc(100vw - 60px); max-height: min(390px, 60dvh); overflow: auto; bottom: calc(100% + 8px); }
.sage-desktop .small-menu.context-menu > button { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; min-height: 31px; }
.sage-desktop .composer-context-item { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sage-desktop .context-menu small { font-size: 11px; color: var(--sage-faint); }
.sage-desktop .composer-local-note { font-size: 11px; line-height: 1.6; color: var(--sage-muted); border-top: 1px solid var(--sage-divider); padding: 7px 0; margin: 0; overflow-wrap: anywhere; }
.sage-desktop .composer-byte-note { font-size: 11px; line-height: 1.6; color: var(--sage-muted); margin: 4px 0 0; overflow-wrap: anywhere; }
.sage-desktop .desktop-read { width: min(740px, calc(100% - 80px)); margin: 0 auto 20px; padding: 8px 11px; border: 1px solid var(--sage-border); border-radius: 8px; display: flex; align-items: center; gap: 12px; background: var(--sage-raised); }
.sage-desktop #desktop-read-status { min-width: 0; display: grid; gap: 3px; color: var(--sage-muted); font-size: 11px; overflow-wrap: anywhere; }
.sage-desktop #desktop-read-status strong { color: var(--sage-ink); font-weight: 500; font-size: 12px; }
.sage-desktop [data-desktop-read="blocked"] #desktop-read-status strong { color: var(--sage-warning); }
.sage-desktop #desktop-read-retry { margin-left: auto; flex-shrink: 0; border: 1px solid var(--sage-border); }
.sage-desktop .outstanding-feature { padding: 32px 0; }
.sage-desktop .outstanding-feature h1 { font-size: 24px; font-weight: 500; }
.sage-desktop .outstanding-feature p { margin: 12px 0; color: var(--sage-muted); }
.sage-desktop .workspace-page { padding: var(--sage-density-main-padding); }
.sage-desktop .workspace-list { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: var(--sage-density-row-gap); }
.sage-desktop .workspace-entry { min-width: 0; display: grid; gap: 3px; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-border); border-radius: 8px; background: var(--sage-raised); }
.sage-desktop .workspace-entry strong { min-width: 0; font-size: 12px; font-weight: 500; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .workspace-entry span { min-width: 0; font-size: 11px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .workspace-entry small { font-size: 11px; color: var(--sage-faint); }
.sage-desktop .workspace-note { margin: 18px 0 0; color: var(--sage-muted); overflow-wrap: anywhere; }
/* Loop-Q R12 line A (QDR.P13.create.*): the create-workspace form shell — geometry only,
   palette stays owned by product/theme-tokens.ts via the existing --sage-* tokens. */
.sage-desktop .workspace-create { display: flex; flex-direction: column; gap: 10px; margin: 18px 0 0; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-border); border-radius: 8px; background: var(--sage-raised); }
.sage-desktop .workspace-create h2 { margin: 0; font-size: 12px; font-weight: 500; color: var(--sage-ink); }
.sage-desktop .workspace-create-field { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .workspace-create-field > span { flex-shrink: 0; }
.sage-desktop .workspace-create-field input { flex: 1; min-width: 140px; max-width: 240px; padding: 5px 9px; border: 1px solid var(--sage-border); border-radius: 5px; background: var(--sage-surface); color: var(--sage-ink); font-size: 12px; }
.sage-desktop .workspace-create-field [aria-pressed] { padding: 4px 10px; border: 1px solid var(--sage-border); border-radius: 999px; color: var(--sage-muted); font-size: 12px; }
.sage-desktop .workspace-create-field [aria-pressed].active { color: var(--sage-ink); border-color: var(--sage-brand); }
.sage-desktop .workspace-create-dir-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; margin: 0; font-size: 12px; }
.sage-desktop .workspace-create-dir-row strong { min-width: 0; font-weight: 500; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .workspace-create-primary { padding: 1px 8px; border: 1px solid var(--sage-border); border-radius: 999px; font-size: 11px; color: var(--sage-muted); flex-shrink: 0; }
.sage-desktop .workspace-create-dir-row small { min-width: 0; font-size: 11px; color: var(--sage-faint); overflow-wrap: anywhere; }
.sage-desktop .workspace-create > .text-button[aria-label="创建工作区"] { align-self: flex-start; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-border); }
.sage-desktop .workspace-create-note { margin: 0; font-size: 12px; color: var(--sage-muted); overflow-wrap: anywhere; }
/* T03-D search page: geometry only, palette from product/theme-tokens.ts. Every block is
   min-width:0 with overflow-wrap:anywhere so an opaque ref or snippet reflows at 320px instead of
   widening the page. */
.sage-desktop .search-page { padding: var(--sage-density-main-padding); min-width: 0; }
.sage-desktop .search-page h1 { font-size: 28px; font-weight: 500; }
.sage-desktop .search-form { display: flex; align-items: flex-end; gap: 8px; min-width: 0; margin: 18px 0 0; }
.sage-desktop .search-form textarea { flex: 1; min-width: 0; resize: vertical; border: 1px solid var(--sage-border); border-radius: var(--sage-radius); background: var(--sage-raised); color: var(--sage-ink); font-size: 12px; line-height: 1.7; padding: 9px 10px; height: 58px; min-height: 58px; max-height: 180px; overflow-wrap: anywhere; }
.sage-desktop .search-form textarea::placeholder { color: var(--sage-faint); }
.sage-desktop .search-form button { flex-shrink: 0; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-border); }
.sage-desktop .search-section { min-width: 0; margin-top: 22px; }
.sage-desktop .search-section h2 { margin: 0 0 10px; font-size: 12px; font-weight: 500; color: var(--sage-muted); }
.sage-desktop .search-hits, .sage-desktop .search-sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sage-density-row-gap); min-width: 0; }
.sage-desktop .search-hit, .sage-desktop .search-session { min-width: 0; display: grid; gap: 3px; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-border); border-radius: 8px; background: var(--sage-raised); }
.sage-desktop .search-hit strong { min-width: 0; font-size: 12px; font-weight: 500; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .search-hit small { font-size: 11px; color: var(--sage-faint); }
.sage-desktop .search-hit code, .sage-desktop .search-session code { min-width: 0; font-size: 11px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .search-session span { min-width: 0; font-size: 12px; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .search-note { margin: 14px 0 0; font-size: 12px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .search-note code { color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .settings-appearance { width: min(740px, calc(100% - 80px)); min-width: 0; margin: auto auto 27px; padding: var(--sage-density-main-padding); }
.sage-desktop .settings-appearance header { margin-bottom: 18px; }
.sage-desktop .settings-appearance h2 { margin: 0; font-size: 28px; font-weight: 500; }
.sage-desktop .settings-appearance header p, .sage-desktop .settings-appearance [role="status"] { margin-top: 10px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .settings-appearance fieldset { min-width: 0; display: grid; gap: var(--sage-density-row-gap); margin: 0; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-border); border-radius: var(--sage-radius); background: var(--sage-raised); }
.sage-desktop .settings-appearance legend { padding: 0 5px; color: var(--sage-muted); }
.sage-desktop .settings-appearance label { min-width: 0; display: grid; grid-template-columns: minmax(110px, 1fr) minmax(140px, 1fr); align-items: center; gap: var(--sage-density-row-gap); }
.sage-desktop .settings-appearance select { min-width: 0; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-border); border-radius: 5px; padding: 2px 7px; background: var(--sage-surface); }
.sage-desktop .settings-appearance button[type="submit"] { justify-self: end; min-height: var(--sage-density-control-min-height); margin-top: var(--sage-density-row-gap); padding: 4px 10px; border: 1px solid var(--sage-border); border-radius: 5px; }
/* R17-A (QDR.P06) · VF-2 geometry re-based onto the Qoder 0.4.4 live readings
 * (assets/qoder-reference/screenshots/base-20261013, pixel-sampled): white cards without
 * borders on the canvas, 12px card radius with the surface ring shadow, group labels outside
 * the card in quaternary gray, hairline row separators (divider-hairline token), 26px tinted icon tiles,
 * 24px page titles, ~460px centered content column. */
.sage-desktop .settings-shell { min-width: 0; display: grid; grid-template-columns: minmax(160px, 200px) minmax(0, 1fr); gap: 18px; width: min(1080px, calc(100% - 80px)); margin: 0 auto 27px; padding: var(--sage-density-main-padding) 0; }
.sage-desktop .settings-nav { min-width: 0; display: flex; flex-direction: column; gap: 8px; align-self: start; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); }
.sage-desktop .settings-nav ul { display: grid; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
.sage-desktop .settings-nav button[aria-current="page"] { font-weight: 600; color: var(--sage-ink); }
.sage-desktop .settings-search { display: grid; gap: 4px; color: var(--sage-muted); }
.sage-desktop .settings-search input { min-width: 0; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-divider); border-radius: 6px; padding: 2px 7px; background: var(--sage-surface); }
.sage-desktop .settings-nav-empty { margin: 0; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .settings-pane { min-width: 0; }
.sage-desktop .settings-observed { min-width: 0; display: grid; gap: 24px; }
.sage-desktop .settings-observed h2 { margin: 0; font-size: 24px; font-weight: 500; }
.sage-desktop .settings-observed header p, .sage-desktop .settings-observed-note { margin: 10px 0 0; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .settings-observed-group { min-width: 0; display: grid; gap: 8px; padding: 0; border: 0; background: none; box-shadow: none; }
.sage-desktop .settings-observed-group h3 { margin: 0; font-size: 12px; font-weight: 400; color: var(--sage-faint); }
.sage-desktop .settings-observed-group ul { display: grid; margin: 0; padding: var(--sage-density-card-padding); border: 0; border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); list-style: none; }
.sage-desktop .settings-observed-group li + li { border-top: 1px solid var(--sage-divider-hairline); }
.sage-desktop .settings-observed-row { min-width: 0; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto auto; align-items: center; gap: var(--sage-density-row-gap); padding: 10px 0; }
.sage-desktop .settings-row-tile { width: 26px; height: 26px; display: inline-grid; place-items: center; border-radius: 8px; background: var(--sage-bubble); color: var(--sage-brand); }
.sage-desktop .settings-row-text { min-width: 0; display: grid; gap: 2px; }
.sage-desktop .settings-row-text strong { font-weight: 500; }
.sage-desktop .settings-observed-row small { color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .settings-observed-state { justify-self: end; font-size: 12px; color: var(--sage-muted); white-space: nowrap; }
.sage-desktop .settings-profile-identity { display: flex; align-items: center; gap: 10px; }
.sage-desktop .settings-profile-identity span { display: grid; }
.sage-desktop .settings-profile-avatar { width: 34px; height: 34px; display: inline-grid; place-items: center; border-radius: 50%; border: 1px solid var(--sage-border); background: var(--sage-surface); color: var(--sage-muted); }
.sage-desktop .settings-inline-input { display: flex; align-items: center; gap: 6px; }
/* L1-A.2 (ADR-0320): the matter-admin action row (current matter; rename/archive/restore). */
.sage-desktop .matter-admin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 9px 0; }
.sage-desktop .matter-admin-actions input { min-width: 0; width: 180px; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-border); border-radius: 5px; padding: 2px 7px; background: var(--sage-surface); }
.sage-desktop .settings-inline-input input { min-width: 0; width: 160px; min-height: var(--sage-density-control-min-height); border: 1px solid var(--sage-border); border-radius: 5px; padding: 2px 7px; background: var(--sage-surface); }
/* R17-C: the shortcut-edit modal shell (observed; recording/saving stay disabled).
 * VF-2: the backdrop/match the Qoder live dialog (base-20261012 add-dialog screenshot):
 * heavy blur + white wash behind a floating white card — the 模糊与玻璃效果 default-on look. */
.sage-desktop .settings-modal-backdrop { position: fixed; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--sage-surface) 72%, transparent); backdrop-filter: blur(18px); }
.sage-desktop .settings-modal { min-width: 280px; max-width: 420px; display: grid; gap: 10px; padding: var(--sage-density-card-padding); border: 0; border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); }
.sage-desktop .settings-modal h3 { margin: 0; font-size: 15px; }
.sage-desktop .settings-modal p { margin: 0; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .settings-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 700px) { .sage-desktop .settings-shell { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 950px) {
  .sage-desktop .product-sidebar { width: 185px; }
  .sage-desktop .welcome-content { margin-bottom: 25px; }
}
@media (max-width: 700px) {
  .sage-desktop .product-sidebar { width: 157px; }
  .sage-desktop .sidebar-content { padding: 0 8px 12px; }
  .sage-desktop .sidebar-top { padding: 12px; }
  .sage-desktop .welcome-content, .sage-desktop .home-composer, .sage-desktop .desktop-read { width: calc(100% - 30px); }
  .sage-desktop .welcome-heading h1 { font-size: 23px; }
  .sage-desktop .tree-stamp { width: 77px; margin-right: 0; }
  .sage-desktop .welcome-prompts { gap: 6px; margin-top: 17px; }
  .sage-desktop .welcome-prompts button { padding: 6px; }
  .sage-desktop .home-top { padding: 0 8px; }
  .sage-desktop .home-composer { margin-bottom: 13px; }
  .sage-desktop .desktop-read, .sage-desktop .activity-caption { flex-wrap: wrap; }
  .sage-desktop .account-row { padding: 4px; gap: 5px; }
  .sage-desktop.product-window { padding-right: 4px; }
}
/* Reflow keeps every named destination reachable without shrinking the text into an icon-only rail. */
@media (max-width: 520px) {
  .sage-desktop.product-window { height: auto; min-height: 100dvh; flex-direction: column; padding: 0 4px 4px; }
  .sage-desktop .product-sidebar, .sage-desktop .product-sidebar.collapsed { width: 100%; }
  .sage-desktop .sidebar-top { height: 40px; }
  .sage-desktop .sidebar-content { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; overflow: visible; }
  .sage-desktop .sidebar-primary, .sage-desktop .sidebar-bottom { display: contents; }
  .sage-desktop .mode-tabs, .sage-desktop .sidebar-label, .sage-desktop .workspace-row, .sage-desktop .account-row, .sage-desktop .sidebar-divider { grid-column: 1 / -1; }
  .sage-desktop .sidebar-label { margin-top: 4px; }
  .sage-desktop .sidebar-divider { margin: 4px 3px; }
  .sage-desktop .account-row { padding: 4px 9px; }
  .sage-desktop .product-surface { overflow: visible; }
  .sage-desktop .home-page { min-height: 620px; }
  .sage-desktop .workspace-summary { flex-wrap: wrap; }
  .sage-desktop .welcome-heading { gap: 8px; }
  .sage-desktop .tree-stamp { width: 65px; }
  .sage-desktop .small-menu.context-menu { max-width: calc(100vw - 70px); }
}
@media (prefers-reduced-motion: reduce) {
  .sage-desktop, .sage-desktop *, .sage-desktop *::before, .sage-desktop *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
/* SessionPage.tsx:78–86 / session.css:1: retain transcript geometry; composer stays parent-owned. */
.sage-desktop .session-page { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.sage-desktop .session-header { min-height: 50px; border-bottom: 1px solid var(--sage-divider); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 12px 18px; gap: 10px; flex-shrink: 0; }
.sage-desktop .session-header strong { flex: 1; min-width: 0; font-size: 12px; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; }
.sage-desktop .session-state { font-size: 11px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .session-state[data-session-state="paused"] { color: var(--sage-warning); }
.sage-desktop .session-state[data-session-state="interrupted"] { color: var(--sage-danger); }
.sage-desktop .session-layout { display: flex; flex: 1; min-width: 0; min-height: 0; }
/* ADR-0300: while the side-preview WebContentsView occupies the right edge, the page keeps its
   content left of it (one shared width constant, SAGE_PREVIEW_PANEL_WIDTH). */
.sage-desktop .session-layout.preview-open { padding-right: ${SAGE_PREVIEW_PANEL_WIDTH}px; }
/* ADR-0301: the turn process strip — live file activity and the settled footer.
 * VF-2 FV-6: the label carries the observed step-badge form (numbered round chip) and the
 * strip sits on the shared white-card system (Qoder session-toolcall screenshot). */
.sage-desktop .process-live { margin: 0 0 12px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .turn-process { display: flex; flex-direction: column; gap: 8px; margin: 0 0 20px; padding: 12px 14px; border: 0; border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); font-size: 12px; color: var(--sage-muted); }
.sage-desktop .turn-process-label { display: flex; align-items: center; gap: 8px; color: var(--sage-muted); }
.sage-desktop .turn-process-label::before { content: counter(turn-step, decimal); counter-increment: turn-step; width: 20px; height: 20px; display: inline-grid; place-items: center; border-radius: 50%; background: var(--sage-overlay); color: var(--sage-ink); font-size: 11px; }
.sage-desktop .message-scroll { counter-reset: turn-step; }
/* ADR-0306: the extension-management page and the add-custom-MCP form. */
/* ADR-0313: the session-control surfaces (S03/S05/S07) and the plans roster (S06). */
.sage-desktop .approvals-section { display: flex; flex-direction: column; gap: 8px; margin: 0 30px 14px; padding: 12px 14px; border: 1px solid var(--sage-warning); border-radius: 10px; }
.sage-desktop .approval-card { display: flex; flex-direction: column; gap: 6px; }
.sage-desktop .approval-tool { font-size: 12px; color: var(--sage-ink); }
.sage-desktop .approval-reason { margin: 0; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .approval-actions { display: flex; gap: 10px; }
.sage-desktop .approval-note { margin: 0; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .model-queue-card { display: flex; flex-direction: column; gap: 6px; margin: 0 30px 14px; padding: 12px 14px; border: 1px solid var(--sage-border); border-radius: 10px; font-size: 12px; color: var(--sage-ink); }
.sage-desktop .queue-retry, .sage-desktop .queue-reason { margin: 0; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .control-list { display: flex; flex-direction: column; gap: 6px; margin: 0 30px 12px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .control-list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sage-desktop .control-list li { display: flex; align-items: center; gap: 8px; }
.sage-desktop .control-item-text { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--sage-ink); }
.sage-desktop .control-item-badge { padding: 1px 8px; border: 1px solid var(--sage-border); border-radius: 999px; font-size: 11px; }
.sage-desktop .control-item-lock { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .control-note { margin: 2px 0 0; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .tool-results-section, .sage-desktop .terminal-section { display: flex; flex-direction: column; gap: 6px; margin: 0 30px 12px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .tool-results-section ul, .sage-desktop .terminal-section ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.sage-desktop .tool-results-section li, .sage-desktop .terminal-section li { display: flex; align-items: center; gap: 8px; }
.sage-desktop .tool-result-head { color: var(--sage-ink); font-weight: 600; }
.sage-desktop .tool-result-row { display: flex; flex-direction: column; align-items: stretch; }
.sage-desktop .tool-result-text { margin: 0; padding: 6px 8px; border: 1px solid var(--sage-border); border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-size: 11px; }
.sage-desktop .tool-result-kvs { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.sage-desktop .tool-result-table { border-collapse: collapse; font-size: 11px; }
.sage-desktop .tool-result-table th, .sage-desktop .tool-result-table td { border: 1px solid var(--sage-border); padding: 2px 6px; text-align: left; }
.sage-desktop .tool-result-link { color: var(--sage-muted); }
.sage-desktop .tool-result-note { margin: 0; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .terminal-output { margin: 0; padding: 6px 8px; border: 1px solid var(--sage-border); border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-size: 11px; max-height: 260px; overflow: auto; }
.sage-desktop .artifact-kind-note { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .matter-section { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.sage-desktop .matter-row { display: flex; align-items: center; gap: 8px; }
.sage-desktop .matter-admin-card, .sage-desktop .matter-groups-card { display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--sage-border); border-radius: 6px; padding: 8px 10px; }
.sage-desktop .plans-roster { display: flex; flex-direction: column; gap: 10px; }
.sage-desktop .plan-roster { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--sage-border); border-radius: 9px; }
.sage-desktop .plan-roster-title { margin: 0; font-size: 13px; color: var(--sage-ink); }
.sage-desktop .plans-roster ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.sage-desktop .plans-roster li { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .plan-step-readiness { color: var(--sage-ink); }
/* ADR-0312: the settings leaf region (Ticket 046 machine rows). */
.sage-desktop .settings-leaves { margin-top: 18px; }
.sage-desktop .settings-leaves h3 { margin: 0 0 8px; font-size: 13px; }
.sage-desktop .settings-leaves ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.sage-desktop .settings-leaf { display: flex; flex-direction: column; gap: 3px; padding: 9px 12px; border: 1px solid var(--sage-border); border-radius: 9px; }
.sage-desktop .settings-leaf strong { font-size: 12px; }
.sage-desktop .settings-leaf-state { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .settings-leaf[data-leaf-state="unavailable"] .settings-leaf-state { color: var(--sage-warning); }
.sage-desktop .settings-leaf small { font-size: 11px; color: var(--sage-muted); }
/* ADR-0311: the 工作区文件 submenu (search + real candidates). The root menu stops scrolling
   while the flyout is open (a scroll container would clip the absolute submenu), the flyout
   clears the base bottom:100% (an over-constrained absolute box collapses to zero height),
   and the flyout itself carries the bounded scroll. */
.sage-desktop .small-menu.context-menu.files-open { overflow: visible; }
.sage-desktop .context-files { position: relative; }
.sage-desktop .context-files-menu { position: absolute; left: 100%; top: 0; bottom: auto; min-width: 220px; max-height: min(390px, 60dvh); overflow-y: auto; display: flex; flex-direction: column; background: var(--sage-surface); border: 1px solid var(--sage-border); border-radius: 7px; padding: 5px; box-shadow: var(--sage-shadow); z-index: 26; }
.sage-desktop .context-files-search { margin: 6px 8px; padding: 5px 9px; }
.sage-desktop .context-files-note { margin: 4px 10px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .extensions-page { display: flex; flex-direction: column; gap: 16px; padding: 26px 30px; overflow-y: auto; }
.sage-desktop .extensions-page h1 { margin: 0; font-size: 16px; }
.sage-desktop .connector-section { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; background: var(--sage-raised); border: 1px solid var(--sage-border); border-radius: 12px; }
.sage-desktop .connector-header { display: flex; align-items: center; justify-content: space-between; }
.sage-desktop .extensions-note { margin: 0; font-size: 12px; color: var(--sage-muted); overflow-wrap: anywhere; }
/* Loop-Q R11 line A: installed tabs + market shell. Geometry only; the data area shows the named
   not-wired reason inside a dashed placeholder, never rows or empty-list wording. */
.sage-desktop .extensions-count { margin-left: 6px; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .extensions-empty { padding: 48px 24px; border: 1px dashed var(--sage-divider-hairline); border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); font-size: 12px; color: var(--sage-muted); }
.sage-desktop .extensions-add-menu { position: static; margin-top: 4px; display: flex; flex-direction: column; gap: 4px; }
.sage-desktop .extensions-add-menu button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; }
.sage-desktop .extensions-add-menu strong { font-size: 12px; font-weight: 500; color: var(--sage-ink); }
.sage-desktop .extensions-add-menu small { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .mcp-form { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border: 1px solid var(--sage-divider); border-radius: 10px; }
.sage-desktop .mcp-form-header { display: flex; align-items: center; justify-content: space-between; }
.sage-desktop .mcp-tabs { display: flex; gap: 6px; }
.sage-desktop .mcp-tabs [role="tab"] { padding: 4px 10px; border: 1px solid var(--sage-border); border-radius: 999px; background: transparent; color: var(--sage-muted); font-size: 12px; }
.sage-desktop .mcp-tabs [role="tab"].active { color: var(--sage-ink); border-color: var(--sage-brand); }
.sage-desktop .mcp-form-body { display: flex; flex-direction: column; gap: 10px; max-height: 46dvh; overflow-y: auto; }
.sage-desktop .mcp-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--sage-ink); }
.sage-desktop .mcp-field input, .sage-desktop .mcp-field select { padding: 6px 9px; }
.sage-desktop .mcp-name-preview, .sage-desktop .mcp-hint { margin: 0; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .mcp-rows-section { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.sage-desktop .mcp-row { display: flex; gap: 6px; align-items: center; width: 100%; }
.sage-desktop .mcp-row input { flex: 1; min-width: 0; padding: 6px 9px; }
.sage-desktop .mcp-notice { margin: 0; font-size: 12px; color: var(--sage-warning); }
.sage-desktop .mcp-form-footer { display: flex; justify-content: flex-end; gap: 10px; }
.sage-desktop .mcp-discard { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px; padding: 18px; background: var(--sage-surface); border: 1px solid var(--sage-border); border-radius: 10px; }
.sage-desktop .mcp-discard p { margin: 0; font-size: 13px; color: var(--sage-ink); }
.sage-desktop .mcp-discard-actions { display: flex; gap: 10px; }
.sage-desktop .mcp-discard-confirm { color: var(--sage-danger); }
/* Loop-Q R9: the knowledge-centre and sites page shells — geometry only, palette from
   product/theme-tokens.ts; the data area shows the named not-wired reason, never rows. */
.sage-desktop .knowledge-page, .sage-desktop .sites-page { display: flex; flex-direction: column; gap: 16px; padding: 26px 30px; overflow-y: auto; }
.sage-desktop .knowledge-page h1, .sage-desktop .sites-page h1 { margin: 0; font-size: 24px; font-weight: 500; }
/* VF-2 FV-1: the market tabs are plain text with a bold active state (Qoder live market page);
 * the category chips keep the pill shape with the quaternary-gray active fill (overlay token). */
.sage-desktop .page-tabs { display: flex; gap: 18px; }
.sage-desktop .page-tabs [role="tab"] { padding: 2px 0; border: 0; background: none; color: var(--sage-muted); font-size: 13px; }
.sage-desktop .page-tabs [role="tab"].active { color: var(--sage-ink); font-weight: 600; }
.sage-desktop .page-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sage-desktop .page-tools [aria-pressed] { padding: 4px 12px; border: 0; border-radius: 7px; color: var(--sage-muted); font-size: 12px; }
.sage-desktop .page-tools [aria-pressed].active { background: var(--sage-overlay); color: var(--sage-ink); }
.sage-desktop .page-tools [aria-pressed].active { color: var(--sage-ink); border-color: var(--sage-brand); }
.sage-desktop .page-tools input { flex: 1; min-width: 140px; max-width: 240px; padding: 5px 9px; border: 1px solid var(--sage-border); border-radius: 5px; background: var(--sage-raised); color: var(--sage-ink); font-size: 12px; }
.sage-desktop .page-tools input::placeholder { color: var(--sage-faint); }
.sage-desktop .page-note { margin: 0; font-size: 12px; color: var(--sage-muted); overflow-wrap: anywhere; }
/* ADR-0308: the create-knowledge dialog, workspace scope and chips. */
.sage-desktop .knowledge-dialog { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; background: var(--sage-surface); border: 1px solid var(--sage-border); border-radius: 12px; }
.sage-desktop .knowledge-dialog-header { display: flex; align-items: center; justify-content: space-between; }
.sage-desktop .knowledge-scope { display: flex; gap: 16px; border: 0; margin: 0; padding: 0; font-size: 13px; color: var(--sage-ink); }
.sage-desktop .knowledge-scope label { display: flex; align-items: center; gap: 6px; }
.sage-desktop .knowledge-workspace-scope { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.sage-desktop .knowledge-workspace-menu { position: static; margin-top: 4px; }
.sage-desktop .knowledge-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.sage-desktop .knowledge-chip { padding: 2px 10px; border: 1px solid var(--sage-border); border-radius: 999px; font-size: 12px; color: var(--sage-ink); }
/* ADR-0305: the quick appearance submenu inside the account menu. */
.sage-desktop .appearance-menu { position: absolute; right: 12px; margin-top: 2px; z-index: 3; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
.sage-desktop .appearance-field { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--sage-ink); }
.sage-desktop .appearance-field select { max-width: 130px; }
.sage-desktop .appearance-note { margin: 0; font-size: 12px; color: var(--sage-muted); }
/* ADR-0304: the task monitor page — axes, the review card and its honest empty sections. */
.sage-desktop .monitor-page { display: flex; flex-direction: column; gap: 16px; padding: 26px 30px; overflow-y: auto; }
.sage-desktop .monitor-page h1 { margin: 0; font-size: 16px; }
.sage-desktop .monitor-axes { display: flex; flex-direction: column; gap: 6px; }
.sage-desktop .monitor-axis { margin: 0; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .monitor-empty { font-size: 12px; color: var(--sage-faint); }
.sage-desktop .review-card { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; background: var(--sage-raised); border: 1px solid var(--sage-border); border-radius: 12px; }
.sage-desktop .review-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.sage-desktop .review-updated { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .review-outputs, .sage-desktop .review-sources { display: flex; gap: 10px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .review-outputs ul { margin: 0; padding-left: 16px; }
.sage-desktop .review-more summary { cursor: pointer; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .review-more-body { display: flex; gap: 10px; padding-top: 6px; }
/* ADR-0303: the context-occupancy chip — reference only, never a gating number. */
.sage-desktop .context-usage { display: inline-block; margin-right: 10px; padding: 1px 8px; border: 1px solid var(--sage-border); border-radius: 999px; font-size: 11px; color: var(--sage-muted); }
.sage-desktop .turn-process-summary { color: var(--sage-muted); }
.sage-desktop .turn-process-files summary { cursor: pointer; color: var(--sage-muted); }
.sage-desktop .turn-item-diff summary { cursor: pointer; color: var(--sage-muted); }
.sage-desktop .turn-item-diff { margin-top: 4px; }
.sage-desktop .diff-hunk { margin-top: 6px; border: 1px solid var(--sage-border); border-radius: 8px; overflow: hidden; }
.sage-desktop .diff-hunk pre { margin: 0; padding: 6px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.55; overflow-x: auto; }
.sage-desktop .diff-old { background: color-mix(in srgb, var(--sage-danger) 12%, transparent); color: var(--sage-danger); }
.sage-desktop .diff-new { background: color-mix(in srgb, var(--sage-success) 12%, transparent); color: var(--sage-success); }
.sage-desktop .turn-process-files ul { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.sage-desktop .artifact-rail { width: 224px; flex: 0 0 224px; display: flex; flex-direction: column; gap: 10px; padding: 18px 14px; border-left: 1px solid var(--sage-divider); overflow-y: auto; }
.sage-desktop .artifact-rail-header { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .artifact-empty { margin: 0; font-size: 12px; color: var(--sage-faint); }
.sage-desktop .artifact-card { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: var(--sage-surface); border: 0; border-radius: var(--sage-radius); box-shadow: var(--sage-shadow); }
.sage-desktop .artifact-card-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.sage-desktop .artifact-name { font-size: 12px; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .artifact-kind { font-size: 10px; color: var(--sage-muted); border: 1px solid var(--sage-border); border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.sage-desktop .artifact-card-meta { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .artifact-card-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.sage-desktop .artifact-menu { font-size: 11px; color: var(--sage-muted); }
.sage-desktop .artifact-menu summary { cursor: pointer; list-style: none; }
.sage-desktop .artifact-menu summary::-webkit-details-marker { display: none; }
.sage-desktop .artifact-menu-body { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding-top: 6px; }
.sage-desktop .artifact-preview-status { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px dashed var(--sage-border); border-radius: 10px; font-size: 12px; color: var(--sage-muted); }
.sage-desktop .artifact-preview-status p { margin: 0; }
.sage-desktop .conversation { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.sage-desktop .message-scroll { overflow: auto; flex: 1; min-width: 0; min-height: 0; max-height: 60dvh; padding: 29px 30px 25px; }
.sage-desktop .message-scroll:focus-visible { outline: 2px solid var(--sage-focus); outline-offset: -2px; }
.sage-desktop .user-message { display: flex; justify-content: flex-end; margin-bottom: 28px; font-size: 12px; line-height: 1.85; }
.sage-desktop .user-message > span { min-width: 0; max-width: 91%; padding: 12px 16px; background: var(--sage-bubble); color: var(--sage-ink); border: 0; border-radius: 12px 12px 3px 12px; }
.sage-desktop .assistant-message { min-width: 0; margin-bottom: 28px; }
.sage-desktop .assistant-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; font-size: 11px; color: var(--sage-brand); }
.sage-desktop .assistant-heading strong { font-weight: 600; }
.sage-desktop .reply-body { font-size: 13px; line-height: 1.95; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .user-message > span { white-space: pre-wrap; overflow-wrap: anywhere; }
/* ADR-0299: rendered markdown blocks replace the old pre-wrap plain text. */
.sage-desktop .reply-body p { margin: 0 0 8px; }
.sage-desktop .reply-body > :last-child { margin-bottom: 0; }
.sage-desktop .reply-body h1, .sage-desktop .reply-body h2, .sage-desktop .reply-body h3,
.sage-desktop .reply-body h4 { margin: 14px 0 8px; line-height: 1.5; }
.sage-desktop .reply-body h1 { font-size: 17px; }
.sage-desktop .reply-body h2 { font-size: 15px; }
.sage-desktop .reply-body h3, .sage-desktop .reply-body h4 { font-size: 14px; }
.sage-desktop .reply-body ul, .sage-desktop .reply-body ol { margin: 0 0 8px; padding-left: 20px; }
.sage-desktop .reply-body li { margin: 2px 0; }
.sage-desktop .reply-body pre { margin: 0 0 8px; padding: 10px 12px; background: var(--sage-raised); border: 1px solid var(--sage-border); border-radius: 8px; overflow-x: auto; }
.sage-desktop .reply-body pre code { background: none; border: 0; padding: 0; }
.sage-desktop .reply-body code { padding: 0 3px; background: var(--sage-raised); border: 1px solid var(--sage-border); border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.sage-desktop .reply-body blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 2px solid var(--sage-border); color: var(--sage-muted); }
.sage-desktop .reply-body table { border-collapse: collapse; margin: 0 0 8px; }
.sage-desktop .reply-body th, .sage-desktop .reply-body td { border: 1px solid var(--sage-border); padding: 4px 8px; }
.sage-desktop .md-link { text-decoration: underline; text-underline-offset: 2px; }
.sage-desktop .session-empty { color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .account-root { position: relative; }
.sage-desktop .small-menu.account-menu { width: 100%; }
.sage-desktop .account-menu-status { margin: 2px 8px 6px; font-size: 11px; color: var(--sage-muted); overflow-wrap: anywhere; }
@media (max-width: 950px) {
  .sage-desktop .message-scroll { padding: 20px; }
}
@media (max-width: 700px) {
  .sage-desktop .session-header { padding: 12px 10px; }
  .sage-desktop .message-scroll { padding: 20px 13px; }
  .sage-desktop .settings-appearance { width: calc(100% - 24px); }
  .sage-desktop .settings-appearance label { grid-template-columns: 1fr; }
}
`
