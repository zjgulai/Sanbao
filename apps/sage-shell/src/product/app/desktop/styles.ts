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
.sage-desktop .product-sidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; background: var(--sage-sidebar); transition: width var(--sage-motion); }
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
.sage-desktop .composer { border: 1px solid var(--sage-border); border-radius: var(--sage-radius); background: var(--sage-raised); padding: 12px 12px 0; }
.sage-desktop .composer-with-context { position: relative; }
.sage-desktop .composer textarea { display: block; resize: vertical; border: 0; background: var(--sage-raised); width: 100%; height: 58px; min-height: 58px; max-height: 240px; font-size: 12px; line-height: 1.7; padding: 2px; color: var(--sage-ink); }
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
.sage-desktop .outstanding-feature h1 { font-size: 28px; font-weight: 500; }
.sage-desktop .outstanding-feature p { margin: 12px 0; color: var(--sage-muted); }
.sage-desktop .workspace-page { padding: var(--sage-density-main-padding); }
.sage-desktop .workspace-list { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: var(--sage-density-row-gap); }
.sage-desktop .workspace-entry { min-width: 0; display: grid; gap: 3px; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-border); border-radius: 8px; background: var(--sage-raised); }
.sage-desktop .workspace-entry strong { min-width: 0; font-size: 12px; font-weight: 500; color: var(--sage-ink); overflow-wrap: anywhere; }
.sage-desktop .workspace-entry span { min-width: 0; font-size: 11px; color: var(--sage-muted); overflow-wrap: anywhere; }
.sage-desktop .workspace-entry small { font-size: 11px; color: var(--sage-faint); }
.sage-desktop .workspace-note { margin: 18px 0 0; color: var(--sage-muted); overflow-wrap: anywhere; }
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
@media (max-width: 950px) {
  .sage-desktop .product-sidebar { width: 195px; }
  .sage-desktop .welcome-content { margin-bottom: 25px; }
}
@media (max-width: 700px) {
  .sage-desktop .product-sidebar { width: 165px; }
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
.sage-desktop .conversation { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.sage-desktop .message-scroll { overflow: auto; flex: 1; min-width: 0; min-height: 0; max-height: 60dvh; padding: 29px 30px 25px; }
.sage-desktop .message-scroll:focus-visible { outline: 2px solid var(--sage-focus); outline-offset: -2px; }
.sage-desktop .user-message { display: flex; justify-content: flex-end; margin-bottom: 28px; font-size: 12px; line-height: 1.85; }
.sage-desktop .user-message > span { min-width: 0; max-width: 91%; padding: 12px 16px; background: var(--sage-raised); color: var(--sage-ink); border: 1px solid var(--sage-border); border-radius: 12px 12px 3px 12px; }
.sage-desktop .assistant-message { min-width: 0; margin-bottom: 28px; }
.sage-desktop .assistant-heading { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; font-size: 11px; color: var(--sage-brand); }
.sage-desktop .assistant-heading strong { font-weight: 600; }
.sage-desktop .reply-body { font-size: 13px; line-height: 1.95; color: var(--sage-ink); }
.sage-desktop .user-message > span, .sage-desktop .reply-body { white-space: pre-wrap; overflow-wrap: anywhere; }
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
