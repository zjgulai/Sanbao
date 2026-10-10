/** Static, self-owned Sage renderer. It has no upstream UI, slot, or runtime dependency. */

import { SAGE_APP_BUNDLE } from './app-bundle.js'
import { renderSageWorkspace } from './component-renderer.js'
import { SAGE_ACTIONS_PATH, SAGE_REQUEST_TIMEOUT_MS, SAGE_STATE_PATH } from './contracts.js'
import { renderSageDensityTokenCss, renderSageThemeTokenCss } from './theme-tokens.js'

/** Render the complete first Sage product surface without a client-side framework dependency. */
export function renderSageDocument(): string {
  const statePath = JSON.stringify(SAGE_STATE_PATH)
  const actionsPath = JSON.stringify(SAGE_ACTIONS_PATH)
  // ADR-0261 P1: the esbuild bundle (or the placeholder module) rides the same strict-CSP
  // document as one extra inline script; the empty placeholder must not add an empty tag.
  const appScript = SAGE_APP_BUNDLE === '' ? '' : `<script>${SAGE_APP_BUNDLE}</script>`
  return `<!doctype html>
<html lang="zh-CN" data-sage-theme-requested="unknown" data-sage-theme-effective="unknown" data-sage-density="unknown">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Sage</title>
  <style>
    ${renderSageThemeTokenCss()}
    ${renderSageDensityTokenCss()}
    :root {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--sage-canvas);
      color: var(--sage-ink);
    }
    * { box-sizing: border-box; }
    html { min-width: 320px; background: var(--sage-canvas); }
    body { min-height: 100vh; margin: 0; background: var(--sage-canvas); }
    button { font: inherit; }
    :where(button, select, input, textarea):focus-visible { outline: 2px solid var(--sage-focus); outline-offset: 3px; }
    [hidden] { display: none !important; }
    .sage-app { min-height: 100vh; display: grid; grid-template-columns: 15rem minmax(0, 1fr); }
    .sage-sidebar { display: flex; flex-direction: column; min-height: 100vh; padding: 1.5rem 1rem; border-right: 1px solid var(--sage-divider); background: var(--sage-sidebar); }
    .sage-brand { display: flex; align-items: center; gap: .7rem; padding: .25rem .75rem 2.5rem; color: var(--sage-ink); font-size: 1.15rem; font-weight: 680; letter-spacing: .06em; }
    .sage-mark { width: 1.35rem; height: 1.35rem; display: grid; place-items: center; border: 1px solid var(--sage-brand); border-radius: 50%; transform: rotate(-25deg); }
    .sage-mark span { width: .42rem; height: .42rem; border-radius: 50%; background: var(--sage-brand); }
    .sage-nav-label, .sage-card-label, .sage-kicker, .sage-eyebrow { color: var(--sage-faint); font-size: .68rem; letter-spacing: .13em; text-transform: uppercase; }
    .sage-nav-label { margin: 0 .75rem .55rem; }
    .sage-nav { display: grid; gap: .25rem; }
    .sage-nav-item { display: flex; align-items: center; gap: .7rem; width: 100%; padding: var(--sage-density-nav-item-padding); border: 1px solid transparent; border-radius: var(--sage-radius); background: transparent; color: var(--sage-muted); cursor: pointer; text-align: left; }
    .sage-nav-item:hover { background: var(--sage-overlay); color: var(--sage-ink); }
    .sage-nav-count { margin-left: auto; min-width: 1.1rem; padding: .05rem .35rem; border: 1px solid var(--sage-border); border-radius: 99rem; color: var(--sage-brand); font-size: .64rem; text-align: center; }
    .sage-nav-item.is-active { border-color: var(--sage-divider); background: var(--sage-overlay); color: var(--sage-brand); }
    .sage-nav-icon { width: 1.2rem; color: var(--sage-brand); text-align: center; }
    .sage-current-context { display: grid; gap: .45rem; margin: 1.25rem .25rem 0; padding: .9rem .75rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-surface); }
    .sage-current-context strong { overflow: hidden; color: var(--sage-ink); font-size: .82rem; font-weight: 580; line-height: 1.45; text-overflow: ellipsis; }
    .sage-current-context > span:not(.sage-card-label) { overflow: hidden; color: var(--sage-faint); font-size: .66rem; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
    .sage-sidebar-foot { display: flex; align-items: center; gap: .55rem; margin-top: auto; padding: 1rem .75rem .25rem; border-top: 1px solid var(--sage-divider); color: var(--sage-muted); font-size: .75rem; line-height: 1.35; }
    .sage-status-dot { width: .55rem; height: .55rem; flex: 0 0 auto; border-radius: 50%; background: var(--sage-warning); }
    .sage-status-dot.is-ready { background: var(--sage-success); }
    .sage-status-dot.is-unavailable { background: var(--sage-danger); }
    .sage-main { min-width: 0; padding: var(--sage-density-main-padding); }
    .sage-topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; min-height: 4rem; }
    .sage-kicker { margin: .25rem 0 .35rem; color: var(--sage-brand); }
    .sage-breadcrumb { margin: 0; color: var(--sage-muted); font-size: .82rem; }
    .sage-topbar-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
    .sage-fixture-pill, .sage-runtime-pill { display: inline-flex; align-items: center; min-height: var(--sage-density-control-min-height); padding: .25rem .65rem; border: 1px solid var(--sage-divider); border-radius: 99rem; color: var(--sage-muted); font-size: .7rem; }
    .sage-runtime-pill { border-color: var(--sage-border); color: var(--sage-brand); }
    .sage-user-menu { position: relative; }
    .sage-user-menu-trigger { display: inline-flex; align-items: center; gap: .4rem; min-height: var(--sage-density-control-min-height); padding: .25rem .65rem; border: 1px solid var(--sage-border); border-radius: 99rem; background: none; color: var(--sage-brand); font: inherit; font-size: .7rem; cursor: pointer; }
    .sage-user-menu-panel { position: absolute; top: calc(100% + .4rem); right: 0; z-index: 3; display: grid; gap: .4rem; min-width: 13rem; padding: .7rem; border: 1px solid var(--sage-border); border-radius: var(--sage-radius); background: var(--sage-surface); box-shadow: var(--sage-shadow); }
    .sage-user-menu-note { margin: 0; color: var(--sage-muted); font-size: .68rem; line-height: 1.5; }
    .sage-capability-roster { margin-top: 1rem; }
    .sage-roster-list { display: grid; gap: .45rem; margin: 1rem 0 .6rem; padding: 0; list-style: none; }
    .sage-roster-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sage-density-row-gap); padding: .5rem .65rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); }
    .sage-roster-row > strong { margin-right: .25rem; font-size: .82rem; }
    .sage-roster-tag { padding: .2rem .5rem; border: 1px solid var(--sage-divider); border-radius: 99rem; color: var(--sage-muted); font-size: .68rem; white-space: nowrap; }
    .sage-roster-tag.is-ok { border-color: var(--sage-success); color: var(--sage-success); }
    .sage-roster-tag.is-blocked { border-color: var(--sage-border); color: var(--sage-warning); }
    .sage-row-input { flex: 1 1 10rem; min-width: 0; padding: .3rem .5rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: transparent; color: var(--sage-ink); font-size: .74rem; }
    .sage-row-input:focus-visible { outline: 2px solid var(--sage-focus); outline-offset: 1px; }
    .sage-row-button { padding: .3rem .6rem; border: 1px solid var(--sage-border); border-radius: var(--sage-radius); background: transparent; color: var(--sage-brand); cursor: pointer; font-size: .72rem; }
    .sage-row-button:disabled { cursor: not-allowed; opacity: .45; }
    .sage-file-preview { margin: .6rem 0 0; padding: .7rem .8rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); color: var(--sage-ink); font-size: .74rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow: auto; max-height: 16rem; }
    .sage-draft-section, .sage-link-section, .sage-session-section { margin-top: 1.5rem; }
    .sage-settings-leaf .sage-state-tag { margin: .2rem 0 .5rem; }
    .sage-preferences-card .sage-state-row { gap: .6rem; }
    .sage-preferences-card select, .sage-user-menu-row select { padding: .25rem .5rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: transparent; color: var(--sage-ink); font-size: .74rem; }
    .sage-appearance-deferred { margin-top: .8rem; padding-top: .6rem; border-top: 1px dashed var(--sage-divider); display: grid; gap: .35rem; }
    .sage-appearance-deferred .sage-roster-row { display: flex; align-items: baseline; gap: .55rem; font-size: .74rem; }
    .sage-user-menu-row { display: flex; align-items: center; justify-content: space-between; gap: .6rem; font-size: .74rem; color: var(--sage-muted); }
    .sage-link-card .sage-state-row { gap: .6rem; }
    .sage-link-card select { max-width: 34rem; padding: .3rem .5rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: transparent; color: var(--sage-ink); font-size: .74rem; }
    .sage-draft-input { width: 100%; box-sizing: border-box; margin: .4rem 0 .2rem; padding: .5rem .6rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: transparent; color: var(--sage-ink); font-size: .76rem; font-family: inherit; resize: vertical; }
    .sage-mode-bar { display: flex; gap: .4rem; margin: .3rem 0 .2rem; }
    .sage-mode-bar [data-plan-mode-state="active"] { border-color: var(--sage-ink); font-weight: 600; }
    .sage-plan-preview { max-height: 14rem; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: .3rem 0; padding: .5rem .6rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); font-size: .72rem; }
    .sage-draft-card .sage-state-row { gap: .6rem; }
    .sage-draft-card .sage-state-row .sage-row-input { flex: 1 1 14rem; }
    .sage-history-toggle { margin-right: .5rem; }
    .sage-draft-confirmation { margin: .6rem 0; padding: .55rem .7rem .65rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); }
    .sage-draft-confirmation-title { margin: 0 0 .35rem; font-size: .78rem; font-weight: 600; }
    .sage-draft-confirmation-facts { margin: 0 0 .4rem; padding-left: 1.1rem; font-size: .74rem; line-height: 1.55; }
    .sage-draft-confirmation-facts li { margin: .1rem 0; }
    .sage-draft-confirmation #draft-confirm-execute { margin-right: .4rem; }
    .sage-action-items-card .sage-state-row { gap: .6rem; }
    .sage-action-correction-block, .sage-action-project-block, .sage-run-log-block { margin-top: .8rem; padding-top: .6rem; border-top: 1px dashed var(--sage-divider); display: grid; gap: .4rem; }
    .sage-file-references select { max-width: 32rem; padding: .3rem .5rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: transparent; color: var(--sage-ink); font-size: .74rem; }
    #profile-status-note { margin: .55rem 0 .9rem; color: var(--sage-muted); font-size: .74rem; line-height: 1.6; }
    .sage-panel { display: none; padding-top: 1.6rem; }
    .sage-panel.is-visible { display: block; animation: sage-panel-in var(--sage-motion) both; }
    .sage-eyebrow { margin: 0 0 .4rem; color: var(--sage-brand); }
    .sage-section-heading h1 { margin: 0; color: var(--sage-ink); font-size: 1.35rem; font-weight: 620; letter-spacing: -.01em; line-height: 1.3; }
    .sage-primary-button, .sage-secondary-button { border-radius: var(--sage-radius); cursor: pointer; font-weight: 650; }
    .sage-primary-button { padding: .75rem 1rem; border: 1px solid var(--sage-brand); background: var(--sage-brand); color: var(--sage-canvas); }
    .sage-secondary-button { padding: .58rem .85rem; border: 1px solid var(--sage-border); background: transparent; color: var(--sage-brand); }
    .sage-primary-button:hover, .sage-secondary-button:hover { filter: brightness(1.08); }
    .sage-muted-copy, .sage-card-note { color: var(--sage-faint); font-size: .78rem; }
    .sage-grid { display: grid; gap: 1rem; }
    .sage-card { min-width: 0; padding: var(--sage-density-card-padding); border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-surface); }
    .sage-card-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1rem; }
    .sage-card-head > * { min-width: 0; overflow-wrap: anywhere; }
    .sage-card-index { max-width: 100%; color: var(--sage-faint); font-size: .7rem; text-align: right; overflow-wrap: anywhere; }
    .sage-card-icon { margin-top: 1.6rem; color: var(--sage-brand); font-size: 1.35rem; }
    .sage-card h2 { margin: .7rem 0 .55rem; color: var(--sage-ink); font-size: 1.15rem; font-weight: 580; letter-spacing: -.02em; }
    .sage-card p { margin: 0; color: var(--sage-muted); font-size: .86rem; line-height: 1.7; }
    .sage-runtime-card p#state-message { min-height: 2.9rem; }
    .sage-runtime-card .sage-secondary-button { margin-top: 1rem; }
    .sage-card-note { margin-top: 1.3rem !important; font-size: .72rem !important; }
    .sage-state-row { display: flex; align-items: center; gap: var(--sage-density-row-gap); color: var(--sage-warning); font-size: .75rem; }
    .sage-link-button { display: inline-flex; gap: .45rem; margin-top: 1.35rem; padding: 0; border: 0; background: transparent; color: var(--sage-brand); cursor: pointer; font-size: .78rem; }
    .sage-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .sage-section-tools { display: flex; align-items: center; gap: .5rem; }
    .sage-matter-trace-toggle, .sage-matter-trace-close { display: none; }
    .sage-matter-workbench { display: grid; grid-template-columns: minmax(0, 1fr) minmax(19rem, 23rem); gap: 1rem; min-height: calc(100vh - 10.5rem); align-items: start; }
    .sage-matter-workbench-main { min-height: calc(100vh - 10.5rem); }
    .sage-matter-workbench-main > h2 { margin-top: 1rem; font-size: 1.3rem; font-weight: 620; letter-spacing: -.01em; line-height: 1.35; }
    .sage-matter-stage-track { margin-top: 1.4rem; padding: 1rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-raised); }
    .sage-matter-stage-track-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .45rem 1rem; }
    .sage-matter-stage-track-head strong { color: var(--sage-faint); font-size: .66rem; font-weight: 500; }
    .sage-matter-stage-track ol { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .45rem; margin: .8rem 0 0; padding: 0; list-style: none; }
    .sage-matter-stage-item { display: grid; gap: .3rem; min-width: 0; padding: .65rem .55rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); color: var(--sage-faint); background: var(--sage-surface); }
    .sage-matter-stage-item > span { font-size: .6rem; letter-spacing: .08em; }
    .sage-matter-stage-item > strong { color: inherit; font-size: .68rem; font-weight: 550; line-height: 1.35; overflow-wrap: anywhere; }
    .sage-matter-stage-item[data-stage-state="current"] { border-color: var(--sage-brand); color: var(--sage-brand); background: var(--sage-overlay); }
    .sage-matter-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 1rem; }
    .sage-matter-clarification { margin-top: 1.4rem; padding: 1rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-raised); }
    .sage-matter-clarification p { margin-top: .65rem; }
    .sage-matter-composer { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--sage-divider); }
    .sage-matter-composer .sage-card-note { margin-top: .65rem !important; }
    .sage-matter-trace-rail { position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow: auto; background: var(--sage-overlay); }
    .sage-trace-rail-head, .sage-trace-group-head, .sage-trace-state { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
    .sage-trace-rail-head h2 { margin: .45rem 0 0; }
    .sage-matter-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45rem; margin-top: 1rem; }
    .sage-matter-metrics > div { display: grid; gap: .2rem; padding: .65rem .5rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); text-align: center; }
    .sage-matter-metrics strong { color: var(--sage-brand); font-size: 1.05rem; font-weight: 580; }
    .sage-matter-metrics span { color: var(--sage-faint); font-size: .64rem; }
    .sage-trace-state { margin-top: .75rem; padding: .65rem 0 0; border-top: 1px solid var(--sage-divider); color: var(--sage-muted); font-size: .7rem; }
    .sage-trace-state strong { color: var(--sage-brand); font-size: .72rem; font-weight: 550; overflow-wrap: anywhere; text-align: right; }
    .sage-trace-state strong.is-blocked { color: var(--sage-warning); }
    .sage-matter-trace-group { margin-top: 1.1rem; padding-top: .9rem; border-top: 1px solid var(--sage-divider); }
    .sage-trace-group-head h3 { margin: 0; color: var(--sage-ink); font-size: .78rem; font-weight: 600; }
    .sage-trace-group-head span { color: var(--sage-faint); font-size: .66rem; }
    .sage-matter-trace-group ol { display: grid; gap: .45rem; margin: .65rem 0 0; padding: 0; list-style: none; }
    .sage-trace-entry { display: grid; gap: .25rem; padding: .65rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-surface); }
    .sage-trace-entry strong { color: var(--sage-ink); font-size: .72rem; font-weight: 580; overflow-wrap: anywhere; }
    .sage-trace-entry span { color: var(--sage-faint); font-size: .64rem; line-height: 1.45; overflow-wrap: anywhere; }
    .sage-trace-entry.is-empty { border-style: dashed; color: var(--sage-faint); font-size: .68rem; }
    .sage-support-heading { margin: 2rem 0 1rem; padding-top: 1.5rem; border-top: 1px solid var(--sage-divider); }
    .sage-support-heading h2 { margin: .45rem 0; color: var(--sage-ink); font-size: 1.2rem; font-weight: 580; }
    .sage-support-heading p { margin: 0; color: var(--sage-faint); font-size: .72rem; }
    .sage-governance-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(15rem, .75fr); gap: 1rem; }
    .sage-state-row { flex-wrap: wrap; justify-content: space-between; min-width: 0; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--sage-divider); color: var(--sage-muted); }
    .sage-state-row strong { min-width: 0; color: var(--sage-brand); font-size: .8rem; font-weight: 550; overflow-wrap: anywhere; text-align: right; }
    .sage-state-row strong.is-blocked, .sage-state-tag.is-blocked { color: var(--sage-warning); }
    .sage-side-note { align-self: start; }
    .sage-side-note .sage-secondary-button { margin-top: 1.25rem; }
    .sage-action-preview-section { margin-top: 1rem; padding: 1.35rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-raised); }
    .sage-action-preview-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .sage-action-preview-heading h2 { margin: .55rem 0 0; color: var(--sage-ink); font-size: 1.25rem; font-weight: 560; }
    .sage-preview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-top: 1rem; }
    .sage-action-preview-card { min-width: 0; padding: 1rem; border: 1px solid var(--sage-divider); border-radius: var(--sage-radius); background: var(--sage-surface); }
    .sage-action-preview-head { display: grid; gap: .45rem; }
    .sage-action-preview-head strong { color: var(--sage-ink); font-size: .9rem; font-weight: 580; }
    .sage-action-preview-state { display: inline-flex; margin-top: .9rem; padding: .25rem .5rem; border: 1px solid var(--sage-border); border-radius: 99rem; color: var(--sage-brand); font-size: .7rem; }
    .sage-action-preview-state.is-blocked { border-color: var(--sage-warning); color: var(--sage-warning); }
    .sage-preview-meta { display: grid; gap: .25rem; margin: .85rem 0 0; color: var(--sage-faint); font-size: .68rem; line-height: 1.4; }
    .sage-preview-meta code, .sage-preview-denial code { overflow-wrap: anywhere; color: var(--sage-muted); font: inherit; }
    .sage-preview-denial { margin: .85rem 0 0; padding-top: .75rem; border-top: 1px solid var(--sage-divider); color: var(--sage-faint); font-size: .68rem; line-height: 1.45; }
    .sage-preview-foot { display: flex; justify-content: space-between; align-items: end; gap: .5rem; margin-top: 1rem; color: var(--sage-faint); font-size: .65rem; line-height: 1.35; }
    .sage-preview-not-submitted { color: var(--sage-brand); text-align: right; }
    .sage-capability-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
    .sage-capability-glyph { color: var(--sage-brand); font-size: .76rem; letter-spacing: .1em; }
    .sage-state-tag { display: inline-block; margin-top: 1.2rem; color: var(--sage-brand); font-size: .7rem; }
    .sage-governance-card h2 { margin-top: 1.25rem; }
    .sage-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; color: var(--sage-faint); font-size: .68rem; }
    @keyframes sage-panel-in { from { opacity: 0; transform: translateY(.3rem); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 900px) {
      .sage-matter-workbench { grid-template-columns: minmax(0, 1fr); }
      .sage-matter-workbench-main { min-height: calc(100vh - 10.5rem); }
      .sage-matter-stage-track ol { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .sage-matter-trace-toggle { display: inline-flex; }
      .sage-matter-trace-rail { position: fixed; inset: .5rem .5rem .5rem auto; z-index: 6; width: min(26rem, calc(100vw - 1rem)); max-height: none; opacity: 0; visibility: hidden; pointer-events: none; box-shadow: var(--sage-shadow); transition: opacity var(--sage-motion), visibility var(--sage-motion); }
      .sage-matter-trace-rail[data-drawer-open="true"] { opacity: 1; visibility: visible; pointer-events: auto; }
      .sage-matter-trace-close { display: inline-flex; }
    }
    @media (max-width: 800px) {
      .sage-app { grid-template-columns: 5.2rem minmax(0, 1fr); }
      .sage-sidebar { padding-inline: .55rem; }
      .sage-brand { justify-content: center; padding-inline: 0; }
      .sage-brand > span:last-child, .sage-nav-label, .sage-current-context, .sage-sidebar-foot > span:last-child,
      .sage-nav-item > span:not(.sage-nav-icon):not(.sage-nav-count) { display: none; }
      .sage-nav-item { justify-content: center; padding-inline: .4rem; position: relative; }
      .sage-nav-item .sage-nav-count { position: absolute; top: .15rem; right: .4rem; margin-left: 0; }
      .sage-sidebar-foot { justify-content: center; padding-inline: 0; }
    }
    @media (max-width: 680px) {
      .sage-main { padding-inline: 1rem; }
      .sage-topbar { display: block; }
      .sage-topbar-meta { justify-content: flex-start; margin-top: .8rem; }
      .sage-governance-grid, .sage-capability-grid, .sage-matter-facts { grid-template-columns: 1fr; }
      .sage-matter-stage-track ol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sage-preview-grid { grid-template-columns: 1fr; }
      .sage-footer { display: block; line-height: 1.7; }
    }
    @media (max-width: 420px) {
      .sage-app { grid-template-columns: 3.75rem minmax(0, 1fr); }
      .sage-sidebar { padding-inline: .25rem; }
      .sage-main { padding-inline: .6rem; }
      .sage-card { padding: .9rem; }
      .sage-section-heading { align-items: flex-start; flex-direction: column; }
      .sage-section-tools, .sage-topbar-meta { max-width: 100%; flex-wrap: wrap; }
      .sage-link-section, .sage-link-card, .sage-state-row { min-width: 0; max-width: 100%; }
      .sage-state-row { align-items: stretch; flex-direction: column; }
      .sage-state-row > *, .sage-link-card select, .sage-row-input { width: 100%; min-width: 0; max-width: 100%; }
      .sage-state-row strong { text-align: left; }
      .sage-card h2, .sage-section-heading h1 { overflow-wrap: anywhere; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  ${renderSageWorkspace()}
  <script>
    const statePath = ${statePath};
    const actionsPath = ${actionsPath};
    const loginPath = '/.sage/login';
    const logoutPath = '/.sage/logout';
    const requestTimeoutMs = ${SAGE_REQUEST_TIMEOUT_MS};
    const sageWorkspace = document.querySelector('#sage-workspace');
    const matterProjectionPill = document.querySelector('#matter-projection-pill');
    const matterContextGoal = document.querySelector('#matter-context-goal');
    const matterContextId = document.querySelector('#matter-context-id');
    const matterContextStage = document.querySelector('#matter-context-stage');
    const matterContextRevision = document.querySelector('#matter-context-revision');
    // ADR-0261 P2: the matter workbench region (heading + focus card + trace rail) is owned by
    // the React app. This script validates the wire and publishes it through the bridge; it
    // must not query or write any node inside #sage-matter-region.
    const title = document.querySelector('#state-title');
    const message = document.querySelector('#state-message');
    const retry = document.querySelector('#retry');
    const reconcile = document.querySelector('#reconcile');
    const commandNote = document.querySelector('#command-note');
    const login = document.querySelector('#login');
    const identityLabels = Array.from(document.querySelectorAll('[data-identity-label]'));
    const logoutEntries = Array.from(document.querySelectorAll('[data-logout-entry]'));
    const profileNote = document.querySelector('#profile-status-note');
    // Batch 26 / P4（ADR-0261）：能力名册与模型配置卡归 React 区域（#sage-region-capability / #sage-region-model-config / 头部来源徽记），本脚本不再查询其节点。
    const adoptButton = document.querySelector('#adopt-workspace');
    const workspaceNote = document.querySelector('#workspace-note');
    const workspaceRows = document.querySelector('#workspace-rows');
    const workspaceListNote = document.querySelector('#workspace-list-note');
    const workspaceMutationNote = document.querySelector('#workspace-mutation-note');
    const fileWorkspace = document.querySelector('#file-workspace');
    const filePath = document.querySelector('#file-path');
    const fileList = document.querySelector('#file-list');
    const fileCandidates = document.querySelector('#file-candidates');
    const fileNote = document.querySelector('#file-note');
    const fileReferences = document.querySelector('#file-references');
    const fileUseNote = document.querySelector('#file-use-note');
    const filePreview = document.querySelector('#file-preview');
    const visibilityFacts = Array.from(document.querySelectorAll('[data-visibility-fact]'));
    const visibilityOrg = document.querySelector('#visibility-org');
    const visibilityOwner = document.querySelector('#visibility-owner');
    const visibilityNote = document.querySelector('#visibility-note');
    const knowledgeState = document.querySelector('#knowledge-state');
    const knowledgeNote = document.querySelector('#knowledge-note');
    const knowledgeRows = document.querySelector('#knowledge-rows');
    const pluginRows = document.querySelector('#plugin-rows');
    const pluginObservation = document.querySelector('#plugin-observation');
    const pluginNote = document.querySelector('#plugin-note');
    const diagnosticsHarness = document.querySelector('#diagnostics-harness');
    const diagnosticsProtocol = document.querySelector('#diagnostics-protocol');
    const diagnosticsGeneration = document.querySelector('#diagnostics-generation');
    const diagnosticsManifest = document.querySelector('#diagnostics-manifest');
    const diagnosticsDataroot = document.querySelector('#diagnostics-dataroot');
    const diagnosticsError = document.querySelector('#diagnostics-error');
    // Batch 23 / P3（ADR-0261）：草案卡归 React 区域（#sage-region-draft），本脚本不再查询其节点。
    const editDraftNote = document.querySelector('#edit-draft-note');
    const editDraftRows = document.querySelector('#edit-draft-rows');
    const editDraftDetail = document.querySelector('#edit-draft-detail');
    const editDraftVersion = document.querySelector('#edit-draft-version');
    const editDraftSourceState = document.querySelector('#edit-draft-source-state');
    const editDraftProposed = document.querySelector('#edit-draft-proposed');
    const editDraftSave = document.querySelector('#edit-draft-save');
    const editDraftDiffButton = document.querySelector('#edit-draft-diff');
    const editDraftDiffView = document.querySelector('#edit-draft-diff-view');
    const editDraftDiffNote = document.querySelector('#edit-draft-diff-note');
    const editDraftPrepare = document.querySelector('#edit-draft-prepare');
    const editDraftWritebackCard = document.querySelector('#edit-draft-writeback-card');
    const writebackTarget = document.querySelector('#writeback-target');
    const writebackAction = document.querySelector('#writeback-action');
    const writebackVersion = document.querySelector('#writeback-version');
    const writebackCurrent = document.querySelector('#writeback-current');
    const writebackImpact = document.querySelector('#writeback-impact');
    const writebackCost = document.querySelector('#writeback-cost');
    const editDraftWritebackNow = document.querySelector('#edit-draft-writeback-now');
    const editDraftWritebackCancel = document.querySelector('#edit-draft-writeback-cancel');
    const editDraftResult = document.querySelector('#edit-draft-result');
    // Batch 21 / P3（ADR-0261）：事项管理卡与任务分组卡归 React 区域（#sage-region-matter-admin /
    // #sage-region-matter-groups），本脚本不再查询它们的节点。
    // Batch 19 / P3（ADR-0261）：方案卡归 React 区域（#sage-region-plans），本脚本不再查询其节点。
    const exitCheckOpen = document.querySelector('#exit-check-open');
    const exitDialog = document.querySelector('#exit-dialog');
    const exitImpactRows = document.querySelector('#exit-impact-rows');
    const exitNote = document.querySelector('#exit-note');
    const exitCancel = document.querySelector('#exit-cancel');
    const exitStop = document.querySelector('#exit-stop');
    const guideToggle = document.querySelector('#guide-toggle');
    const guideRows = document.querySelector('#guide-rows');
    const envRuntime = document.querySelector('#env-runtime');
    const envMatterRef = document.querySelector('#env-matter-ref');
    const envFold = document.querySelector('#env-fold');
    // Batch 20 / P3（ADR-0261）：关联卡（选择器簇）归 React 区域（#sage-region-link），本脚本不再查询其节点。
    // Batch 24 / P3（ADR-0261）：会话卡（D3）归 React 区域（#sage-region-session），本脚本不再查询其节点。
    const feedbackText = document.querySelector('#feedback-text');
    const feedbackCode = document.querySelector('#feedback-code');
    const feedbackStage = document.querySelector('#feedback-stage');
    const feedbackSubmit = document.querySelector('#feedback-submit');
    const feedbackNote = document.querySelector('#feedback-note');
    const feedbackReceipts = document.querySelector('#feedback-receipts');
    const navMatterCount = document.querySelector('#nav-matter-count');
    // Batch 22 / P3（ADR-0261）：事项列表卡归 React 区域（#sage-region-matter-list），本脚本不再查询其节点；
    // 侧栏计数（区域外事实）仍在这里按镜像筛选态更新。
    // Batch 25 / P4（ADR-0261）：搜索卡归 React 区域（#sage-region-search），本脚本不再查询其节点。
    // Ticket 020/047: both entries read the same eight-item projection — the settings-page selects
    // and the quick-appearance menu. A save failure rewrites both from the stored value (US-109/221).
    const PREF_KEYS = ['theme', 'language', 'density', 'fontStyle', 'contentWidth', 'terminalTheme', 'fileIcons', 'iconAppearance'];
    const prefSelects = {
      theme: document.querySelector('#pref-theme'),
      language: document.querySelector('#pref-language'),
      density: document.querySelector('#pref-density'),
      fontStyle: document.querySelector('#pref-font-style'),
      contentWidth: document.querySelector('#pref-content-width'),
      terminalTheme: document.querySelector('#pref-terminal-theme'),
      fileIcons: document.querySelector('#pref-file-icons'),
      iconAppearance: document.querySelector('#pref-icon-appearance'),
    };
    const menuSelects = {
      theme: document.querySelector('#menu-theme'),
      language: document.querySelector('#menu-language'),
      density: document.querySelector('#menu-density'),
      fontStyle: document.querySelector('#menu-font-style'),
      contentWidth: document.querySelector('#menu-content-width'),
      terminalTheme: document.querySelector('#menu-terminal-theme'),
      fileIcons: document.querySelector('#menu-file-icons'),
      iconAppearance: document.querySelector('#menu-icon-appearance'),
    };
    const prefSave = document.querySelector('#pref-save');
    const prefNote = document.querySelector('#pref-note');
    const menuNote = document.querySelector('#menu-note');
    const settingsLeafGrid = document.querySelector('#settings-leaf-grid');
    // Both entries are written from the same projection; a save failure forces the next render to
    // rewrite them from the stored value (the displayed value falls back, US-109/110).
    let prefSignature = null;
    let prefForceSync = false;
    let prefLocalNotice = null;
    let menuLocalNotice = null;
    const userMenu = document.querySelector('#user-menu');
    const userMenuPanel = document.querySelector('#user-menu-panel');
    const runtimeLabels = Array.from(document.querySelectorAll('[data-runtime-label]'));
    const runtimeBadges = Array.from(document.querySelectorAll('[data-runtime-badge]'));
    const runtimeDots = Array.from(document.querySelectorAll('[data-runtime-dot]'));
    const navItems = Array.from(document.querySelectorAll('[data-view]'));
    const panels = Array.from(document.querySelectorAll('[data-panel]'));
    const labels = { ready: '已就绪', unavailable: '暂不可用', recovering: '正在恢复' };
    const badgeLabels = { ready: '运行时已就绪', unavailable: '运行时不可用', recovering: '检查中' };

    function fallback() {
      return { status: 'unavailable', message: 'Sage 暂时无法读取受控状态，可稍后重新检查。', retryable: true };
    }

    const matterStageLabels = {
      created: '已创建',
      evidence: '整理证据',
      running: '执行中',
      clarification: '等待澄清',
      'artifact-receipt': '等待回执',
      'failed-retry': '失败待复核',
    };
    const matterActionabilityLabels = {
      allowed: '可提交',
      blocked: '已阻断',
      'requires-confirmation': '需要确认',
    };
    const matterActionLabels = {
      'create-matter': '创建经营事项',
      'enter-evidence': '录入证据',
      'answer-clarification': '回答澄清',
      approve: '批准',
      reject: '拒绝',
      revoke: '撤销',
      'start-attempt': '开始执行',
      'stop-attempt': '停止执行',
      'retry-attempt': '重试执行',
      'open-artifact': '打开产物',
      'accept-receipt': '接受回执',
      'reject-receipt': '拒绝回执',
      'retry-capability': '重试能力检查',
    };
    const matterCompatibilityOutcomes = new Set(['equivalent', 'requires-new-revision', 'unknown']);
    const matterAuthorizationStates = new Set(['authorized', 'denied', 'requires-confirmation', 'unknown']);
    const matterAvailabilityStates = new Set(['available', 'unavailable', 'recovering', 'unknown']);
    const matterActionabilities = new Set(Object.keys(matterActionabilityLabels));
    const matterDenialReasons = new Set([
      'fixture-only',
      'runtime-unavailable',
      'compatibility-unknown',
      'authorization-required',
      'decision-required',
      'stale-revision',
      'external-capability-unavailable',
    ]);

    function isRecord(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function hasOwn(record, key) {
      return Object.prototype.hasOwnProperty.call(record, key);
    }

    function isNonEmptyString(value) {
      return typeof value === 'string' && value.trim() !== '';
    }

    function isOptionalString(value) {
      return value === undefined || isNonEmptyString(value);
    }

    function isCount(value) {
      return Number.isSafeInteger(value) && value >= 0;
    }

    function isPendingClarification(value) {
      return value === undefined || (isRecord(value)
        && isNonEmptyString(value.eventId)
        && isNonEmptyString(value.revisionId)
        && isOptionalString(value.actionScope)
        && isNonEmptyString(value.reason)
        && isNonEmptyString(value.requestedAt));
    }

    function isMatterAction(value) {
      return isRecord(value)
        && hasOwn(matterActionLabels, value.type)
        && isOptionalString(value.revisionId)
        && isOptionalString(value.actionScope)
        && matterActionabilities.has(value.actionability)
        && (value.denialReason === undefined || matterDenialReasons.has(value.denialReason))
        && (value.actionability !== 'blocked' || value.denialReason !== undefined);
    }

    function isMatterDecision(value) {
      return isRecord(value)
        && isNonEmptyString(value.decisionId)
        && isNonEmptyString(value.revisionId)
        && isNonEmptyString(value.actionScope)
        && ['approved', 'rejected', 'revoked'].includes(value.status)
        && isOptionalString(value.expiresAt);
    }

    function isMatterAttempt(value) {
      return isRecord(value)
        && isNonEmptyString(value.attemptId)
        && isNonEmptyString(value.revisionId)
        && ['running', 'blocked', 'failed', 'succeeded'].includes(value.status)
        && isNonEmptyString(value.startedAt)
        && isOptionalString(value.endedAt);
    }

    function isMatterArtifact(value) {
      return isRecord(value)
        && isNonEmptyString(value.artifactId)
        && isNonEmptyString(value.revisionId)
        && isNonEmptyString(value.attemptId)
        && isNonEmptyString(value.kind)
        && isNonEmptyString(value.recordedAt);
    }

    function isMatterReceipt(value) {
      return isRecord(value)
        && isNonEmptyString(value.receiptId)
        && isNonEmptyString(value.revisionId)
        && isNonEmptyString(value.artifactId)
        && ['accepted', 'rejected'].includes(value.verdict)
        && isNonEmptyString(value.actorRoleRef)
        && isNonEmptyString(value.recordedAt);
    }

    function isMatterProjection(value) {
      if (!isRecord(value)
        || value.schemaVersion !== 'sage.matter-view.v1'
        || !['fixture', 'live'].includes(value.projectionSource)
        || !isRecord(value.matter)
        || !isNonEmptyString(value.matter.matterId)
        || !isNonEmptyString(value.matter.goal)
        || !isNonEmptyString(value.matter.responsiblePartyRoleRef)
        || !hasOwn(matterStageLabels, value.matter.stage)
        || (value.matter.conclusion !== undefined && !['completed', 'stopped'].includes(value.matter.conclusion))
        || !isOptionalString(value.matter.currentRevisionId)
        || !isCount(value.matter.revisionCount)
        || !isCount(value.matter.evidenceCount)
        || !isCount(value.matter.unknownCount)
        || !isCount(value.matter.dependencyCount)
        || !isPendingClarification(value.matter.pendingClarification)
        || !matterCompatibilityOutcomes.has(value.compatibilityOutcome)
        || !matterAuthorizationStates.has(value.authorizationState)
        || !matterAvailabilityStates.has(value.availabilityState)
        || !matterActionabilities.has(value.actionability)
        || (value.denialReason !== undefined && !matterDenialReasons.has(value.denialReason))
        || (value.actionability === 'blocked' && value.denialReason === undefined)
        || !Array.isArray(value.actions)
        || !value.actions.every(isMatterAction)
        || !Array.isArray(value.decisions)
        || !value.decisions.every(isMatterDecision)
        || !Array.isArray(value.attempts)
        || !value.attempts.every(isMatterAttempt)
        || !Array.isArray(value.artifacts)
        || !value.artifacts.every(isMatterArtifact)
        || !Array.isArray(value.receipts)
        || !value.receipts.every(isMatterReceipt)) return false;
      return true;
    }

    function parseServiceStateEnvelope(value) {
      if (!isRecord(value)
        || !hasOwn(value, 'service')
        || !hasOwn(value, 'runtime')
        || !hasOwn(value, 'matter')
        || !isRecord(value.service)
        || (value.runtime !== null && !isRecord(value.runtime))) return null;
      return value;
    }

    function isProjectionReadUnavailableRouteDenial(value) {
      return isRecord(value)
        && value.code === 'projection-read-unavailable'
        && value.stage === 'read-policy'
        && value.retryable === true
        && isNonEmptyString(value.correlation)
        && !hasOwn(value, 'service')
        && !hasOwn(value, 'runtime')
        && !hasOwn(value, 'matter');
    }

    function setMatterText(node, value) {
      if (node !== null) node.textContent = value;
    }

    function setMatterText(node, value) {
      if (node !== null) node.textContent = value;
    }

    // ADR-0261 P2: the matter workbench region lives in the React app. This script keeps the
    // non-region facts (workspace root attributes, sidebar context, status pill) and publishes
    // the validated matter state through the bridge; it must not write inside #sage-matter-region.
    function publishRegion(region, message) {
      const bridge = globalThis.__SAGE_APP_SET_REGION__;
      if (typeof bridge === 'function') bridge(region, message);
    }

    function publishMatterUnavailable(kind) {
      const invalid = kind === 'invalid';
      const label = invalid ? 'projection invalid' : 'projection unavailable';
      if (sageWorkspace !== null) {
        sageWorkspace.dataset.projectionSource = 'unavailable';
        sageWorkspace.dataset.matterRenderState = kind;
      }
      setMatterText(matterProjectionPill, label + ' · 不执行外部动作');
      setMatterText(matterContextGoal, '当前没有可用的事项投影');
      setMatterText(matterContextId, '—');
      setMatterText(matterContextStage, invalid ? '格式无效' : '未读取');
      setMatterText(matterContextRevision, '—');
      publishRegion('matter', { kind: invalid ? 'invalid' : 'unavailable' });
    }

    function publishMatterProjection(value) {
      if (value === null) {
        publishMatterUnavailable('unavailable');
        return;
      }
      if (!isMatterProjection(value)) {
        publishMatterUnavailable('invalid');
        return;
      }
      const projectionLabel = value.projectionSource === 'fixture' ? 'fixture projection' : 'live projection';
      const revisionId = value.matter.currentRevisionId ?? 'revision pending';
      if (sageWorkspace !== null) {
        sageWorkspace.dataset.projectionSource = value.projectionSource;
        sageWorkspace.dataset.matterRenderState = value.projectionSource;
      }
      setMatterText(matterProjectionPill, projectionLabel + ' · 不执行外部动作');
      setMatterText(matterContextGoal, value.matter.goal);
      setMatterText(matterContextId, value.matter.matterId);
      setMatterText(matterContextStage, matterStageLabels[value.matter.stage]);
      setMatterText(matterContextRevision, revisionId);
      publishRegion('matter', { kind: 'projection', projection: value });
    }

    function publishAppView(view) {
      const bridge = globalThis.__SAGE_APP_SET_VIEW__;
      if (typeof bridge === 'function') bridge(view);
    }

    function setView(view) {
      const nextView = panels.some((panel) => panel.dataset.panel === view) ? view : 'matter';
      publishAppView(nextView);
      navItems.forEach((item) => {
        const active = item.dataset.view === nextView;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        const active = panel.dataset.panel === nextView;
        panel.hidden = !active;
        panel.classList.toggle('is-visible', active);
      });
    }

    function render(state) {
      const safe = state && typeof state === 'object' && labels[state.status] ? state : fallback();
      title.textContent = labels[safe.status];
      message.textContent = typeof safe.message === 'string' ? safe.message : fallback().message;
      retry.hidden = safe.retryable !== true;
      retry.disabled = safe.status === 'recovering';
      runtimeLabels.forEach((node) => { node.textContent = labels[safe.status]; });
      runtimeBadges.forEach((node) => { node.textContent = badgeLabels[safe.status]; });
      runtimeDots.forEach((node) => {
        node.classList.toggle('is-ready', safe.status === 'ready');
        node.classList.toggle('is-unavailable', safe.status === 'unavailable');
      });
    }

    // US-122: readable wording comes from this static table keyed by the machine code; the code,
    // any path, and anything the shell did not decide never reach the text.
    const commandNotes = {
      'identity-unavailable': '未就绪：还没有可用的受控身份，补齐后再执行同一动作。',
      'compatibility-unknown': '未就绪：兼容结论尚未取得，补齐运行事实后再执行同一动作。',
      'registry-unavailable': '未就绪：能力目录还没有授权结论，补齐后再执行同一动作。',
      'capability-unavailable': '未就绪：所选外部能力当前不可用，恢复后再执行同一动作。',
      'persistence-unavailable': '未就绪：受控存储不可用，恢复后再执行同一动作。',
      'outcome-unknown': '结果未知：这一操作可能已经生效。请先核对同一操作的状态，不要直接重试。',
      'policy-denied': '确定失败：当前授权不允许这一动作，需要相应责任方决定。',
      'stale-revision': '确定失败：所依据的版本已过期，请在新版本上重新发起。',
      'requires-new-revision': '确定失败：需要先补一条修订再执行。',
      'cancelled-before-dispatch': '确定失败：动作已取消，未发出执行。',
      'decision-required': '确定失败：缺少生效决定，请补决定后执行。',
      'conflict': '确定失败：同一对象已有其他变更，请核对后再处理。',
      'invalid-intent': '确定失败：界面未收到可执行的动作描述。',
      'invalid-request': '确定失败：这一动作类型未登记授权范围。',
      'environment-unavailable': '未就绪：该事项选定的默认执行环境已不可用（未关联或已不在工作区列表）。请先处理环境，再执行同一动作——不会自动换到别的工作区。',
    };
    const outcomeNotes = {
      unknown: '结果未知：这一操作可能已经生效。请先核对同一操作的状态，不要直接重试。',
      'not-ready': '未就绪：缺少可以执行这一动作的前提，补齐后才会继续。',
      failed: '确定失败：这一动作未被执行，请按说明处理。',
    };
    // 未核验的原因由 main 给码，文案留在界面这张静态表里（US-158：不把"没读到"说成"已停用"）。
    const workspaceListReasonNotes = {
      'not-read': '未核验：还没有读到工作区列表。',
      'bridge-host-not-ready': '未就绪：能力运行时还没就绪，稍后再读。',
      'bridge-provider-unavailable': '不可用：运行时没有提供工作区列表。',
      'bridge-stream-overflow': '未核验：这次的列表流超出上限，已中止读取。',
      'bridge-stream-closed': '未核验：列表读取被提前中止。',
      'bridge-provider-failed': '失败：读取工作区列表时出错。',
      'bridge-result-not-plain-data': '未核验：列表内容无法识别，已按不可信拒绝采用。',
      'bridge-answer-unrecognised': '失败：运行时的回答无法识别。',
    };
    const workspaceAdoptionReasonNotes = {
      'workspace-adoption-unavailable': '不可用：这一版还没有接上工作区的能力，采纳请求没有被发出。',
      'workspace-adoption-failed': '失败：采纳请求没有完成，没有产生工作区。',
      'bridge-provider-unavailable': '不可用：运行时缺少目录选择或工作区登记能力。',
      'bridge-host-not-ready': '未就绪：能力运行时还没就绪，稍后再试。',
      'bridge-path-invalid': '拒绝：所选路径不是可以采纳的绝对路径。',
      'bridge-answer-unrecognised': '失败：运行时的回答无法识别，已按未采纳处理。',
    };
    // 变更类动作的拒绝码：基座自己的码在这里翻成界面自己的一句话；未知码落到通用句（US-122）。
    const workspaceMutationReasonNotes = {
      'workspace-mutation-unavailable': '不可用：这一版还没有接上工作区变更的能力，请求没有被发出。',
      'workspace-mutation-failed': '失败：变更请求没有完成，列表没有变化。',
      'bridge-workspace-name-conflict': '确定失败：这个名称已被另一个工作区使用，未做修改。',
      'bridge-workspace-unknown': '确定失败：这个工作区已不在登记里，可能已被别处移除。',
      'bridge-workspace-reorder-invalid': '确定失败：排序的参照工作区不在登记里，顺序未改变。',
      'bridge-workspace-ref-invalid': '确定失败：界面给出的工作区标识不合法，未发出请求。',
      'bridge-workspace-title-invalid': '确定失败：名称不能为空，且不能只有空格。',
      'bridge-workspace-path-rejected': '拒绝：所选路径不能作为工作区。',
      'bridge-provider-unavailable': '不可用：运行时缺少工作区管理能力。',
      'bridge-provider-failed': '失败：运行时拒绝了这次变更。',
      'bridge-host-not-ready': '未就绪：能力运行时还没就绪，稍后再试。',
      'bridge-answer-unrecognised': '失败：运行时的回答无法识别，已按未生效处理。',
    };
    // 013：候选 / 引用 / 取用三面的拒绝码各有一套说法；失效句只说"这次取不到"，不说文件被删。
    const fileReasonNotes = {
      'file-candidates-unavailable': '不可用：这一版还没有接上文件候选的能力。',
      'file-candidates-failed': '失败：读取候选时出错。',
      'file-reference-unavailable': '不可用：这一版还没有接上引用的能力。',
      'file-reference-failed': '失败：建立引用时出错。',
      'file-path-outside-workspace': '拒绝：这个路径不在工作区内，引用不会指向工作区外的文件。',
      'bridge-file-scope-unavailable': '不可用：还没有与该工作区绑定的会话，文件读取面暂时不可用（不伪造会话身份）。',
      'bridge-file-not-found': '取不到：这个路径当前没有内容。',
      'bridge-file-outside-workspace': '拒绝：这个路径在工作区之外，基座不接受这次读取。',
      'bridge-file-not-regular': '拒绝：这个路径不是普通文件。',
      'bridge-file-not-directory': '拒绝：这个路径不是目录。',
      'bridge-file-too-large': '拒绝：文件超出读取上限，基座拒绝整页返回。',
      'bridge-file-not-text': '拒绝：这个文件不是可读的 UTF-8 文本。',
      'bridge-provider-unavailable': '不可用：运行时缺少文件能力。',
      'bridge-provider-failed': '失败：运行时拒绝了这次文件请求。',
      'bridge-host-not-ready': '未就绪：能力运行时还没就绪，稍后再试。',
      'bridge-answer-unrecognised': '失败：运行时的回答无法识别，已按未生效处理。',
    };
    const fileUseReasonNotes = Object.assign({}, fileReasonNotes, {
      'source-changed': '已阻断：源文件在这次取用前发生了变化，内容没有被读取。引用仍指向建立时的版本。',
      'source-not-readable': '已阻断：这次取不到原来的文件。这不表示源文件已被删除，也没有改换来源。',
      'reference-not-found': '失败：这条引用不在本次运行的记录里。',
    });
    // 026：四族只读面。缺项一律"未核验 + 原因"，绝不写成"已停用/可用"这类结论。
    const pluginUnavailableNotes = {
      'inventory-not-read': '未核验：还没有读到运行时清单；这不等于"已停用"。',
      'host-projection-unavailable': '未核验：没有可用的启动观察，安装证据无法与本次运行对应。',
      'active-profile-unavailable': '未核验：读不到当前 profile 的凭据。',
      'pmap-incomplete': '未核验：安装面证据不完整。',
      'policy-document-unavailable': '未核验：实例策略不可读。',
      'registry-unavailable': '未核验：能力目录还没有授权结论。',
      'capability-invalid': '未核验：外部能力证据不合法。',
      'runtime-effective-unavailable': '未核验：运行时清单不可读。',
      'assembly-invalid': '未核验：清单装配失败。',
    };
    const visibilityNoteText = {
      'read': '',
      'policy-unreadable': '未核验：还没有读到实例策略文件，组织范围暂不能显示（不等于没有组织）。',
      'projection-absent': '',
    };

    function renderCommand(command) {
      if (reconcile === null || commandNote === null) return;
      const known = command !== null && typeof command === 'object' && typeof command.outcome === 'string';
      const outcome = known ? command.outcome : null;
      if (outcome !== 'unknown' && outcome !== 'not-ready' && outcome !== 'failed' && outcome !== 'settled') {
        // An unrecognisable slot must not invent an entry; leave the runtime surface in charge.
        if (reconcile) reconcile.hidden = true;
        commandNote.textContent = '';
        return;
      }
      if (outcome === 'settled') {
        if (reconcile) reconcile.hidden = true;
        commandNote.textContent = '';
        return;
      }
      const code = known && typeof command.code === 'string' ? command.code : undefined;
      commandNote.textContent = (code === undefined ? undefined : commandNotes[code]) ?? outcomeNotes[outcome] ?? '';
      if (reconcile) {
        reconcile.hidden = outcome !== 'unknown';
        reconcile.disabled = false;
      }
      // The command classification outranks the runtime's own retry hint: not-ready and unknown
      // results may not be replayed, and neither may a failure the pipeline marked non-retryable.
      if (retry) retry.hidden = !(outcome === 'failed' && command.retryable === true);
    }

    function renderAuth(auth) {
      if (!auth || typeof auth !== 'object') return;
      const signedIn = auth.status === 'signed-in';
      // Re-arm every entry each refresh: click handlers disable them before the request,
      // and a failed login must leave the button clickable again (Task 4 Important fix).
      if (login) {
        login.hidden = auth.status !== 'signed-out';
        login.disabled = auth.status !== 'signed-out';
      }
      // One projection, one value: every identity entry is written from the same string in the same
      // pass, so no entry can keep its own copy or a name from a previous projection (US-207/208).
      const identityText = signedIn && typeof auth.displayName === 'string' && auth.displayName !== ''
        ? auth.displayName
        : auth.status === 'pending' ? '未就绪：登录中' : '未就绪：未登录';
      identityLabels.forEach((node) => { node.textContent = identityText; });
      if (profileNote) {
        profileNote.textContent = signedIn ? '当前身份由 Electron main 的登录投影给出。'
          : auth.status === 'pending' ? '未就绪：登录流程仍在进行，完成前不显示身份名。'
          : '未就绪：还没有已核验身份，登录后此处显示与用户菜单同名的那一份。';
      }
      logoutEntries.forEach((node) => {
        node.hidden = !signedIn;
        node.disabled = !signedIn;
      });
    }

    // US-063: the base's own list, folded on main. An unread list says so; an empty read says
    // "the base reports none", which is a different sentence.
    let workspaceSignature = null;
    function renderWorkspaceList(workspaces) {
      if (workspaceRows === null || workspaceListNote === null) return;
      const known = workspaces !== null && workspaces !== undefined && typeof workspaces === 'object';
      if (!known || workspaces.state !== 'read') {
        const reason = known && typeof workspaces.reason === 'string' ? workspaces.reason : 'not-read';
        workspaceListNote.textContent = workspaceListReasonNotes[reason] ?? workspaceListReasonNotes['not-read'];
        workspaceRows.textContent = '';
        workspaceSignature = null;
        return;
      }
      const entries = Array.isArray(workspaces.entries) ? workspaces.entries : [];
      workspaceListNote.textContent = entries.length === 0
        ? '基座报告：当前没有任何工作区。'
        : '基座报告 ' + String(entries.length) + ' 个工作区（来源：follow 流的基线＋增量）。';
      // Same rows ⇒ keep the DOM: the poll must not wipe a name that is being typed.
      const signature = JSON.stringify(entries.map((item) => [item.workspaceId, item.title, item.path, item.sessionCount]));
      if (signature === workspaceSignature && workspaceRows.childElementCount === entries.length) {
        rearmWorkspaceRows();
        return;
      }
      workspaceSignature = signature;
      workspaceRows.textContent = '';
      for (const item of entries) {
        if (item === null || typeof item !== 'object' || typeof item.workspaceId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.workspaceId = item.workspaceId;
        const title = document.createElement('strong');
        title.textContent = typeof item.title === 'string' && item.title !== '' ? item.title : item.workspaceId;
        row.appendChild(title);
        const where = document.createElement('span');
        where.className = 'sage-roster-tag';
        where.textContent = typeof item.path === 'string' ? item.path : '';
        row.appendChild(where);
        const sessions = document.createElement('span');
        sessions.className = 'sage-roster-tag';
        sessions.textContent = '会话 ' + String(typeof item.sessionCount === 'number' ? item.sessionCount : 0);
        row.appendChild(sessions);
        const renameInput = document.createElement('input');
        renameInput.className = 'sage-row-input';
        renameInput.type = 'text';
        renameInput.value = typeof item.title === 'string' ? item.title : '';
        renameInput.setAttribute('aria-label', '新的工作区名称');
        renameInput.dataset.workspaceRenameInput = item.workspaceId;
        row.appendChild(renameInput);
        const renameButton = document.createElement('button');
        renameButton.className = 'sage-row-button';
        renameButton.type = 'button';
        renameButton.dataset.workspaceAction = 'rename';
        renameButton.textContent = '重命名';
        row.appendChild(renameButton);
        const upButton = document.createElement('button');
        upButton.className = 'sage-row-button';
        upButton.type = 'button';
        upButton.dataset.workspaceAction = 'up';
        upButton.textContent = '上移';
        row.appendChild(upButton);
        const deleteButton = document.createElement('button');
        deleteButton.className = 'sage-row-button';
        deleteButton.type = 'button';
        deleteButton.dataset.workspaceAction = 'delete';
        deleteButton.textContent = '移除登记';
        deleteButton.title = '只解除登记，不删除磁盘上的目录内容';
        row.appendChild(deleteButton);
        workspaceRows.appendChild(row);
      }
      rearmWorkspaceRows();
    }

    // The first row has nothing above it: its 上移 stays disabled instead of sending a reorder
    // the base would refuse. Every other control is re-armed here, so a refused mutation always
    // leaves every row clickable again on the next refresh.
    function rearmWorkspaceRows() {
      if (workspaceRows === null) return;
      const rows = Array.from(workspaceRows.children);
      rows.forEach((row, index) => {
        for (const button of Array.from(row.querySelectorAll('[data-workspace-action]'))) {
          button.disabled = button.dataset.workspaceAction === 'up' && index === 0;
        }
      });
    }

    // US-064: the delete sentence may never claim a directory changed. A settled removal names the
    // registration that is gone; the directory sentence is the constant half.
    function renderWorkspaceMutation(mutation) {
      if (workspaceMutationNote === null) return;
      if (mutation === null || mutation === undefined || typeof mutation !== 'object') {
        workspaceMutationNote.textContent = '';
        return;
      }
      if (mutation.state === 'settled') {
        if (mutation.kind === 'delete') {
          workspaceMutationNote.textContent = '已从列表移除登记：' + String(mutation.workspaceId) + '。这只解除 Sage 的登记，磁盘上的目录与其中的文件没有被删除。';
          return;
        }
        if (mutation.kind === 'rename') {
          workspaceMutationNote.textContent = '已重命名：' + String(mutation.title) + '（只改显示名，目录位置不变。）';
          return;
        }
        const order = Array.isArray(mutation.order) ? mutation.order : [];
        workspaceMutationNote.textContent = '已调整顺序，共 ' + String(order.length) + ' 个登记。';
        return;
      }
      const code = typeof mutation.code === 'string' ? mutation.code : 'workspace-mutation-failed';
      workspaceMutationNote.textContent = workspaceMutationReasonNotes[code] ?? workspaceMutationReasonNotes['workspace-mutation-failed'];
    }

    // US-057~062: three outcomes, three sentences. Cancelled says so and claims nothing.
    function renderWorkspaceAdoption(adoption) {
      if (workspaceNote === null) return;
      if (adoption === null || adoption === undefined) {
        workspaceNote.textContent = '';
        return;
      }
      if (typeof adoption !== 'object') {
        workspaceNote.textContent = '';
        return;
      }
      if (adoption.state === 'adopted') {
        workspaceNote.textContent = '已采纳：' + String(adoption.title) + '（' + String(adoption.path) + '）';
        return;
      }
      if (adoption.state === 'cancelled') {
        workspaceNote.textContent = '已取消选择：没有创建或记录任何工作区。';
        return;
      }
      const code = typeof adoption.code === 'string' ? adoption.code : 'workspace-adoption-failed';
      workspaceNote.textContent = workspaceAdoptionReasonNotes[code] ?? workspaceAdoptionReasonNotes['workspace-adoption-failed'];
    }

    // US-077~082: candidates come from the adopted workspace only; the reference keeps the
    // version token of its creation; a changed version blocks the use before any content read.
    function shortVersion(version) {
      return typeof version === 'string' && version.length > 12 ? version.slice(0, 12) + '…' : String(version);
    }

    function fillFileWorkspaces(workspaces) {
      if (fileWorkspace === null) return;
      const known = workspaces !== null && workspaces !== undefined && workspaces.state === 'read' && Array.isArray(workspaces.entries);
      const entries = known ? workspaces.entries : [];
      const previous = fileWorkspace.value;
      fileWorkspace.textContent = '';
      for (const item of entries) {
        if (item === null || typeof item !== 'object' || typeof item.path !== 'string') continue;
        const option = document.createElement('option');
        option.value = item.path;
        option.textContent = (typeof item.title === 'string' && item.title !== '' ? item.title : item.path) + '　' + item.path;
        fileWorkspace.appendChild(option);
      }
      if (entries.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '（还没有已采纳的工作区）';
        fileWorkspace.appendChild(option);
        fileWorkspace.value = '';
      } else {
        // The selection is written explicitly: it keeps the previous root while it still exists,
        // and otherwise names the first one — never left implicit on the browser's default.
        const wanted = entries.some((item) => item !== null && item !== undefined && item.path === previous)
          ? previous
          : String(entries[0]?.path ?? '');
        fileWorkspace.value = wanted;
      }
    }

    function renderFileCandidates(status) {
      if (fileCandidates === null || fileNote === null) return;
      fileCandidates.textContent = '';
      // No attempt yet is not a failure: the note stays empty until main reports something.
      if (status === null || status === undefined) {
        fileNote.textContent = '';
        return;
      }
      const known = typeof status === 'object';
      if (!known || status.state !== 'read') {
        const code = known && typeof status.code === 'string' ? status.code : 'file-candidates-failed';
        fileNote.textContent = fileReasonNotes[code] ?? fileReasonNotes['file-candidates-failed'];
        return;
      }
      const entries = Array.isArray(status.entries) ? status.entries : [];
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.candidatePath = entry.path;
        const name = document.createElement('strong');
        name.textContent = typeof entry.name === 'string' ? entry.name : entry.path;
        row.appendChild(name);
        const where = document.createElement('span');
        where.className = 'sage-roster-tag';
        where.textContent = entry.path;
        row.appendChild(where);
        const referenceButton = document.createElement('button');
        referenceButton.className = 'sage-row-button';
        referenceButton.type = 'button';
        referenceButton.dataset.fileAction = 'reference';
        referenceButton.textContent = '引用此文件';
        row.appendChild(referenceButton);
        fileCandidates.appendChild(row);
      }
      fileNote.textContent = entries.length === 0
        ? '这个目录里没有普通文件可供引用。'
        : '候选 ' + String(entries.length) + ' 个（工作区内，目录 ' + (status.path === '' ? '根' : String(status.path)) + '）'
          + (status.truncated === true ? '；基座已按条目上限截断。' : '。');
    }

    function renderFileReferences(references) {
      if (fileReferences === null) return;
      fileReferences.textContent = '';
      const rows = Array.isArray(references) ? references : [];
      for (const item of rows) {
        if (item === null || typeof item !== 'object' || typeof item.referenceId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.referenceId = item.referenceId;
        const name = document.createElement('strong');
        name.textContent = typeof item.path === 'string' ? item.path : item.referenceId;
        row.appendChild(name);
        const version = document.createElement('span');
        version.className = 'sage-roster-tag';
        version.textContent = '建立时版本 ' + shortVersion(item.version);
        row.appendChild(version);
        const state = document.createElement('span');
        state.className = 'sage-roster-tag ' + (item.lastUse === 'live' ? 'is-ok' : item.lastUse === 'stale' ? 'is-blocked' : '');
        state.textContent = item.lastUse === 'live' ? '上次取用：未变更' : item.lastUse === 'stale' ? '上次取用：已阻断' : '尚未取用';
        row.appendChild(state);
        const useButton = document.createElement('button');
        useButton.className = 'sage-row-button';
        useButton.type = 'button';
        useButton.dataset.fileAction = 'use';
        useButton.textContent = '取用';
        row.appendChild(useButton);
        // 027：修改稿的入口挂在引用行上——只记录引用，生成时 main 再按版本读取一次。
        const draftButton = document.createElement('button');
        draftButton.className = 'sage-row-button';
        draftButton.type = 'button';
        draftButton.dataset.fileAction = 'draft';
        draftButton.textContent = '生成修改稿';
        row.appendChild(draftButton);
        fileReferences.appendChild(row);
      }
    }

    function renderFileUse(use) {
      if (fileUseNote === null) return;
      if (filePreview !== null) {
        filePreview.hidden = true;
        filePreview.textContent = '';
      }
      if (use === null || use === undefined || typeof use !== 'object') {
        fileUseNote.textContent = '';
        return;
      }
      if (use.state === 'live') {
        const path = use.reference !== null && typeof use.reference === 'object' ? String(use.reference.path) : '';
        fileUseNote.textContent = '已按建立时的版本读取：' + path + '（版本 ' + shortVersion(use.reference && use.reference.version) + '，预览为第 1 页）。';
        if (filePreview !== null && typeof use.text === 'string') {
          filePreview.textContent = use.text;
          filePreview.hidden = false;
        }
        return;
      }
      const code = typeof use.code === 'string' ? use.code : 'file-reference-failed';
      const sentence = fileUseReasonNotes[code] ?? fileUseReasonNotes['file-reference-failed'];
      const version = use.reference !== null && use.reference !== undefined && typeof use.reference === 'object'
        ? '　引用仍指向建立时版本 ' + shortVersion(use.reference.version) + '。'
        : '';
      fileUseNote.textContent = sentence + (use.state === 'stale' ? version : '');
    }

    // 027：修改稿面。生成/保存/Diff 都从 main 拿结果；回写卡从投影渲染（轮询冲不掉）；
    // 只有「准备回写」成功与 writeback 状态变化会经过服务，没有任何直接文件写入。
    function editDraftsOf(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.editDrafts : null;
      if (slot === null || typeof slot !== 'object') return { state: 'unavailable', drafts: [] };
      return { state: typeof slot.state === 'string' ? slot.state : 'unavailable', drafts: Array.isArray(slot.drafts) ? slot.drafts : [] };
    }

    function editDraftRefusalText(payload) {
      const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
      const notes = {
        'reference-not-found': '这份引用已不在记录里：请重新建立引用。',
        'source-changed': '引用建立后源文件已变化：请重新建立引用再生成——不会把新内容当作旧版本。',
        'draft-source-too-large': '源文件超出修改稿上限（400 行）：本版不生成半份修改稿。',
        'draft-not-found': '这份修改稿不在本次运行的记录里。',
        'draft-proposed-too-large': '修改稿内容超出上限（65536 字符）。',
        'draft-unchanged': '修改稿与所依据版本一致：没有可回写的变化。',
        'writeback-source-changed': '源文件相对所依据版本已变化：这张卡已失效，请重新生成修改稿。',
        'source-unreadable': '这次读不到源文件：动作已阻断——这不表示文件已被删除。',
        'confirmation-required': '缺少有效的回写确认：请先「准备回写」展开确认卡。',
        'confirmation-stale': '回写确认已失效：动作、前提或版本已变化——请重新准备。',
        'confirmation-consumed': '这次确认已经用过了：一次确认只兑现一次回写，请重新准备。',
        'edit-draft-unavailable': '这一版还没有接上修改稿存储。',
        'edit-draft-create-failed': '生成修改稿时出错。',
        'edit-draft-diff-failed': '查看 Diff 时出错。',
        'edit-draft-prepare-failed': '准备回写时出错。',
        'edit-draft-writeback-failed': '回写请求出错。',
      };
      return notes[code] ?? ('这次请求被拒绝（' + String(code === null ? '响应无法识别' : code) + '）。');
    }

    function renderEditDiff() {
      if (editDraftDiffView === null || editDraftDiffNote === null) return;
      if (lastEditDiff === null || typeof lastEditDiff !== 'object') {
        editDraftDiffView.hidden = true;
        editDraftDiffView.textContent = '';
        editDraftDiffNote.textContent = '';
        return;
      }
      const diff = lastEditDiff;
      const lines = Array.isArray(diff.lines) ? diff.lines : [];
      editDraftDiffView.hidden = false;
      editDraftDiffView.textContent = lines.map((line) => {
        const text = line !== null && typeof line === 'object' && typeof line.text === 'string' ? line.text : '';
        const prefix = line !== null && typeof line === 'object' && line.kind === 'add' ? '+ ' : line !== null && typeof line === 'object' && line.kind === 'remove' ? '- ' : '  ';
        return prefix + text;
      }).join('\\n');
      const freshness = diff.sourceChanged === true
        ? '源文件现已变化（当前 ' + shortVersion(diff.currentVersion) + '）——回写前需重新生成'
        : '源文件与所依据版本一致';
      editDraftDiffNote.textContent = '与基于版本 ' + shortVersion(diff.basedVersion) + ' 比较：+' + String(diff.addedLines ?? 0) + ' / -' + String(diff.removedLines ?? 0) + ' 行；' + freshness
        + (diff.truncated === true ? '（行数超出显示上限，仅显示前 400 行）' : '');
    }

    function renderEditDrafts(payload) {
      if (editDraftRows === null) return;
      const status = editDraftsOf(payload);
      if (status.state !== 'read') {
        editDraftRows.textContent = '';
        if (editDraftDetail !== null) editDraftDetail.hidden = true;
        if (editDraftNote !== null && editDraftLocalNotice === null) editDraftNote.textContent = '未核验：这一版还没有接上修改稿存储。';
        return;
      }
      editDraftRows.textContent = '';
      const drafts = status.drafts;
      const current = drafts.find((entry) => entry !== null && typeof entry === 'object' && entry.draftId === currentEditDraftId)
        ?? drafts[drafts.length - 1];
      if (current === undefined || current === null || typeof current !== 'object') {
        currentEditDraftId = null;
        currentWritebackConfirmationId = null;
        if (editDraftDetail !== null) editDraftDetail.hidden = true;
        if (editDraftNote !== null && editDraftLocalNotice === null) editDraftNote.textContent = '还没有修改稿：在上面「本地引用」里对某个引用点「生成修改稿」。';
        return;
      }
      currentEditDraftId = current.draftId;
      if (editDraftDetail !== null) editDraftDetail.hidden = false;
      for (const entry of drafts) {
        if (entry === null || typeof entry !== 'object' || typeof entry.draftId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.editDraftId = entry.draftId;
        const name = document.createElement('strong');
        name.textContent = typeof entry.name === 'string' && entry.name !== '' ? entry.name : entry.draftId;
        row.appendChild(name);
        const pathTag = document.createElement('span');
        pathTag.className = 'sage-roster-tag';
        pathTag.textContent = typeof entry.path === 'string' ? entry.path : '';
        row.appendChild(pathTag);
        const versionTag = document.createElement('span');
        versionTag.className = 'sage-roster-tag';
        versionTag.textContent = '基于 ' + shortVersion(entry.basedVersion);
        row.appendChild(versionTag);
        const stateTag = document.createElement('span');
        stateTag.className = 'sage-roster-tag ' + (entry.sourceState === 'unchanged' ? 'is-ok' : entry.sourceState === 'changed' ? 'is-blocked' : '');
        stateTag.textContent = entry.sourceState === 'unchanged' ? '源未变更'
          : entry.sourceState === 'changed' ? '源已变化'
            : entry.sourceState === 'not-readable' ? '源不可读' : '源状态未核验';
        row.appendChild(stateTag);
        editDraftRows.appendChild(row);
      }
      const sourceStateText = (value) => value === 'unchanged' ? '与所依据版本一致' : value === 'changed' ? '已变化（回写前需重新生成）' : value === 'not-readable' ? '不可读' : '未核验';
      if (editDraftVersion !== null) editDraftVersion.textContent = shortVersion(current.basedVersion);
      if (editDraftSourceState !== null) editDraftSourceState.textContent = sourceStateText(current.sourceState);
      // 与 002 同一条守卫：只有这份修改稿真的更新过（updatedAt 变化）才回写输入框，2s 轮询不吞正在键入的文本。
      const stale = current.updatedAt === editDraftRevision;
      editDraftRevision = current.updatedAt;
      if (!stale && editDraftProposed !== null && typeof current.proposedText === 'string' && editDraftProposed.value !== current.proposedText) {
        editDraftProposed.value = current.proposedText;
      }
      const writeback = current.writeback !== null && typeof current.writeback === 'object' ? current.writeback : { state: 'none' };
      const showCard = writeback.state === 'prepared' && writebackDismissedFor !== current.draftId;
      currentWritebackConfirmationId = writeback.state === 'prepared' && typeof writeback.confirmationId === 'string' ? writeback.confirmationId : null;
      if (editDraftWritebackCard !== null) editDraftWritebackCard.hidden = !showCard;
      if (showCard) {
        if (writebackTarget !== null) writebackTarget.textContent = String(current.matterRef) + ' · ' + String(current.path) + '（' + String(current.draftId) + '）';
        if (writebackAction !== null) writebackAction.textContent = 'writeback-source-file（回写共享源）';
        if (writebackVersion !== null) writebackVersion.textContent = shortVersion(writeback.targetVersion);
        if (writebackCurrent !== null) writebackCurrent.textContent = typeof writeback.currentVersion === 'string' ? shortVersion(writeback.currentVersion) : '不可读';
        if (writebackImpact !== null) {
          const impact = writeback.impact !== null && typeof writeback.impact === 'object' ? writeback.impact : null;
          writebackImpact.textContent = impact === null
            ? '—'
            : '共 ' + String(impact.addedLines) + ' 行新增、' + String(impact.removedLines) + ' 行删除（提议 ' + String(impact.proposedCharacters) + ' 字符）';
        }
        if (writebackCost !== null) writebackCost.textContent = '暂不可得（本版没有费用预估来源——不冒充数字）';
      }
      if (editDraftResult !== null) {
        editDraftResult.textContent = writeback.state === 'written' ? '已回写：' + String(writeback.receiptRef) + '（来自回写回执，不是本地推断）。'
          : writeback.state === 'not-ready' ? '回写未接线：这一版还没有写入通道，源文件未被修改；这次确认未被消耗，能力就绪后仍可用。'
            : writeback.state === 'unknown' ? '回写结果未知：动作可能已经发生——不要重复回写，先核对再处理。'
              : writeback.state === 'refused' ? editDraftRefusalText(writeback)
                : '';
      }
    }
    // 002 / 004 / 025 / Batch 23（ADR-0261）：草案卡（含责任默认注入账、执行前确认卡）归 React 区域；
    // 本脚本只保留六个具名动作与退出检查用的字段镜像。
    // 027：修改稿面。Diff 是瞬态响应（本地保留）；回写卡从投影的 writeback=prepared 渲染，
    // 因此 2s 轮询不会把它冲掉；「取消确认」只在本地收起这张卡。
    let editDraftLocalNotice = null;
    let currentEditDraftId = null;
    let editDraftRevision = null;
    let lastEditDiff = null;
    let writebackDismissedFor = null;
    let currentWritebackConfirmationId = null;
    // 028：行动项/更正/项目面。更正的原要求候选来自会话投影（已发送的 user 条目）；
    // 它们的身份 = 当时文本+时间，选中的索引在本页保留（轮询重填时按签名守卫）。
    // 029 / 049 / Batch 21（ADR-0261）：事项管理与任务分组两卡归 React 区域；勾选集、所选分组、
    // 归档依据与全部 local-notice 时机都在那边的 React 状态里，本脚本只保留七个具名动作。

    // 031：监控面。面板开合是本地视图状态（不发请求、不取消运行）；日志游标本页保留。
    let runLogCursor = null;
    // 032：方案面。Batch 19 / P3（ADR-0261）：候选选择、步骤确认卡与结果句归 React 区域；
    // 接受回执与步骤执行结果仍从投影读，拒绝代码文案留在下行桥动作里。
    // 退出检查：影响清单由投影事实＋本页真实未保存内容合成；对话框开合只在本页。
    let exitDialogOpen = false;
    let exitLocalNotice = null;
    let feedbackLocalNotice = null;
    // The last state payload, kept for click handlers that need a workspace lookup at send time.
    let lastStatePayload = null;
    // Batch 20 / P3（ADR-0261）：选择器簇。D2 关联卡归 React 后本脚本不再读它的 DOM；React 把当前
    // 选择经上行桥推到这里，全部读取点经这两个助手取值（默认值与 legacy fillSelect 语义一致：
    // 上一值仍在选项里就保留，否则取第一项，无选项为空串）。
    const linkSelection = { matterRef: '', workspaceRef: '' };
    function selectedMatterRef() {
      return typeof linkSelection.matterRef === 'string' ? linkSelection.matterRef : '';
    }
    function selectedWorkspaceRef() {
      return typeof linkSelection.workspaceRef === 'string' ? linkSelection.workspaceRef : '';
    }
    /** The matter and its environment as the React link card's pickers express them (pushed through
     *  the selection up-bridge); null when incomplete. Shared by the send click and the attachment
     *  acts so none of them invents either. */
    function currentSendContext() {
      const matterRef = selectedMatterRef();
      const workspaceRef = selectedWorkspaceRef();
      const state = lastStatePayload;
      const workspaces = state !== null && typeof state === 'object' && state.workspaces !== null && typeof state.workspaces === 'object' && Array.isArray(state.workspaces.entries)
        ? state.workspaces.entries
        : [];
      const workspaceRoot = workspaces.find((entry) => entry !== null && typeof entry === 'object' && entry.workspaceId === workspaceRef);
      if (matterRef === '' || workspaceRef === '' || workspaceRoot === undefined) return null;
      return { matterRef, workspaceRoot: String(workspaceRoot.path ?? '') };
    }
    function draftOf(payload) {
      const draft = payload !== null && typeof payload === 'object' ? payload.draft : null;
      if (draft === null || typeof draft !== 'object') return { state: 'unavailable', drafts: [] };
      return { state: typeof draft.state === 'string' ? draft.state : 'unavailable', drafts: Array.isArray(draft.drafts) ? draft.drafts : [] };
    }

    // 025：单张执行前确认卡的渲染。全部内容来自服务返回的卡（对象/动作/范围/资源/时间/前提与
    // 可得的费用影响预估）；这里不放任何审批、队列或代理字样——确认只兑现这次派发的必要条件。

    // 028：行动项面（Sage 自建对象）+ 更正 + 项目汇总。全部由投影渲染；本地只留挑选与提示。
    function actionItemsOf(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.actionItems : null;
      if (slot === null || typeof slot !== 'object') return { state: 'unavailable', items: [], corrections: [] };
      return {
        state: typeof slot.state === 'string' ? slot.state : 'unavailable',
        items: Array.isArray(slot.items) ? slot.items : [],
        corrections: Array.isArray(slot.corrections) ? slot.corrections : [],
      };
    }

    // Batch 18 / P3（ADR-0261）：行动项/更正/项目卡归 React 区域；原要求候选（会话投影里
    // 已发送的 user 条目）仍在这里抽取后随槽发布。
    function publishActionItemsSlice(payload) {
      const status = actionItemsOf(payload);
      const projectsSlot = payload !== null && typeof payload === 'object' ? payload.projects : null;
      const projectsState = projectsSlot !== null && typeof projectsSlot === 'object' && typeof projectsSlot.state === 'string' ? projectsSlot.state : 'unavailable';
      const projects = projectsState === 'read' && Array.isArray(projectsSlot.projects) ? projectsSlot.projects : [];
      const channel = payload !== null && typeof payload === 'object' && payload.sessionChannel !== null && typeof payload.sessionChannel === 'object'
        ? payload.sessionChannel : null;
      const transcript = channel !== null && Array.isArray(channel.transcript) ? channel.transcript : [];
      const originals = transcript
        .filter((entry) => entry !== null && typeof entry === 'object' && entry.role === 'user' && typeof entry.text === 'string' && entry.text !== '')
        .map((entry) => ({ text: entry.text, at: typeof entry.at === 'string' ? entry.at : null }));
      if (status.state !== 'read') {
        publishRegion('action-items', { kind: 'unavailable' });
        return;
      }
      publishRegion('action-items', { kind: 'read', slot: { items: status.items, corrections: status.corrections, originals, projectsState, projects } });
    }

    // 029：事项管理卡。行来自 022 的列表事实（同一批 items，含归档行——筛选只影响 D0 的显示）。
    function matterAdminRefusalText(code) {
      const notes = {
        'matter-unknown': '这项在服务记录里查不到——无权与不存在同码，不做枚举。',
        'not-archived': '这项不在归档范围里。',
        'batch-size-invalid': '批量一次 1–32 项。',
        'archive-ground-required': '归档需要先选择依据（已完成／已停止，声明）。',
        'rename-title-invalid': '名称需要 1–200 字。',
        'matter-rename-unavailable': '重命名未接线：正式记录由托管侧裁决，这一版还没有裁决通道。',
        'matter-admin-unavailable': '这一版还没有接上事项管理存储。',
      };
      return notes[code] ?? ('操作被拒绝（' + String(code) + '）。');
    }

    // 029 / Batch 21 / P3（ADR-0261）：管理卡归 React 区域（#sage-region-matter-admin）。本脚本只
    // 发布 payload 槽（事项行、归档集、批量逐项、重命名回读、留痕）；拒绝代码文案用上面的表
    // 保留给重命名动作，批量裁决表在 React 侧另有一份显示用途的副本。
    function publishMatterAdminSlice(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.matterAdmin : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      if (state !== 'read') {
        publishRegion('matter-admin', { kind: 'unavailable' });
        return;
      }
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList : null;
      const items = list !== null && Array.isArray(list.items) ? list.items : [];
      const archived = (Array.isArray(slot.entries) ? slot.entries : [])
        .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.matterRef === 'string')
        .map((entry) => entry.matterRef);
      publishRegion('matter-admin', {
        kind: 'read',
        slot: {
          items,
          archived,
          batch: slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null,
          rename: slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null,
          trail: Array.isArray(slot.trail) ? slot.trail : [],
        },
      });
    }

    // 049 / Batch 21 / P3（ADR-0261）：分组卡归 React 区域（#sage-region-matter-groups）。本脚本只
    // 发布 payload 槽（事项行、分组与回读成员数、成员批量逐项、改名回读、留痕）。
    function publishMatterGroupsSlice(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.matterGroups : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      if (state !== 'read') {
        publishRegion('matter-groups', { kind: 'unavailable' });
        return;
      }
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList : null;
      const items = list !== null && Array.isArray(list.items) ? list.items : [];
      const groups = Array.isArray(slot.groups)
        ? slot.groups.filter((group) => group !== null && typeof group === 'object' && typeof group.groupId === 'string')
        : [];
      publishRegion('matter-groups', {
        kind: 'read',
        slot: {
          items,
          groups,
          batch: slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null,
          rename: slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null,
          trail: Array.isArray(slot.trail) ? slot.trail : [],
        },
      });
    }

    // 031 / Batch 17（ADR-0261 P3）：四轴渲染归 React 区域；这里只把 payload 槽发布给区域桥。
    function publishRunMonitorSlice(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.runMonitor : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      publishRegion('run-monitor', state === 'read' ? { kind: 'read', slot } : { kind: 'unavailable' });
    }

    function runLogRefusalText(code) {
      const notes = {
        'bridge-file-not-found': '这份日志不存在（不存在≠空日志，也不代表运行没有日志）。',
        'log-path-outside-workspace': '日志路径必须在已采纳工作区内。',
        'log-cursor-invalid': '游标无效：从「读取运行日志」重新开始。',
        'bridge-file-scope-unavailable': '没有可解析的会话身份：日志读取不伪造身份。',
        'run-log-unavailable': '这一版还没有接上运行日志读取。',
        'run-log-read-failed': '读取运行日志时出错。',
      };
      return notes[code] ?? ('日志读取被拒绝（' + String(code) + '）。');
    }

    // 032：方案卡。行=方案（草稿/已接受回执）；步骤就绪按前提显示，未就绪/未知不给执行入口。
    function plansOf(payload) {
      const slot = payload !== null && typeof payload === 'object' ? payload.plans : null;
      if (slot === null || typeof slot !== 'object') return { state: 'unavailable', plans: [], lastStepRun: null };
      return {
        state: typeof slot.state === 'string' ? slot.state : 'unavailable',
        plans: Array.isArray(slot.plans) ? slot.plans : [],
        lastStepRun: slot.lastStepRun !== null && typeof slot.lastStepRun === 'object' ? slot.lastStepRun : null,
      };
    }

    // Batch 19 / P3（ADR-0261）：方案卡（#sage-region-plans）归 React 区域；行渲染、步骤确认卡
    // 与结果句都在那边，这里只发布 payload 槽（接受回执与步骤执行结果仍从投影读）。
    function publishPlansSlice(payload) {
      const status = plansOf(payload);
      if (status.state !== 'read') {
        publishRegion('plans', { kind: 'unavailable' });
        return;
      }
      publishRegion('plans', { kind: 'read', slot: { plans: status.plans, lastStepRun: status.lastStepRun } });
    }

    // 032：退出检查 / 引导 / 环境。影响清单＝投影事实＋本页真实未保存内容的合成。
    // 002 / Batch 23 / P3（ADR-0261）：退出检查的未保存字段链改读草案卡经上行桥推来的字段镜像
    // （React 拥有输入框；这里不再读它的 DOM）。默认当前草案＝最后一份（与 React 的派生一致）。
    const draftFieldMirror = { goal: '', deliverable: '', responsibility: '', projectRef: '', clarification: '' };
    function unsavedDraftFields() {
      const payload = lastStatePayload;
      const draft = payload !== null && typeof payload === 'object' ? payload.draft : null;
      const drafts = draft !== null && typeof draft === 'object' && Array.isArray(draft.drafts) ? draft.drafts : [];
      const current = drafts[drafts.length - 1];
      if (current === undefined || current === null || typeof current !== 'object') return [];
      const pairs = [
        ['目标', draftFieldMirror.goal, current.fields?.goal],
        ['预期交付', draftFieldMirror.deliverable, current.fields?.deliverable],
        ['责任', draftFieldMirror.responsibility, current.fields?.responsibility],
        ['项目', draftFieldMirror.projectRef, current.fields?.projectRef],
        ['澄清', draftFieldMirror.clarification, current.clarification],
      ];
      return pairs.filter(([, value, saved]) => typeof value === 'string' && value !== (typeof saved === 'string' ? saved : '')).map(([label]) => label);
    }

    function renderExitCards(payload) {
      if (exitCheckOpen === null) return;
      // 环境卡：全部只读事实＋来源（runtime / 事项默认环境 / 工作区折叠）。
      const runtime = payload !== null && typeof payload === 'object' ? payload.runtime : null;
      if (envRuntime !== null) envRuntime.textContent = runtime !== null && typeof runtime === 'object' && typeof runtime.message === 'string' ? runtime.message + '（来源：运行时投影）' : '未核验（来源：运行时投影未读取）';
      if (envMatterRef !== null) {
        const links = payload !== null && typeof payload === 'object' && payload.matterLinks !== null && typeof payload.matterLinks === 'object' ? payload.matterLinks : null;
        const list = links !== null && Array.isArray(links.links) ? links.links : [];
        const current = list.find((entry) => entry !== null && typeof entry === 'object' && entry.isDefault === true);
        envMatterRef.textContent = current === undefined ? '未选定（来源：事项关联事实；未选定不阻断，派发前逐次核验）' : String(current.workspaceRef) + '（来源：事项关联事实）';
      }
      if (envFold !== null) {
        const fold = payload !== null && typeof payload === 'object' && payload.workspaces !== null && typeof payload.workspaces === 'object' ? payload.workspaces : null;
        envFold.textContent = fold === null ? '未读取' : fold.state === 'read' ? '已读取（' + String(Array.isArray(fold.entries) ? fold.entries.length : 0) + ' 个条目；来源：follow 折叠）' : '不可读（' + String(fold.reason ?? 'unreadable') + '；来源：follow 折叠）';
      }
      if (exitDialog === null) return;
      exitDialog.hidden = !exitDialogOpen;
      if (!exitDialogOpen) return;
      const channel = payload !== null && typeof payload === 'object' && payload.sessionChannel !== null && typeof payload.sessionChannel === 'object' ? payload.sessionChannel : null;
      const rows = [];
      if (channel !== null && channel.execution === 'executing') {
        rows.push('进行中任务（会话 ' + String(channel.sessionId ?? '未知') + '）：停止并退出会停止派发新动作并对已知结果收口；已发出的外部操作不能承诺撤回，未确认的操作保留结果待核实。');
      }
      const pendingCount = channel !== null && Array.isArray(channel.pending) ? channel.pending.filter((item) => item !== null && typeof item === 'object' && item.state !== 'consumed').length : 0;
      if (pendingCount > 0) rows.push('待继续输入 ' + String(pendingCount) + ' 条：保留在设备上，续跑需重新打开并点「继续」（不会自动派发）。');
      const unsaved = unsavedDraftFields();
      if (unsaved.length > 0) rows.push('草案有未保存的改动（' + unsaved.join('、') + '）：先保存再退出，否则这些改动会停留在输入框里（不会静默保存）。');
      if (rows.length === 0) rows.push('没有进行中的任务、待继续输入或未保存改动——退出不额外增加确认（D-014）。');
      if (exitImpactRows !== null) {
        exitImpactRows.textContent = '';
        for (const text of rows) {
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.textContent = text;
          exitImpactRows.appendChild(row);
        }
      }
      if (exitNote !== null) {
        exitNote.textContent = exitLocalNotice ?? '关闭窗口不等于退出（后台继续）；本页只做停止与收口——真正的应用退出沿用系统窗口行为。退出成功不等于远端效果已知。';
      }
    }

    // 040：站点起步模板（只读名称与来源；选择只填入本次草案输入——不建站、不写配置、无远端效果）。

    // 002/004/025/040 / Batch 23 / P3（ADR-0261）：草案卡归 React 区域（#sage-region-draft）。这里只
    // 发布 payload 槽（草案、登录投影〔责任默认的依据〕、模板目录）；锁定态单列。
    function publishDraftSlice(payload) {
      const draft = draftOf(payload);
      const siteTemplates = payload !== null && typeof payload === 'object' && payload.siteTemplates !== null && typeof payload.siteTemplates === 'object'
        ? payload.siteTemplates
        : null;
      const templates = siteTemplates === null ? undefined : {
        state: typeof siteTemplates.state === 'string' ? siteTemplates.state : 'unavailable',
        reason: siteTemplates.reason,
        entries: Array.isArray(siteTemplates.entries) ? siteTemplates.entries : [],
      };
      if (draft.state === 'locked') {
        if (templates === undefined) publishRegion('draft', { kind: 'locked' });
        else publishRegion('draft', { kind: 'locked', siteTemplates: templates });
        return;
      }
      if (draft.state !== 'unlocked') {
        if (templates === undefined) publishRegion('draft', { kind: 'unavailable' });
        else publishRegion('draft', { kind: 'unavailable', siteTemplates: templates });
        return;
      }
      const auth = payload !== null && typeof payload === 'object' && payload.service !== null && typeof payload.service === 'object'
        ? payload.service.auth : null;
      publishRegion('draft', {
        kind: 'read',
        slot: {
          drafts: draft.drafts,
          auth: {
            status: auth !== null && typeof auth === 'object' && typeof auth.status === 'string' ? auth.status : 'signed-out',
            displayName: auth !== null && typeof auth === 'object' && typeof auth.displayName === 'string' && auth.displayName !== '' ? auth.displayName : null,
          },
          ...(templates === undefined ? {} : { siteTemplates: templates }),
        },
      });
    }

    // 005：会话面。回执与执行分开；最终文本以历史为准（reconciled 表明这次是从历史读回的）。
    // Batch 24 / P3（ADR-0261）：会话卡（D3）归 React 区域（#sage-region-session）。这里只发布 payload
    // 槽：每个子片是已验证的 /.sage/state 原样切片，文案与动作拒绝句归 React 与下行桥动作各自的家。
    function publishSessionSlice(payload) {
      const record = payload !== null && typeof payload === 'object' ? payload : {};
      const channel = record.sessionChannel !== null && typeof record.sessionChannel === 'object' ? record.sessionChannel : null;
      if (channel === null) {
        publishRegion('session', { kind: 'unavailable' });
        return;
      }
      const sliceOf = (value) => value !== null && typeof value === 'object' ? value : null;
      const plansSource = sliceOf(record.plans);
      const plansRead = plansSource !== null && plansSource.state === 'read';
      const planList = plansRead && Array.isArray(plansSource.plans) ? plansSource.plans : [];
      const latestPlan = planList.length > 0 && planList[planList.length - 1] !== null && typeof planList[planList.length - 1] === 'object' ? planList[planList.length - 1] : null;
      const readySteps = latestPlan !== null && Array.isArray(latestPlan.steps)
        ? latestPlan.steps.filter((step) => step !== null && typeof step === 'object' && step.readiness === 'ready' && typeof step.title === 'string' && step.title !== '').slice(0, 3)
        : [];
      publishRegion('session', {
        kind: 'read',
        slot: {
          channel,
          history: sliceOf(record.sessionHistory),
          anchors: sliceOf(record.sessionAnchors),
          edits: sliceOf(record.sessionEdits),
          clarifications: sliceOf(record.sessionClarifications),
          approvals: sliceOf(record.sessionApprovals),
          planMode: sliceOf(record.sessionPlanMode),
          selections: sliceOf(record.inputSelections),
          modelQueue: sliceOf(record.modelQueue),
          terminal: sliceOf(record.terminal),
          attachments: sliceOf(record.attachments),
          suggestions: plansRead ? readySteps.map((step) => step.title) : null,
        },
      });
    }

    // 048：反馈入口（只提交文本＋结构化诊断；未知只给核对同一提交，不重复提交）。
    function renderFeedback(payload) {
      if (feedbackNote === null && feedbackReceipts === null) return;
      const feedback = payload !== null && typeof payload === 'object' && payload.feedback !== null && typeof payload.feedback === 'object'
        ? payload.feedback
        : null;
      const receipts = feedback !== null && Array.isArray(feedback.receipts) ? feedback.receipts : [];
      if (feedbackNote !== null && feedbackLocalNotice === null) {
        feedbackNote.textContent = '提交只包含你写的文本与 code/stage/correlation；不自动附日志、原始堆栈、机器路径或凭据；结果未知时只给核对同一提交，不重复提交。';
      }
      if (feedbackReceipts !== null) {
        feedbackReceipts.textContent = '';
        for (const receipt of receipts) {
          if (receipt === null || typeof receipt !== 'object' || typeof receipt.requestId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.feedbackReceipt = receipt.requestId;
          const label = document.createElement('span');
          label.className = 'sage-roster-tag';
          label.textContent = receipt.state === 'accepted'
            ? '已接收：' + receipt.requestId + '（只含文本＋结构化诊断）'
            : receipt.state === 'unknown'
              ? '结果未知：' + receipt.requestId + '——只给核对，不重复提交。'
              : '未提交：' + String(receipt.code ?? '未知');
          row.appendChild(label);
          if (receipt.state === 'unknown') {
            const verify = document.createElement('button');
            verify.className = 'sage-row-button';
            verify.type = 'button';
            verify.dataset.feedbackVerify = receipt.requestId;
            verify.textContent = '核对同一提交';
            row.appendChild(verify);
          }
          feedbackReceipts.appendChild(row);
        }
      }
    }

    // 022：事项列表分区。由 main 推导；Batch 22（ADR-0261）后由 React 区域按 partition 字段分组呈现。
    function activeMatterContextOf(payload) {
      const value = isRecord(payload) && isRecord(payload.activeContext) ? payload.activeContext : null;
      if (value === null || !Number.isSafeInteger(value.contextGeneration) || value.contextGeneration < 0) return null;
      if (value.state === 'inactive') {
        return { state: 'inactive', contextGeneration: value.contextGeneration };
      }
      if (value.state !== 'active'
        || !isNonEmptyString(value.matterId)
        || !isNonEmptyString(value.revisionId)
        || !isNonEmptyString(value.workspaceRef)
        || !Number.isSafeInteger(value.frameGeneration)
        || value.frameGeneration < 0) return null;
      return {
        state: 'active',
        contextGeneration: value.contextGeneration,
        matterId: value.matterId,
        revisionId: value.revisionId,
        workspaceRef: value.workspaceRef,
        frameGeneration: value.frameGeneration,
      };
    }

    // 022/023 / Batch 22 / P3（ADR-0261）：事项列表卡归 React 区域（#sage-region-matter-list）。这里只
    // 发布 payload 槽；侧栏计数（区域外事实）按镜像的筛选态从 lastStatePayload 重算。
    let matterListFilterShowAll = false;
    function updateMatterNavCount() {
      if (navMatterCount === null) return;
      const list = lastStatePayload !== null && typeof lastStatePayload === 'object' ? lastStatePayload.matterList : null;
      const known = list !== null && typeof list === 'object' && typeof list.state === 'string';
      if (!known || list.state !== 'read') {
        navMatterCount.hidden = true;
        return;
      }
      const items = Array.isArray(list.items) ? list.items : [];
      const actionCount = items.filter((item) => item !== null && typeof item === 'object'
        && (matterListFilterShowAll || item.lifecycle !== 'archived')
        && item.partition === 'action').length;
      navMatterCount.hidden = actionCount === 0;
      navMatterCount.textContent = String(actionCount);
      navMatterCount.setAttribute('aria-label', '待我处理 ' + String(actionCount) + ' 项');
    }

    function publishMatterListSlice(payload) {
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList
        : null;
      const known = list !== null && typeof list.state === 'string';
      const activeContext = activeMatterContextOf(payload);
      updateMatterNavCount();
      if (!known || list.state !== 'read') {
        if (known) publishRegion('matter-list', { kind: 'unavailable', code: typeof list.code === 'string' ? list.code : 'unknown', activeContext });
        else publishRegion('matter-list', { kind: 'unavailable', activeContext });
        return;
      }
      publishRegion('matter-list', {
        kind: 'read',
        slot: { items: Array.isArray(list.items) ? list.items : [] },
        activeContext,
      });
    }

    // Batch 22：生成代绑定的事项选择动作（代际/失效判定留在这边——唯一读 lastStatePayload 的家）。
    async function selectMatterContext(matterId, expectedContextGeneration) {
      const currentContext = activeMatterContextOf(lastStatePayload);
      if (typeof matterId !== 'string' || matterId === '' || !Number.isSafeInteger(expectedContextGeneration)
        || currentContext === null || currentContext.contextGeneration !== expectedContextGeneration) {
        if (currentContext === null) return { kind: 'cleared' };
        return { kind: 'notice', noticeKind: 'invalid', text: '事项选择未完成：context-select-client-stale。' };
      }
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/context/select', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ matterId, expectedContextGeneration }),
        });
        outcome = await response.json();
      } catch {
        outcome = { state: 'invalid', code: 'context-select-unreachable' };
      }
      if (isRecord(outcome) && outcome.state === 'selected') {
        queueMicrotask(() => { void refresh(); });
        return { kind: 'selected' };
      }
      const code = isRecord(outcome) && isNonEmptyString(outcome.code)
        ? outcome.code
        : 'context-select-invalid-response';
      return {
        kind: 'notice',
        noticeKind: isRecord(outcome) && outcome.state === 'refused' ? 'refused' : 'invalid',
        text: '事项选择未完成：' + code + '。',
      };
    }

    // 024：侧聊列表（派生记录）。打开/发送只动子会话；带回主对话是显式动作。
    // Batch 18 / P3（ADR-0261）：侧聊卡归 React 区域；这里只发布 payload 槽。
    function publishSideChatsSlice(payload) {
      const status = payload !== null && typeof payload === 'object' && payload.sideChats !== null && typeof payload.sideChats === 'object'
        ? payload.sideChats
        : null;
      const known = status !== null && typeof status.state === 'string';
      if (!known) {
        publishRegion('side-chats', { kind: 'unavailable' });
        return;
      }
      if (status.state !== 'read') {
        publishRegion('side-chats', { kind: 'unavailable', code: typeof status.code === 'string' ? status.code : 'unknown' });
        return;
      }
      publishRegion('side-chats', { kind: 'read', slot: status });
    }

    async function postSideChat(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/side-chats', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
      return outcome;
    }

    // Batch 18：侧聊的四个具名动作留在 wire 侧（create 经 currentSendContext 读关联卡选择）；
    // React 只应用视图态与返回的 notice/transcript。
    function createSideChat() {
      return (async () => {
        const context = currentSendContext();
        if (context === null) return '先在上面选好事项与工作区：派生不会自动替你挑一个。';
        const outcome = await postSideChat({ action: 'create', matterRef: context.matterRef });
        const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
        if (state === 'created') {
          return '已派生侧聊 ' + String(outcome.item && outcome.item.sideChatId) + '（子会话，独立上下文；主对话历史未改动）。';
        }
        return '派生没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '（会如实说明是"尚无已完成轮"还是其他原因）。';
      })();
    }

    function readSideChat(sideChatId) {
      return (async () => {
        const outcome = await postSideChat({ action: 'read', sideChatId });
        if (outcome === null || typeof outcome !== 'object' || outcome.state !== 'read') {
          return { kind: 'failed', notice: '回看失败：' + String((outcome && outcome.code) ?? 'unknown') + '。' };
        }
        const channel = outcome.channel !== null && typeof outcome.channel === 'object' ? outcome.channel : null;
        return {
          kind: 'read',
          transcript: channel !== null && Array.isArray(channel.transcript) ? channel.transcript : [],
          execution: channel !== null && typeof channel.execution === 'string' ? channel.execution : 'idle',
        };
      })();
    }

    function sendSideChat(sideChatId, text) {
      return (async () => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (typeof sideChatId !== 'string' || sideChatId === '' || trimmed === '') {
          return { notice: '先打开一条侧聊并写好输入。', transcript: null };
        }
        const outcome = await postSideChat({ action: 'send', sideChatId, text: trimmed });
        const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
        const notice = state === 'accepted' ? '已发送到侧聊（受理≠执行；这条只在子会话里）。'
          : '发送没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '（主对话不受影响）。';
        let transcript = null;
        if (state === 'accepted') {
          const fresh = await postSideChat({ action: 'read', sideChatId });
          if (fresh !== null && typeof fresh === 'object' && fresh.state === 'read') {
            const channel = fresh.channel !== null && typeof fresh.channel === 'object' ? fresh.channel : null;
            transcript = {
              kind: 'read',
              transcript: channel !== null && Array.isArray(channel.transcript) ? channel.transcript : [],
              execution: channel !== null && typeof channel.execution === 'string' ? channel.execution : 'idle',
            };
          }
        }
        return { notice, transcript };
      })();
    }

    function returnSideChat(sideChatId, text) {
      return (async () => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (typeof sideChatId !== 'string' || sideChatId === '' || trimmed === '') {
          return '先打开一条侧聊并写好要带回的文本。';
        }
        const outcome = await postSideChat({ action: 'return', sideChatId, text: trimmed });
        const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
        return state === 'accepted'
          ? '已把这段文本作为主对话输入发出（受理≠执行；侧聊历史未改动）。'
          : '带回没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '。';
      })();
    }

    // Batch 25 / P4（ADR-0261）：搜索卡归 React 区域。卡面没有投影切片（结果是那一次显式
    // POST 的客户端本地产物），这里只发布就绪事实并保留查询动作；行/句子的组装在 React 侧，
    // 拒绝句与守卫句仍由这个动作返回。
    function publishSearchSlice() {
      publishRegion('search', { kind: 'read' });
    }
    async function runSearch(query) {
      const trimmed = typeof query === 'string' ? query.trim() : '';
      if (trimmed === '') return { kind: 'notice', notice: '先写关键词再搜索。' };
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
        });
        outcome = await response.json();
      } catch { /* 查询失败按拒绝句显示 */ }
      const known = outcome !== null && outcome !== undefined && typeof outcome === 'object';
      const state = known && typeof outcome.state === 'string' ? outcome.state : '';
      if (!known) return { kind: 'notice', notice: '搜索没有返回可读结果。' };
      if (state === 'refused') return { kind: 'notice', notice: '搜索被拒绝：' + String(outcome.code ?? 'unknown') + '。' };
      return { kind: 'read', outcome };
    }

    // 015 / 016 / Batch 17（ADR-0261 P3）：产物卡与预览面板归 React 区域；失败分句与
    // 类型标签随组件走（视图文案），这里只发布 payload 槽。
    function publishArtifactsSlice(payload) {
      const artifacts = payload !== null && typeof payload === 'object' ? payload.artifacts : null;
      const known = artifacts !== null && artifacts !== undefined && typeof artifacts === 'object';
      const cards = known && Array.isArray(artifacts.cards) ? artifacts.cards : [];
      const preview = known && artifacts.preview !== null && typeof artifacts.preview === 'object' ? artifacts.preview : { state: 'closed' };
      publishRegion('artifacts', known ? { kind: 'cards', cards, preview } : { kind: 'unavailable' });
    }

    // 033：工具结果（typed）与网页成果目录。结果按声明类型呈现；不支持的类型明确拒绝。
    // Batch 16 / P3 (ADR-0261): the typed tool-result rows and the web-deliverables catalog are
    // owned by the React app; this script only maps the wire to region slices.
    function publishSitesSlice(payload) {
      const artifacts = payload !== null && typeof payload === 'object' ? payload.artifacts : null;
      const known = artifacts !== null && artifacts !== undefined && typeof artifacts === 'object';
      const cards = known && Array.isArray(artifacts.cards) ? artifacts.cards : [];
      publishRegion('sites', known ? { kind: 'cards', cards } : { kind: 'unavailable' });
    }

    function publishToolResultsSlice(payload) {
      const status = payload !== null && typeof payload === 'object' && payload.toolResults !== null && typeof payload.toolResults === 'object' ? payload.toolResults : null;
      if (status === null || status.state !== 'read') {
        publishRegion('tool-results', { kind: 'unavailable' });
        return;
      }
      const results = Array.isArray(status.results) ? status.results : [];
      publishRegion('tool-results', { kind: 'results', results });
    }

    // 011 / Batch 20 / P3（ADR-0261）：关联面归 React 区域（#sage-region-link）。选项标签在 wire 侧
    // 构建后随槽发布（与 legacy fillSelect 的 label 逐字一致），行/留痕渲染与 note 时机在那边。
    function publishLinkSlice(payload) {
      const state = payload !== null && typeof payload === 'object' ? payload.matterLinks : null;
      const known = state !== null && state !== undefined && typeof state === 'object';
      if (!known || state.state !== 'read') {
        publishRegion('link', { kind: 'unavailable' });
        return;
      }
      const links = Array.isArray(state.links) ? state.links : [];
      const trail = Array.isArray(state.trail) ? state.trail : [];
      const matters = draftOf(payload).drafts.filter((entry) => entry !== null && typeof entry === 'object' && entry.status === 'converted' && typeof entry.matterRef === 'string' && entry.matterRef !== '');
      const workspaces = payload !== null && typeof payload === 'object' && payload.workspaces !== null && typeof payload.workspaces === 'object' && Array.isArray(payload.workspaces.entries)
        ? payload.workspaces.entries
        : [];
      publishRegion('link', {
        kind: 'read',
        slot: {
          links,
          trail,
          matters: matters.map((entry) => ({ value: entry.matterRef, label: (typeof entry.fields.goal === 'string' && entry.fields.goal !== '' ? entry.fields.goal : entry.matterRef) + '　' + entry.matterRef })),
          workspaces: workspaces.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.workspaceId === 'string').map((entry) => ({ value: entry.workspaceId, label: (typeof entry.title === 'string' && entry.title !== '' ? entry.title : entry.workspaceId) + '　' + String(entry.path ?? '') })),
        },
      });
    }

    // US-129/130: only verified scope facts; absence keeps its own sentence and never becomes a
    // claim about who may read what.
    // 046：11 张叶子页只读。每张卡标来源与状态；writeEntry 恒 null，卡片因此天然零控件。
    function renderSettingsLeaves(leaves) {
      if (settingsLeafGrid === null) return;
      settingsLeafGrid.textContent = '';
      const rows = Array.isArray(leaves) ? leaves : [];
      for (const leaf of rows) {
        if (leaf === null || typeof leaf !== 'object' || typeof leaf.leafId !== 'string') continue;
        const card = document.createElement('article');
        card.className = 'sage-card sage-governance-card sage-settings-leaf';
        card.dataset.settingsLeaf = leaf.leafId;
        const label = document.createElement('span');
        label.className = 'sage-card-label';
        label.textContent = '来源：' + String(leaf.source);
        card.appendChild(label);
        const title = document.createElement('h2');
        title.textContent = String(leaf.title);
        card.appendChild(title);
        const tag = document.createElement('strong');
        tag.className = 'sage-state-tag ' + (leaf.state === 'read' ? '' : 'is-blocked');
        tag.textContent = leaf.state === 'read' ? '已读' : '未接线／未核验';
        card.appendChild(tag);
        const note = document.createElement('p');
        note.textContent = String(leaf.note);
        card.appendChild(note);
        settingsLeafGrid.appendChild(card);
      }
    }

    // 020/047：设置页与快捷菜单读同一份权威值（八项）；"已保存"只由服务回执确认（savedAt），失败即回退。
    function renderPreferences(preferences) {
      if (prefSelects.theme === null && menuSelects.theme === null) return;
      const known = preferences !== null && preferences !== undefined && typeof preferences === 'object';
      const requested = known && preferences.requested !== null && typeof preferences.requested === 'object' ? preferences.requested : null;
      const requestedTheme = requested !== null && (requested.theme === 'system' || requested.theme === 'light' || requested.theme === 'dark')
        ? requested.theme
        : 'unknown';
      const effectiveTheme = known && (preferences.effectiveTheme === 'light' || preferences.effectiveTheme === 'dark')
        ? preferences.effectiveTheme
        : 'unknown';
      const density = requested !== null && (requested.density === 'comfortable' || requested.density === 'compact')
        ? requested.density
        : 'unknown';
      if (document.documentElement !== null && typeof document.documentElement?.setAttribute === 'function') {
        document.documentElement.setAttribute('data-sage-theme-requested', requestedTheme);
        document.documentElement.setAttribute('data-sage-theme-effective', effectiveTheme);
        document.documentElement.setAttribute('data-sage-density', density);
      }
      const signature = known ? String(preferences.savedAt) + '|' + JSON.stringify(requested) : 'none';
      if (signature !== prefSignature || prefForceSync) {
        prefSignature = signature;
        prefForceSync = false;
        if (requested !== null) {
          for (const key of PREF_KEYS) {
            const value = requested[key];
            if (typeof value !== 'string') continue;
            const pageSelect = prefSelects[key];
            if (pageSelect !== null) pageSelect.value = value;
            const menuSelect = menuSelects[key];
            if (menuSelect !== null) menuSelect.value = value;
          }
        }
      }
      if (prefNote !== null && prefLocalNotice === null) {
        const anyTheme = requested !== null && typeof requested.theme === 'string' ? requested.theme : 'system';
        const effective = effectiveTheme === 'unknown' ? null : effectiveTheme;
        const themeNote = anyTheme === 'system'
          ? (effective === null ? '主题：跟随系统——但主进程还没有系统明暗观察，当前按未核验显示。' : '主题：跟随系统（当前生效：' + effective + '）。')
          : '主题：' + anyTheme + '（立即生效）。';
        const savedNote = known && typeof preferences.savedAt === 'string' && preferences.savedAt !== ''
          ? '已保存到本设备：' + preferences.savedAt
          : '还没有成功保存过；下面的"保存这八项"才会写入本设备（立即生效不等于已持久化）。';
        prefNote.textContent = themeNote + '　' + savedNote + '　主题与密度即时生效；其余六项仅保存，尚未接入产品显示。';
      }
      if (menuNote !== null && menuLocalNotice === null) {
        const savedAt = known && typeof preferences.savedAt === 'string' && preferences.savedAt !== '' ? preferences.savedAt : null;
        menuNote.textContent = (savedAt === null ? '还没有成功保存过；' : '与设置页同值，最近一次保存：' + savedAt + '；') + '这里的每次选择会立即写入本设备。';
      }
    }

    function renderVisibility(visibility) {
      const known = visibility !== null && visibility !== undefined && typeof visibility === 'object';
      const org = known && typeof visibility.organizationRef === 'string' && visibility.organizationRef !== ''
        ? visibility.organizationRef
        : '未核验：实例策略不可读';
      const owner = known && typeof visibility.responsiblePartyRoleRef === 'string' && visibility.responsiblePartyRoleRef !== ''
        ? visibility.responsiblePartyRoleRef
        : '未核验：事项投影缺席';
      visibilityFacts.forEach((node) => { node.textContent = org; });
      if (visibilityOrg !== null) visibilityOrg.textContent = org;
      if (visibilityOwner !== null) visibilityOwner.textContent = owner;
      if (visibilityNote !== null) {
        const matterNote = known && typeof visibility.matterNote === 'string' ? visibility.matterNote : 'projection-absent';
        visibilityNote.textContent = [
          known && visibility.organizationNote === 'policy-unreadable' ? visibilityNoteText['policy-unreadable'] : '',
          matterNote === 'projection-absent' ? '未核验：还没有事项投影，获准主责暂不显示；这不表示没有主责。' : '',
        ].filter((sentence) => sentence !== '').join('　');
      }
    }

    // US-131/132/133: knowledge stays read-only and unwired says unwired; the reference entries
    // show source, version and reachability — and 取用 (the on-demand recheck) stays on the
    // capability-page card, so this page has no action at all.
    function renderKnowledge(readout, references) {
      if (knowledgeState !== null) {
        const state = readout !== null && readout !== undefined && typeof readout === 'object' ? readout.knowledge : undefined;
        knowledgeState.textContent = state !== null && state !== undefined && state.state === 'not-wired' ? '未接线 · 无 provider' : '未核验';
        knowledgeState.className = 'sage-state-tag ' + (state !== null && state !== undefined && state.state === 'not-wired' ? 'is-blocked' : '');
      }
      if (knowledgeNote !== null) {
        knowledgeNote.textContent = '知识库来源：这一版还没有知识库 provider，所以没有任何知识条目可列——不把"没有来源"说成"没有条目"或"已退役"。';
      }
      if (knowledgeRows === null) return;
      knowledgeRows.textContent = '';
      const rows = Array.isArray(references) ? references : [];
      for (const item of rows) {
        if (item === null || typeof item !== 'object' || typeof item.referenceId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.knowledgeReferenceId = item.referenceId;
        const name = document.createElement('strong');
        name.textContent = typeof item.path === 'string' ? item.path : item.referenceId;
        row.appendChild(name);
        const source = document.createElement('span');
        source.className = 'sage-roster-tag';
        source.textContent = '来源 ' + (typeof item.absolutePath === 'string' ? item.absolutePath : '');
        row.appendChild(source);
        const version = document.createElement('span');
        version.className = 'sage-roster-tag';
        version.textContent = '版本 ' + shortVersion(item.version);
        row.appendChild(version);
        const reach = document.createElement('span');
        reach.className = 'sage-roster-tag ' + (item.lastUse === 'stale' ? 'is-blocked' : 'is-ok');
        reach.textContent = item.lastUse === 'stale' ? '可达性：上次取用已阻断'
          : item.lastUse === 'live' ? '可达性：上次取用未变更' : '可达性：尚未按需读取';
        row.appendChild(reach);
        knowledgeRows.appendChild(row);
      }
      if (rows.length > 0) {
        knowledgeNote.textContent = '引用条目 ' + String(rows.length) + ' 条（来源与版本为只读呈现）；取用（按需读取并重核）在「能力」页的本地引用卡上进行。知识库 provider 仍未接线：不把"没有来源"说成"没有条目"或"已退役"。';
      }
    }

    // US-134~136: installation evidence rows and the single boot observation, printed apart.
    function renderPlugins(plugins) {
      if (pluginRows === null) return;
      pluginRows.textContent = '';
      const known = plugins !== null && plugins !== undefined && typeof plugins === 'object';
      const components = known && Array.isArray(plugins.components) ? plugins.components : [];
      for (const component of components) {
        if (component === null || typeof component !== 'object' || typeof component.identity !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.pluginIdentity = component.identity;
        const name = document.createElement('strong');
        name.textContent = component.identity;
        row.appendChild(name);
        const version = document.createElement('span');
        version.className = 'sage-roster-tag';
        version.textContent = '版本 ' + String(component.version);
        row.appendChild(version);
        const source = document.createElement('span');
        source.className = 'sage-roster-tag';
        source.textContent = '来源（安装时证据）' + String(component.artifactDigestShort);
        row.appendChild(source);
        pluginRows.appendChild(row);
      }
      const observation = known && plugins.observation !== null && typeof plugins.observation === 'object' ? plugins.observation : null;
      if (pluginObservation !== null) {
        pluginObservation.textContent = observation !== null && observation.loaderPhase === 'active'
          ? '本次启动的一次观察：loader 已进入 active（boot ' + String(observation.bootIdShort) + '，世代 ' + String(observation.runtimeGeneration) + '）。这只是观察，不是兼容或可用结论。'
          : '本次启动还没有可用的观察（未就绪）。';
      }
      if (pluginNote !== null) {
        if (known && plugins.state === 'read') {
          pluginNote.textContent = '已列 ' + String(components.length) + ' 个安装时组件；已安装不等于已挂载，已观察不等于兼容，连接成功不等于可用。';
        } else {
          const code = known && typeof plugins.code === 'string' ? plugins.code : 'inventory-not-read';
          pluginNote.textContent = pluginUnavailableNotes[code] ?? pluginUnavailableNotes['inventory-not-read'];
        }
      }
    }

    // US-137~139: version identity from the runtime's own snapshot (pin-checked at boot).
    function renderDiagnostics(diagnostics) {
      const known = diagnostics !== null && diagnostics !== undefined && typeof diagnostics === 'object';
      const set = (node, value, fallback) => { if (node !== null) node.textContent = typeof value === 'string' && value !== '' ? value : fallback; };
      set(diagnosticsHarness, known ? diagnostics.harnessVersion : null, '未核验：运行时快照不可用');
      set(diagnosticsProtocol, known ? diagnostics.protocolVersion : null, '未核验：运行时快照不可用');
      set(diagnosticsGeneration, known ? diagnostics.profileGeneration : null, '未核验：运行时快照不可用');
      const manifest = known && typeof diagnostics.manifestSha256Short === 'string' && diagnostics.manifestSha256Short !== '' ? diagnostics.manifestSha256Short : null;
      set(diagnosticsManifest, manifest === null ? null : manifest + '（已按 pin 核对）', '未核验：运行时快照不可用');
      set(diagnosticsDataroot, known ? diagnostics.dataRoot : null, '未核验：数据根不可读');
      if (diagnosticsError !== null) {
        const lastError = known && diagnostics.lastError !== null && typeof diagnostics.lastError === 'object' ? diagnostics.lastError : null;
        diagnosticsError.textContent = lastError === null
          ? '最近一次命令：无（这次运行还没有派发过动作）。'
          : '最近一次命令：' + String(lastError.code) + '（correlation ' + String(lastError.correlation) + '）。诊断导出不在本版。';
      }
    }
    // Batch 26 / P4（ADR-0261）：能力名册与模型配置卡归 React 区域。两卡都是纯只读面（无请求、
    // 无写入口），这里只发布原样切片：结构、层级与状态句的组装在 React 侧完成。
    function publishCapabilitySlice(payload) {
      const capability = payload !== null && payload !== undefined && typeof payload === 'object' ? (payload.capability ?? null) : null;
      const known = capability !== null && typeof capability === 'object';
      publishRegion('capability', known ? { kind: 'read', slot: { slice: capability } } : { kind: 'unavailable' });
    }
    function publishModelConfigSlice(payload) {
      const modelConfig = payload !== null && payload !== undefined && typeof payload === 'object' ? (payload.modelConfig ?? null) : null;
      const known = modelConfig !== null && typeof modelConfig === 'object';
      publishRegion('model-config', known ? { kind: 'read', slot: { slice: modelConfig } } : { kind: 'unavailable' });
    }

    async function fetchWithinDeadline(path, init) {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, requestTimeoutMs);
      try {
        return await fetch(path, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    async function refresh() {
      try {
        const response = await fetchWithinDeadline(statePath, { cache: 'no-store' });
        if (!response.ok) throw new Error('state request failed');
        const statePayload = await response.json();
        if (isProjectionReadUnavailableRouteDenial(statePayload)) {
          lastStatePayload = null;
          publishMatterUnavailable('unavailable');
          renderAuth(undefined);
          render(fallback());
          renderCommand(null);
          publishCapabilitySlice(null);
          publishModelConfigSlice(null);
          // Batch 25: the search card is payload-independent; its readiness fact publishes on every path.
          publishSearchSlice();
          return;
        }
        const payload = parseServiceStateEnvelope(statePayload);
        if (payload === null) {
          lastStatePayload = null;
          publishMatterUnavailable('invalid');
          renderAuth(undefined);
          render(fallback());
          renderCommand(null);
          publishCapabilitySlice(null);
          publishModelConfigSlice(null);
          publishSearchSlice();
          return;
        }
        lastStatePayload = payload;
        publishMatterProjection(payload.matter);
        renderAuth(payload.service.auth);
        render(payload.runtime);
        renderCommand(payload.service.command ?? null);
        publishCapabilitySlice(payload);
        publishModelConfigSlice(payload);
        renderWorkspaceAdoption(payload.workspaceAdoption ?? null);
        renderWorkspaceList(payload.workspaces);
        renderWorkspaceMutation(payload.workspaceMutation ?? null);
        fillFileWorkspaces(payload.workspaces);
        renderFileCandidates(payload.fileCandidates ?? null);
        renderFileReferences(Array.isArray(payload.fileReferences) ? payload.fileReferences : []);
        renderFileUse(payload.fileReferenceUse ?? null);
        renderEditDrafts(payload);
        publishActionItemsSlice(payload);
        publishMatterAdminSlice(payload);
        publishMatterGroupsSlice(payload);
        publishRunMonitorSlice(payload);
        publishPlansSlice(payload);
        publishMatterListSlice(payload);
        renderExitCards(payload);
        publishDraftSlice(payload);
        publishSessionSlice(payload);
        publishSearchSlice();
        renderFeedback(payload);
        publishArtifactsSlice(payload);
        publishToolResultsSlice(payload);
        publishSitesSlice(payload);
        publishSideChatsSlice(payload);
        publishLinkSlice(payload);
        renderPreferences(payload.preferences ?? null);
        renderSettingsLeaves(Array.isArray(payload.settingsLeaves) ? payload.settingsLeaves : []);
        const readout = isRecord(payload.readout) ? payload.readout : null;
        renderVisibility(readout !== null && typeof readout === 'object' ? readout.visibility : null);
        renderKnowledge(readout, Array.isArray(payload.fileReferences) ? payload.fileReferences : []);
        renderPlugins(readout !== null && typeof readout === 'object' ? readout.plugins : null);
        renderDiagnostics(readout !== null && typeof readout === 'object' ? readout.diagnostics : null);
      } catch {
        lastStatePayload = null;
        publishMatterUnavailable('unavailable');
        render(fallback());
        publishCapabilitySlice(null);
        publishModelConfigSlice(null);
        publishSearchSlice();
      }
    }

    navItems.forEach((item, index) => {
      item.addEventListener('click', () => { setView(item.dataset.view); });
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        const next = navItems[(index + offset + navItems.length) % navItems.length];
        setView(next.dataset.view);
        next.focus();
      });
    });
    document.querySelectorAll('[data-view-target]').forEach((item) => {
      item.addEventListener('click', () => { setView(item.dataset.viewTarget); });
    });

    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try {
        await fetchWithinDeadline(actionsPath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'retry' }),
        });
      } catch { /* refresh 兜底 */ }
      queueMicrotask(() => { void refresh(); });
    });

    if (reconcile) {
      // 核对 = re-read the same operation's state; it never re-sends the action (US-119).
      reconcile.addEventListener('click', async () => {
        reconcile.disabled = true;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (login) {
      login.addEventListener('click', async () => {
        login.disabled = true;
        try { await fetchWithinDeadline(loginPath, { cache: 'no-store' }); } catch { /* state 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    }
    // Every 退出登录 entry posts the same logout request and then re-reads the projection; none of
    // them claims the session is destroyed — that is what the next refresh is for (US-206).
    logoutEntries.forEach((entry) => {
      entry.addEventListener('click', async () => {
        entry.disabled = true;
        try {
          await fetchWithinDeadline(logoutPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        } catch { /* refresh 兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    });

    if (adoptButton) {
      adoptButton.addEventListener('click', async () => {
        adoptButton.disabled = true;
        try {
          await fetchWithinDeadline('/.sage/workspace/adopt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        } catch { /* state 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); adoptButton.disabled = false; });
      });
    }

    // 行内变更只有一个入口：删除只发"移除登记"，从不表达任何目录内容被删除；上移永远发它上面
    // 一行的 id 作为参照，第一行没有参照时该控件不可用。
    async function postWorkspaceMutation(body) {
      try {
        await fetchWithinDeadline('/.sage/workspace/mutate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    if (workspaceRows) {
      workspaceRows.addEventListener('click', (event) => {
        // Structural test instead of an Element instanceof check: the handler only needs the three
        // DOM members it actually calls, and a non-element target simply finds no control.
        const button = event.target?.closest?.('[data-workspace-action]') ?? null;
        if (button === null || button.disabled) return;
        const row = button.closest('[data-workspace-id]');
        if (row === null) return;
        const workspaceId = row.dataset.workspaceId;
        if (typeof workspaceId !== 'string' || workspaceId === '') return;
        const action = button.dataset.workspaceAction;
        let body;
        if (action === 'rename') {
          const input = row.querySelector('[data-workspace-rename-input]');
          body = { kind: 'rename', workspaceId, title: input === null ? '' : input.value };
        } else if (action === 'up') {
          const above = row.previousElementSibling;
          body = { kind: 'reorder', workspaceId, beforeWorkspaceId: above === null ? null : above.dataset.workspaceId };
        } else if (action === 'delete') {
          body = { kind: 'delete', workspaceId };
        } else {
          return;
        }
        button.disabled = true;
        void postWorkspaceMutation(body);
      });
    }

    // 013：候选只从工作区内列出；引用只从候选建立（不手输路径）；取用前由 main 重核版本。
    async function postFileRequest(path, body) {
      try {
        await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    if (fileList && fileWorkspace && filePath) {
      fileList.addEventListener('click', () => {
        fileList.disabled = true;
        void postFileRequest('/.sage/workspace/files/candidates', {
          workspaceRoot: fileWorkspace.value,
          path: filePath.value.trim(),
        }).finally(() => { fileList.disabled = false; });
      });
    }

    if (fileCandidates) {
      fileCandidates.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-file-action="reference"]') ?? null;
        if (button === null || button.disabled || fileWorkspace === null) return;
        const row = button.closest('[data-candidate-path]');
        if (row === null) return;
        const path = row.dataset.candidatePath;
        if (typeof path !== 'string' || path === '') return;
        button.disabled = true;
        void postFileRequest('/.sage/workspace/files/reference', { workspaceRoot: fileWorkspace.value, path });
      });
    }

    if (fileReferences) {
      fileReferences.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-file-action="use"]') ?? null;
        if (button === null || button.disabled) return;
        const row = button.closest('[data-reference-id]');
        if (row === null) return;
        const referenceId = row.dataset.referenceId;
        if (typeof referenceId !== 'string' || referenceId === '') return;
        button.disabled = true;
        void postFileRequest('/.sage/workspace/files/use', { referenceId });
      });
      // 027：从引用生成修改稿——需要一个已选事项（修改稿属于事项）。
      fileReferences.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-file-action="draft"]') ?? null;
        if (button === null || button.disabled) return;
        const row = button.closest('[data-reference-id]');
        if (row === null) return;
        const referenceId = row.dataset.referenceId;
        if (typeof referenceId !== 'string' || referenceId === '') return;
        const matterRef = selectedMatterRef();
        if (matterRef === '') {
          editDraftLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项：修改稿属于某个事项。';
          if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
          return;
        }
        editDraftLocalNotice = null;
        button.disabled = true;
        void postEditDraft('/.sage/edit-drafts/create', { referenceId }).finally(() => { button.disabled = false; });
      });
    }

    // 027 的动作：生成/保存/Diff/准备回写/确认回写/取消确认。没有任何一处直接写文件。
    async function postEditDraft(path, body) {
      try {
        await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    if (editDraftRows !== null) {
      editDraftRows.addEventListener('click', (event) => {
        const row = event.target?.closest?.('[data-edit-draft-id]') ?? null;
        if (row === null) return;
        const draftId = row.dataset.editDraftId;
        if (typeof draftId !== 'string' || draftId === '' || draftId === currentEditDraftId) return;
        currentEditDraftId = draftId;
        lastEditDiff = null;
        writebackDismissedFor = null;
        renderEditDiff();
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (editDraftSave !== null) {
      editDraftSave.addEventListener('click', () => {
        if (currentEditDraftId === null || editDraftProposed === null) return;
        editDraftSave.disabled = true;
        void postEditDraft('/.sage/edit-drafts/update', {
          draftId: currentEditDraftId,
          proposedText: typeof editDraftProposed.value === 'string' ? editDraftProposed.value : '',
        }).finally(() => { if (editDraftSave !== null) editDraftSave.disabled = false; });
      });
    }

    if (editDraftDiffButton !== null) {
      editDraftDiffButton.addEventListener('click', async () => {
        if (currentEditDraftId === null) return;
        editDraftDiffButton.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/edit-drafts/diff', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ draftId: currentEditDraftId }),
          });
          const payload = await response.json();
          if (payload !== null && typeof payload === 'object' && payload.state === 'read' && payload.diff !== null && typeof payload.diff === 'object') {
            lastEditDiff = payload.diff;
            renderEditDiff();
          } else {
            lastEditDiff = null;
            renderEditDiff();
            if (editDraftDiffNote !== null) editDraftDiffNote.textContent = editDraftRefusalText(payload);
          }
        } catch {
          if (editDraftDiffNote !== null) editDraftDiffNote.textContent = '查看 Diff 失败：这次请求没有完成。';
        }
        editDraftDiffButton.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (editDraftPrepare !== null) {
      editDraftPrepare.addEventListener('click', async () => {
        if (currentEditDraftId === null) return;
        editDraftPrepare.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/edit-drafts/prepare-writeback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ draftId: currentEditDraftId }),
          });
          const payload = await response.json();
          if (payload !== null && typeof payload === 'object' && payload.state === 'prepared') {
            editDraftLocalNotice = null;
            writebackDismissedFor = null;
          } else {
            editDraftLocalNotice = editDraftRefusalText(payload);
            if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
          }
        } catch {
          editDraftLocalNotice = '准备回写失败：这次请求没有完成。';
          if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
        }
        editDraftPrepare.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (editDraftWritebackNow !== null) {
      editDraftWritebackNow.addEventListener('click', async () => {
        if (currentEditDraftId === null || currentWritebackConfirmationId === null) return;
        editDraftWritebackNow.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/edit-drafts/writeback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ draftId: currentEditDraftId, confirmationId: currentWritebackConfirmationId }),
          });
          const payload = await response.json();
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          // 结果行由投影渲染；这里只把需要立刻看懂的拒绝码落成提示（同样走 local-notice 守卫）。
          if (code === 'confirmation-stale' || code === 'confirmation-consumed' || code === 'edit-draft-writeback-failed') {
            editDraftLocalNotice = editDraftRefusalText(payload);
            if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
          }
        } catch {
          editDraftLocalNotice = '回写请求失败：这次请求没有完成。';
          if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
        }
        editDraftWritebackNow.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (editDraftWritebackCancel !== null) {
      editDraftWritebackCancel.addEventListener('click', () => {
        // 取消只在本地收起这张卡：确认记录未消耗，稍后重新准备会另铸一张。
        writebackDismissedFor = currentEditDraftId;
        queueMicrotask(() => { void refresh(); });
      });
    }

    // 028 的动作：行动项、更正与项目归属。每个动作只走自己的路由，不旁路其他存储。
    async function postActionItem(path, body) {
      try {
        await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    // Batch 18：行动项/更正/项目的具名动作留在 wire 侧（事项/工作区上下文经选择器簇上行桥读取）；
    // React 把它的视图态（所选原要求、所选项目）作为参数传入。
    function createActionItem(title, note) {
      return (async () => {
        const matterRef = selectedMatterRef();
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (matterRef === '') return '先在「事项 ↔ 工作区关联」里选好事项：行动项属于某个事项。';
        if (trimmedTitle === '') return '先写一个行动项标题（≤200 字）。';
        await postActionItem('/.sage/action-items', { action: 'create', matterRef, title: trimmedTitle, ...(note === null || note === undefined ? {} : { note }) });
        return null;
      })();
    }

    function actionItemRowAction(actionId, action) {
      return (async () => {
        if (typeof actionId !== 'string' || actionId === '') return;
        await postActionItem('/.sage/action-items', { action, actionId });
      })();
    }

    function submitCorrection(original, text) {
      return (async () => {
        const context = currentSendContext();
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (context === null) return '先选好事项与工作区：更正经主对话的同一发送路径发出。';
        if (original === null || original === undefined) return '先选一条原要求（已发送的消息）。';
        if (trimmed === '') return '更正副本还是空的——先写清要改什么。';
        await postActionItem('/.sage/corrections', {
          matterRef: context.matterRef,
          workspaceRoot: context.workspaceRoot,
          originalText: original.text,
          ...(original.at === null || original.at === undefined ? {} : { originalAt: original.at }),
          text: trimmed,
        });
        return null;
      })();
    }

    function createProject(name) {
      return (async () => {
        const trimmed = typeof name === 'string' ? name.trim() : '';
        if (trimmed === '') return '先写一个项目名（≤100 字）。';
        await postActionItem('/.sage/projects', { action: 'create', name: trimmed });
        return null;
      })();
    }

    function assignProject(projectRef) {
      return (async () => {
        const matterRef = selectedMatterRef();
        if (matterRef === '') return '先在「事项 ↔ 工作区关联」里选好事项。';
        if (typeof projectRef !== 'string' || projectRef === '' || projectRef === 'none') return '先新建一个项目再归属。';
        await postActionItem('/.sage/projects', { action: 'assign', matterRef, projectRef });
        return null;
      })();
    }

    function unassignProject() {
      return (async () => {
        const matterRef = selectedMatterRef();
        if (matterRef === '') return '先在「事项 ↔ 工作区关联」里选好事项。';
        await postActionItem('/.sage/projects', { action: 'unassign', matterRef });
        return null;
      })();
    }

    // Batch 21 / P3（ADR-0261）：事项管理与任务分组的七个具名动作经下行桥暴露在这里（勾选集、
    // 所选分组、归档依据由 React 以参数传入；先决句与精确请求体留在这边）。
    async function archiveMatters(targets, ground) {
      if (!Array.isArray(targets) || targets.length === 0) return '先勾选要归档的事项（可多选：批量逐项返回结果）。';
      const targetsList = targets.filter((ref) => typeof ref === 'string' && ref !== '');
      if (targetsList.length === 0) return '先勾选要归档的事项（可多选：批量逐项返回结果）。';
      const groundValue = ground === 'stopped' ? 'stopped' : 'completed';
      await postActionItem('/.sage/matter-admin', { action: 'batch', operation: 'archive', targets: targetsList, ground: groundValue });
      return null;
    }

    async function restoreMatters(targets) {
      const targetsList = Array.isArray(targets) ? targets.filter((ref) => typeof ref === 'string' && ref !== '') : [];
      if (targetsList.length === 0) return '先勾选要恢复的事项。';
      await postActionItem('/.sage/matter-admin', { action: 'batch', operation: 'restore', targets: targetsList });
      return null;
    }

    async function renameMatter(targets, title) {
      const targetsList = Array.isArray(targets) ? targets.filter((ref) => typeof ref === 'string' && ref !== '') : [];
      if (targetsList.length !== 1) return '重命名一次针对一个事项：请只勾选一项。';
      const nextTitle = typeof title === 'string' ? title.trim() : '';
      if (nextTitle === '') return '先写要改成的名称（1–200 字）。';
      let notice = null;
      try {
        const response = await fetchWithinDeadline('/.sage/matter-admin', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'rename', matterRef: targetsList[0], title: nextTitle }),
        });
        const payload = await response.json();
        const code = payload !== null && typeof payload === 'object' && payload.state === 'refused' && typeof payload.code === 'string' ? payload.code : null;
        if (code !== null) notice = matterAdminRefusalText(code);
      } catch {
        notice = '重命名请求失败：这次请求没有完成。';
      }
      queueMicrotask(() => { void refresh(); });
      return notice;
    }

    async function createGroup(name, targets) {
      const groupName = typeof name === 'string' ? name.trim() : '';
      if (groupName === '') return '先给分组起一个名字（建立是具名命令，不会隐式产生）。';
      const targetsList = Array.isArray(targets) ? targets.filter((itemId) => typeof itemId === 'string' && itemId !== '') : [];
      await postActionItem('/.sage/matter-groups', targetsList.length === 0 ? { action: 'create', name: groupName } : { action: 'create', name: groupName, targets: targetsList });
      return null;
    }

    async function renameGroup(groupId, name) {
      if (typeof groupId !== 'string' || groupId === '') return '先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。';
      const groupName = typeof name === 'string' ? name.trim() : '';
      if (groupName === '') return '先写好新的分组名称。';
      await postActionItem('/.sage/matter-groups', { action: 'rename', groupId, name: groupName });
      return null;
    }

    async function removeGroup(groupId) {
      if (typeof groupId !== 'string' || groupId === '') return '先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。';
      await postActionItem('/.sage/matter-groups', { action: 'remove', groupId });
      return null;
    }

    async function assignGroupMembers(groupId, operation, targets) {
      if (typeof groupId !== 'string' || groupId === '') return '先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。';
      const targetsList = Array.isArray(targets) ? targets.filter((itemId) => typeof itemId === 'string' && itemId !== '') : [];
      if (targetsList.length === 0) {
        return operation === 'remove' ? '先勾选要移出的事项。' : '先勾选要入组的事项（可多选：批量逐项返回结果）。';
      }
      await postActionItem('/.sage/matter-groups', { action: 'assign', groupId, operation: operation === 'remove' ? 'remove' : 'add', targets: targetsList });
      return null;
    }

    // 032 的动作：方案与步骤执行、退出检查与引导。接受方案与引导均零派发。
    async function postPlan(body) {
      try {
        await fetchWithinDeadline('/.sage/plans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    // Batch 19 / P3（ADR-0261）：方案卡归 React 区域。四个动作经下行桥暴露在这里：
    // 创建/接受读关联卡选择（本面本就属于它）；准备/执行保留精确请求体、拒绝码与文案。
    async function createPlan(title, stepsText) {
      const matterRef = selectedMatterRef();
      const planTitle = typeof title === 'string' ? title.trim() : '';
      const steps = typeof stepsText === 'string' ? stepsText.split('\\n').map((line) => line.trim()).filter((line) => line !== '') : [];
      if (matterRef === '') return '先在「事项 ↔ 工作区关联」里选好事项：方案属于某个事项。';
      if (planTitle === '' || steps.length === 0) return '方案要有一个标题和至少一条步骤（每行一条）。';
      await postPlan({ action: 'create', matterRef, title: planTitle, steps });
      return null;
    }

    function acceptPlan(planId) {
      if (typeof planId !== 'string' || planId === '') return Promise.resolve();
      return postPlan({ action: 'accept', planId });
    }

    async function prepareStep(planId, stepNo) {
      if (typeof planId !== 'string' || planId === '' || !Number.isSafeInteger(stepNo) || stepNo < 1) return { kind: 'quiet' };
      let result = { kind: 'quiet' };
      try {
        const response = await fetchWithinDeadline('/.sage/plans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'prepare-step', planId, stepNo }),
        });
        const payload = await response.json();
        if (payload !== null && typeof payload === 'object' && payload.state === 'prepared' && payload.card !== null && typeof payload.card === 'object') {
          result = { kind: 'prepared', card: payload.card };
        } else {
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          const notice = code === 'step-premise-unknown' ? '这一步的前提未知：按阻断处理，不派发（不铸卡）。'
            : code === 'step-not-ready' ? '这一步未就绪：按阻断处理，不派发（不铸卡）。'
              : '准备执行确认卡被拒绝（' + String(code ?? '响应无法识别') + '）。';
          result = { kind: 'notice', notice };
        }
      } catch {
        result = { kind: 'notice', notice: '准备执行确认卡失败：这次请求没有完成。' };
      }
      queueMicrotask(() => { void refresh(); });
      return result;
    }

    async function executeStep(planId, stepNo, confirmationId) {
      if (typeof planId !== 'string' || planId === '' || !Number.isSafeInteger(stepNo) || stepNo < 1 || typeof confirmationId !== 'string' || confirmationId === '') return { kind: 'quiet' };
      let result = { kind: 'quiet' };
      try {
        const response = await fetchWithinDeadline('/.sage/plans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'execute-step', planId, stepNo, confirmationId }),
        });
        const payload = await response.json();
        const state = payload !== null && typeof payload === 'object' && typeof payload.state === 'string' ? payload.state : null;
        const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
        const block = payload !== null && typeof payload === 'object' && payload.plans !== null && typeof payload.plans === 'object' ? payload.plans : null;
        if (block !== null && block.state === 'read') {
          // 结果面以投影为唯一读数：响应随行携带同一份投影，先按其渲染；特定拒绝句由投影渲染。
          result = { kind: 'run', run: block.lastStepRun !== null && typeof block.lastStepRun === 'object' ? block.lastStepRun : null };
        } else if (state === 'settled' || state === null) {
          result = { kind: 'settled' };
        } else {
          const notice = code === 'plans-unavailable' ? '这一版还没有接上方案存储：没有派发，也不消耗确认。'
            : '步骤执行未完成（' + String(code ?? '响应无法识别') + '）。';
          result = { kind: 'notice', notice };
        }
      } catch {
        result = { kind: 'notice', notice: '步骤执行请求失败：这次请求没有完成。' };
      }
      queueMicrotask(() => { void refresh(); });
      return result;
    }

    if (exitCheckOpen !== null) {
      exitCheckOpen.addEventListener('click', () => {
        exitDialogOpen = true;
        exitLocalNotice = null;
        queueMicrotask(() => { void refresh(); });
      });
    }
    if (exitCancel !== null) {
      exitCancel.addEventListener('click', () => {
        // 取消＝保持后台运行：只关对话框，不发任何请求、不停止任务（D-013/014）。
        exitDialogOpen = false;
        exitLocalNotice = null;
        queueMicrotask(() => { void refresh(); });
      });
    }
    if (exitStop !== null) {
      exitStop.addEventListener('click', async () => {
        const matterRef = selectedMatterRef();
        exitStop.disabled = true;
        if (matterRef !== '') {
          try {
            await fetchWithinDeadline('/.sage/session/stop', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ matterRef }),
            });
          } catch { /* state 轮询兜底 */ }
        }
        exitLocalNotice = '停止请求已发出：停止派发新动作并对已知结果收口；已发出的外部操作不能承诺撤回，未确认操作保留待核实——退出成功不等于远端效果已知。';
        exitStop.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }
    if (guideToggle !== null) {
      guideToggle.addEventListener('click', () => {
        // 引导只读：展开/收起是本地状态，零请求、零配置写入。
        if (guideRows === null) return;
        guideRows.hidden = !guideRows.hidden;
        guideToggle.textContent = guideRows.hidden ? '展开要点' : '收起要点';
      });
    }

    // 031 的动作：收起/展开面板是本地状态（零请求）；日志读取走有界游标。
    // Batch 17：运行日志游标走查留在 wire 侧；React 只应用 append/替换并渲染返回行。
    function runLogOpen(path) {
      return (async () => {
        const trimmed = typeof path === 'string' ? path.trim() : '';
        const context = currentSendContext();
        if (context === null) {
          return { lines: [], append: false, notice: '先在「事项 ↔ 工作区关联」里选好事项与工作区：日志在工作区内读取。' };
        }
        if (trimmed === '') {
          return { lines: [], append: false, notice: '先写日志文件在工作区内的相对路径。' };
        }
        try {
          const response = await fetchWithinDeadline('/.sage/run-log', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceRoot: context.workspaceRoot, path: trimmed }),
          });
          const payload = await response.json();
          if (payload !== null && typeof payload === 'object' && payload.state === 'read') {
            runLogCursor = {
              workspaceRoot: context.workspaceRoot,
              path,
              version: typeof payload.version === 'string' ? payload.version : '',
              bytes: null,
              nextLine: typeof payload.nextLine === 'number' ? payload.nextLine : 1,
            };
            return {
              lines: Array.isArray(payload.lines) ? payload.lines : [],
              append: false,
              notice: '已读到第 ' + String(Math.max(0, runLogCursor.nextLine - 1)) + ' 行'
                + (payload.eof === true ? '（已到文件末尾；继续读取会续上后续追加）' : '（有界分页：可继续读取）')
                + (payload.truncatedLines > 0 ? '；' + String(payload.truncatedLines) + ' 行超长已截断（有标记）' : ''),
            };
          }
          runLogCursor = null;
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          return { lines: [], append: false, notice: runLogRefusalText(code) };
        } catch {
          return { lines: [], append: false, notice: '读取运行日志失败：这次请求没有完成。' };
        } finally {
          queueMicrotask(() => { void refresh(); });
        }
      })();
    }

    function runLogContinue() {
      return (async () => {
        if (runLogCursor === null) {
          return { lines: [], append: false, notice: '还没有游标：先「读取运行日志」。' };
        }
        try {
          const response = await fetchWithinDeadline('/.sage/run-log', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspaceRoot: runLogCursor.workspaceRoot,
              path: runLogCursor.path,
              fromLine: runLogCursor.nextLine,
              ...(runLogCursor.version === '' ? {} : { expectVersion: runLogCursor.version }),
              ...(runLogCursor.bytes === null ? {} : { expectBytes: runLogCursor.bytes }),
            }),
          });
          const payload = await response.json();
          if (payload !== null && typeof payload === 'object' && payload.state === 'read') {
            if (payload.rotation === 'file-rotated') {
              // 轮转/截断：游标失效，从头再来——不猜行、不重复也不漏标。
              runLogCursor = null;
              return { lines: [], append: true, notice: '日志已轮转或截断：原游标失效，已重置——点「读取运行日志」从头再读（不重复、不漏标）。' };
            }
            runLogCursor = {
              workspaceRoot: runLogCursor.workspaceRoot,
              path: runLogCursor.path,
              version: typeof payload.version === 'string' ? payload.version : runLogCursor.version,
              bytes: null,
              nextLine: typeof payload.nextLine === 'number' ? payload.nextLine : runLogCursor.nextLine,
            };
            return {
              lines: Array.isArray(payload.lines) ? payload.lines : [],
              append: true,
              notice: '已读到第 ' + String(Math.max(0, runLogCursor.nextLine - 1)) + ' 行'
                + (payload.eof === true ? '（已到文件末尾）' : '')
                + (payload.truncatedLines > 0 ? '；' + String(payload.truncatedLines) + ' 行超长已截断（有标记）' : ''),
            };
          }
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          return { lines: [], append: false, notice: runLogRefusalText(code) };
        } catch {
          return { lines: [], append: false, notice: '续读失败：这次请求没有完成。' };
        } finally {
          queueMicrotask(() => { void refresh(); });
        }
      })();
    }


    // 002 的三个动作：发送=（新）草案、保存=用户自己写的字段与勾选、确认=建项（经同一流水线）。
    // Batch 23 / P3（ADR-0261）：草案卡的六个动作经下行桥暴露在这里（字段值/勾选集/凭据由
    // React 以参数传入；先决句、精确请求体、拒绝码与刷新留在这边）。
    async function postDraft(path, body) {
      try {
        await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    async function sendDraft(rawInput) {
      const text = typeof rawInput === 'string' ? rawInput.trim() : '';
      if (text === '') return '先写一句需求再发送。';
      await postDraft('/.sage/draft/create', { rawInput: text });
      return null;
    }

    async function saveDraft(draftId, fields, clarification, selectedEntryIds) {
      if (typeof draftId !== 'string' || draftId === '') return;
      const source = fields !== null && typeof fields === 'object' ? fields : {};
      await postDraft('/.sage/draft/update', {
        draftId,
        fields: {
          goal: typeof source.goal === 'string' ? source.goal : '',
          deliverable: typeof source.deliverable === 'string' ? source.deliverable : '',
          responsibility: typeof source.responsibility === 'string' ? source.responsibility : '',
          projectRef: typeof source.projectRef === 'string' ? source.projectRef : '',
        },
        clarification: typeof clarification === 'string' ? clarification : '',
        selectedEntryIds: Array.isArray(selectedEntryIds) ? selectedEntryIds.filter((id) => typeof id === 'string' && id !== '') : [],
      });
    }

    async function reconcileDraft(draftId) {
      if (typeof draftId !== 'string' || draftId === '') return;
      await postDraft('/.sage/draft/reconcile', { draftId });
    }

    async function cancelDraftAttempt(draftId) {
      if (typeof draftId !== 'string' || draftId === '') return;
      await postDraft('/.sage/draft/cancel', { draftId });
    }

    async function prepareDraftConfirm(draftId) {
      const unavailable = { kind: 'notice', notice: '执行前确认卡暂不可得：这一版还没有确认来源，建项暂不可派发。' };
      if (typeof draftId !== 'string' || draftId === '') return unavailable;
      let card = null;
      try {
        const response = await fetchWithinDeadline('/.sage/draft/prepare-confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draftId }),
        });
        const payload = await response.json();
        if (payload !== null && typeof payload === 'object' && payload.state === 'prepared'
          && payload.card !== null && typeof payload.card === 'object') {
          card = payload.card;
        }
      } catch { /* 本地提示兜底 */ }
      queueMicrotask(() => { void refresh(); });
      if (card === null) return unavailable;
      return { kind: 'prepared', card };
    }

    async function executeDraftConvert(draftId, confirmationId) {
      if (typeof draftId !== 'string' || draftId === '' || typeof confirmationId !== 'string' || confirmationId === '') return { kind: 'ok' };
      let notice = null;
      try {
        const response = await fetchWithinDeadline('/.sage/draft/convert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draftId, confirmationId }),
        });
        const payload = await response.json();
        const code = payload !== null && typeof payload === 'object' && payload.state === 'denied' && typeof payload.code === 'string'
          ? payload.code : null;
        notice = code === null ? null : draftConfirmationNotice(code);
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
      return notice === null ? { kind: 'ok' } : { kind: 'notice', notice };
    }

    // 025 的拒码文案表：转换的拒绝句由下行桥动作（executeDraftConvert）在这里生成。
    function draftConfirmationNotice(code) {
      if (code === 'confirmation-stale') return '确认已失效：动作、前提或版本已变化——请重新确认（旧卡不能沿用）。';
      if (code === 'confirmation-consumed') return '这次确认已经用过了：一次确认只兑现一次派发，请重新确认。';
      if (code === 'confirmation-required') return '这次派发缺少有效的执行前确认：请先展开确认卡再确认执行。';
      return null;
    }

    async function postSession(body) {
      try {
        await fetchWithinDeadline('/.sage/session/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    async function postLink(body) {
      try {
        await fetchWithinDeadline('/.sage/matter/link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    // Batch 20 / P3（ADR-0261）：关联卡归 React 区域；三个具名动作经下行桥暴露在这里（选择由
    // React 以参数传入；先决句与精确请求体留在这边）。
    async function addLink(matterRef, workspaceRef) {
      if (typeof matterRef !== 'string' || matterRef === '' || typeof workspaceRef !== 'string' || workspaceRef === '') {
        return '先选好事项与工作区：关联不会自动替你挑一个。';
      }
      await postLink({ action: 'link', matterRef, workspaceRef });
      return null;
    }

    async function removeLink(matterRef, workspaceRef) {
      if (typeof matterRef !== 'string' || matterRef === '' || typeof workspaceRef !== 'string' || workspaceRef === '') return;
      await postLink({ action: 'unlink', matterRef, workspaceRef });
    }

    async function setDefaultLink(matterRef, workspaceRef) {
      if (typeof matterRef !== 'string' || matterRef === '' || typeof workspaceRef !== 'string' || workspaceRef === '') return;
      await postLink({ action: 'set-default', matterRef, workspaceRef });
    }

    // Batch 24 / P3（ADR-0261）：会话核心动作。请求体、readiness 判定与句子留在 wire 侧；
    // React 拥有 DOM/pending/notice 显示时机（含本地短路的同一句话）。
    function sendSession(text, mode) {
      return (async () => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        const state = lastStatePayload;
        const storedItems = state !== null && typeof state === 'object' && state.attachments !== null && typeof state.attachments === 'object' && Array.isArray(state.attachments.items)
          ? state.attachments.items.filter((item) => item !== null && typeof item === 'object' && item.stage === 'stored')
          : [];
        if (trimmed === '' && storedItems.length === 0) return '先写一条输入再发送（或先上传附件）。';
        const context = currentSendContext();
        if (context === null) return '先在上面选好事项与工作区：发送不会自动替你挑一个。';
        const sendMode = mode === 'steer' ? 'steer' : 'queue';
        let outcome = null;
        try {
          const response = await fetchWithinDeadline('/.sage/session/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // 008：方式只在实际选择 steer 时随请求携带（默认排队少一个键）；文案承诺只到步骤边界。
            body: JSON.stringify(sendMode === 'steer'
              ? { matterRef: context.matterRef, workspaceRoot: context.workspaceRoot, text: trimmed, mode: 'steer' }
              : { matterRef: context.matterRef, workspaceRoot: context.workspaceRoot, text: trimmed }),
          });
          outcome = await response.json();
        } catch { /* 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        if (outcomeState === 'deferred') return '已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。';
        if (outcomeState === 'refused' && code === 'session-paused-attachments') return '已暂停：带附件的发送暂不可用（待继续只保存文本）；先「继续」再发送。';
        return null;
      })();
    }

    async function postControl(path, body) {
      try {
        await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch { /* state 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
    }

    async function savePreferences(patch, origin) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/preferences', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      // A refusal (or an unreadable answer) is not a save: force the selects back to the stored value.
      if (outcome === null || typeof outcome !== 'object' || outcome.state !== 'saved') {
        // A refusal is not a save: rewrite the selects from the stored value and say so — the poll
        // must not replace this sentence with its own (the same gate the other cards use).
        prefForceSync = true;
        const sentence = '保存失败：显示值已回退到已保存的版本（未写入本设备）。';
        if (origin === 'menu') {
          menuLocalNotice = sentence;
          if (menuNote !== null) menuNote.textContent = sentence;
        } else {
          prefLocalNotice = sentence;
          if (prefNote !== null) prefNote.textContent = sentence;
        }
      } else if (origin === 'menu') {
        menuLocalNotice = null;
      } else {
        prefLocalNotice = null;
      }
      queueMicrotask(() => { void refresh(); });
    }

    if (prefSave) {
      prefSave.addEventListener('click', () => {
        prefSave.disabled = true;
        const patch = {};
        for (const key of PREF_KEYS) {
          const node = prefSelects[key];
          if (node !== null) patch[key] = node.value;
        }
        void savePreferences(patch, 'page').finally(() => { if (prefSave !== null) prefSave.disabled = false; });
      });
    }
    for (const key of PREF_KEYS) {
      const menuSelect = menuSelects[key];
      if (menuSelect === null) continue;
      menuSelect.addEventListener('change', () => {
        const patch = {};
        patch[key] = menuSelect.value;
        void savePreferences(patch, 'menu');
      });
    }

    function stopSession() {
      return (async () => {
        const matterRef = selectedMatterRef();
        if (matterRef === '') return '先选好事项再停止。';
        await postControl('/.sage/session/stop', { matterRef });
        return null;
      })();
    }

    function resumeSession() {
      return (async () => {
        const matterRef = selectedMatterRef();
        const workspaceRef = selectedWorkspaceRef();
        const state = lastStatePayload;
        const workspaces = state !== null && typeof state === 'object' && state.workspaces !== null && typeof state.workspaces === 'object' && Array.isArray(state.workspaces.entries)
          ? state.workspaces.entries
          : [];
        const chosen = workspaces.find((entry) => entry !== null && typeof entry === 'object' && entry.workspaceId === workspaceRef);
        if (matterRef === '' || chosen === undefined) return '先选好事项与工作区再继续。';
        let outcome = null;
        try {
          const response = await fetchWithinDeadline('/.sage/session/resume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ matterRef, workspaceRoot: String(chosen.path ?? '') }),
          });
          outcome = await response.json();
        } catch { /* 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        const count = outcome !== null && typeof outcome === 'object' && Array.isArray(outcome.dispatched) ? outcome.dispatched.length : 0;
        // 007：继续后的对账句 —— 被打断时明说"未含内容没有被送出"。
        if (outcomeState === 'resumed') return count === 0 ? '已继续：没有待继续项需要派发。' : '已继续：按顺序派发 ' + String(count) + ' 条待继续（受理≠执行；执行与否看会话行）。';
        if (outcomeState === 'interrupted') return '继续被新的暂停打断：已派发的按回执核对，其余仍留在待继续——未含内容没有被送出。';
        if (outcomeState === 'refused') return '继续失败（' + String(code ?? '未知') + '）：待继续项原样保留。';
        return null;
      })();
    }

    // 014：附件块动作。候选/上传中/已核验/已随消息发送各自成态；上传不会自动替你挑上下文。
    async function postAttachment(path, body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
      return outcome;
    }
    function pickAttachments() {
      return (async () => {
        const outcome = await postAttachment('/.sage/attachments/pick', {});
        const state = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : '';
        if (state === 'cancelled') return '已取消选择：没有产生任何候选。';
        if (state === 'picked') {
          const items = Array.isArray(outcome.items) ? outcome.items.length : 0;
          const refused = Array.isArray(outcome.refused) ? outcome.refused : [];
          return '已产生 ' + String(items) + ' 个候选（尚未上传）。'
            + (refused.length > 0 ? ' 有 ' + String(refused.length) + ' 个文件未被接受：'
              + refused.map((entry) => String(entry && typeof entry === 'object' ? entry.name : '') + '（' + String(entry && typeof entry === 'object' ? entry.code : '') + '）').join('、') + '。' : '');
        }
        if (state === 'refused') return '选择失败：' + String(outcome.code ?? 'unknown') + '（没有产生候选）。';
        return '选择结果未读取到（没有产生候选）。';
      })();
    }

    function uploadAttachment(itemId) {
      return (async () => {
        if (typeof itemId !== 'string' || itemId === '') return null;
        const context = currentSendContext();
        if (context === null) return '先在上面选好事项与工作区：上传不会自动替你挑一个。';
        const outcome = await postAttachment('/.sage/attachments/upload', { itemId, matterRef: context.matterRef, workspaceRoot: context.workspaceRoot });
        const state = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : '';
        if (state === 'refused') return '上传没有完成：' + String(outcome.code ?? 'unknown') + '（没有变成已发送附件；可重试同一版本）。';
        return null;
      })();
    }

    function cancelAttachment(itemId) {
      return (async () => {
        if (typeof itemId !== 'string' || itemId === '') return;
        await postAttachment('/.sage/attachments/cancel', { itemId });
      })();
    }

    // 015：产物观察/打开/重试/关闭。打开按卡片版本；失败重试仍是同一版本。
    async function postArtifact(path, body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
      return outcome;
    }
    // Batch 17：观察/预览请求留在 wire 侧；React 拥有 DOM、pending 与 notice 显示时机。
    function observeArtifacts() {
      return (async () => {
        const context = currentSendContext();
        if (context === null) return '先在上面选好事项与工作区：观察不会自动替你挑一个。';
        const outcome = await postArtifact('/.sage/artifacts/observe', { matterRef: context.matterRef, workspaceRoot: context.workspaceRoot });
        const state = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : '';
        if (state === 'refused') return '观察没有完成：' + String(outcome.code ?? 'unknown') + '（卡片未更新）。';
        if (state === 'observed') return '已观察 ' + String(outcome.observed ?? 0) + ' 条文件变化线索，核验后现有 ' + String(outcome.cards ?? 0) + ' 张产物卡。';
        return null;
      })();
    }

    function retryArtifactPreview() {
      return postArtifact('/.sage/artifacts/retry', {});
    }

    function closeArtifactPreview() {
      return postArtifact('/.sage/artifacts/close', {});
    }

    function setArtifactFullscreen(on) {
      return (async () => {
        try {
          await fetchWithinDeadline('/.sage/artifacts/fullscreen', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ on }),
          });
        } catch { /* state 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
      })();
    }

    function artifactWindow(action) {
      return (async () => {
        let outcome = null;
        try {
          const response = await fetchWithinDeadline('/.sage/artifacts/window', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          outcome = await response.json();
        } catch { /* 轮询兜底 */ }
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        const notice = outcomeState === 'opened' ? '已在独立窗口打开（同一版本引用；未重读、未重跑生成）。'
          : outcomeState === 'closed' ? '已关闭独立窗口（回到侧栏容器；未改产物记录，运行不受影响）。'
            : code === 'artifact-window-unavailable' ? '独立窗口未接线（本机不提供窗口能力）：未打开。'
              : code === 'artifact-preview-not-open' ? '先打开预览（按版本），独立窗口只对已打开的产物生效。'
                : '窗口操作未生效（' + String(code ?? '未知') + '）。';
        queueMicrotask(() => { void refresh(); });
        return notice;
      })();
    }

    // 033 / Batch 16：结果图与网页成果的预览入口都走同一个产物打开动作（按版本读取在 main
    // 完成）。两个卡的 DOM 归 React 之后，这里只保留数据动作，并经下行桥（__SAGE_LEGACY_ACTIONS__）
    // 供 React 的显式按钮调用；拒绝码到文案的映射仍是这一份。
    function openArtifact(artifactId) {
      if (typeof artifactId !== 'string' || artifactId === '') return Promise.resolve(null);
      return postArtifact('/.sage/artifacts/open', { artifactId });
    }

    function openExternalLink(url) {
      return (async () => {
        let notice;
        try {
          const response = await fetchWithinDeadline('/.sage/external-link', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          const payload = await response.json();
          const state = payload !== null && typeof payload === 'object' && typeof payload.state === 'string' ? payload.state : null;
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          const host = payload !== null && typeof payload === 'object' && payload.target !== null && typeof payload.target === 'object' && typeof payload.target.host === 'string' ? payload.target.host : '';
          notice = state === 'opened' ? '已交给系统浏览器打开（目标已校验：' + host + '）；Sage 不读取浏览器内容、不跟踪操作。'
            : code === 'link-scheme-refused' ? '该地址不被支持：只允许 http/https——未打开。'
              : code === 'link-credentials-refused' ? '该地址内嵌凭据——未打开。'
                : code === 'link-too-long' ? '地址超出长度上限——未打开。'
                  : code === 'external-open-unavailable' ? '本版未接系统浏览器端口——未打开（不假装已打开）。'
                    : code === 'external-open-failed' ? '交给系统浏览器失败——未证明已打开。'
                      : '未打开（' + String(code ?? '响应无法识别') + '）。';
        } catch {
          notice = '打开外部链接失败：这次请求没有完成（未证明已打开）。';
        }
        queueMicrotask(() => { void refresh(); });
        return notice;
      })();
    }

    // 006：待继续清单动作（只有 pending 项可编辑/移除；已消费项冻结在只读态）。
    function editPendingItem(itemId, text) {
      return (async () => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (typeof itemId !== 'string' || itemId === '' || trimmed === '') return;
        await postControl('/.sage/session/pending', { action: 'edit', itemId, text: trimmed });
      })();
    }

    function removePendingItem(itemId) {
      return (async () => {
        if (typeof itemId !== 'string' || itemId === '') return;
        await postControl('/.sage/session/pending', { action: 'remove', itemId });
      })();
    }

    // 008：队列逐项修改（服务快照为权威；被消费项如实提示，不静默丢弃）。
    async function postQueueAction(action, itemId, text) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/queue', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(action === 'edit' ? { action: 'edit', itemId, text } : { action: 'remove', itemId }),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      queueMicrotask(() => { void refresh(); });
      const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
      const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
      if (outcomeState === 'ok') return action === 'edit' ? '队列项已按新文本更新（以权威快照为准，刷新后可见）。' : '队列项已移除登记（若已开始处理则改不动——以快照为准）。';
      if (code === 'queue-item-not-found') return '这一项已开始处理（不在队列里了）：如实提示，不静默丢弃、不重复提交——如需补充请重新发送。';
      if (code === 'queue-no-session') return '还没有会话：没有队列项可改。';
      if (code === 'queue-edit-invalid') return '修改内容为空或超长：没有提交。';
      return '队列项未更新（' + String(code ?? '响应无法识别') + '）。';
    }

    function editQueueItem(itemId, text) {
      return (async () => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        if (typeof itemId !== 'string' || itemId === '' || trimmed === '') return null;
        return postQueueAction('edit', itemId, trimmed);
      })();
    }

    function removeQueueItem(itemId) {
      return (async () => {
        if (typeof itemId !== 'string' || itemId === '') return null;
        return postQueueAction('remove', itemId, '');
      })();
    }

    // 009：历史运行。读取只发 page 类动作（main 端保证只走纯历史接点）；列表后自动展开最近一次。
    let autoDetailKey = null;
    async function postHistory(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/history', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function readHistory(beforeSeq) {
      return (async () => {
        const outcome = await postHistory(typeof beforeSeq === 'number' ? { action: 'list', beforeSeq } : { action: 'list' });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        let notice = null;
        if (outcomeState === 'no-session') {
          notice = '还没有会话：没有历史运行可读（读取不会创建会话）。';
        } else if (outcomeState === 'refused') {
          notice = '历史读取失败（' + String(code ?? '未知') + '）：没读到就不装作读过。';
        } else {
          // 默认只展开最近一次（US-097）；每个 matter+run 只触发一次自动详情读。
          const first = outcome !== null && typeof outcome === 'object' && Array.isArray(outcome.runs) && outcome.runs.length > 0 ? outcome.runs[0] : null;
          const matterRef = selectedMatterRef();
          if (first !== null && typeof first === 'object' && typeof first.runSeq === 'number') {
            const key = matterRef + ':' + String(first.runSeq);
            if (autoDetailKey !== key) {
              autoDetailKey = key;
              await postHistory({ action: 'detail', runSeq: first.runSeq });
            }
          }
        }
        queueMicrotask(() => { void refresh(); });
        return notice;
      })();
    }
    function readHistoryDetail(runSeq) {
      return (async () => {
        if (!Number.isSafeInteger(runSeq) || runSeq < 0) return;
        await postHistory({ action: 'detail', runSeq });
        queueMicrotask(() => { void refresh(); });
      })();
    }

    // 038：引用选择。select/clear 各恰一条 POST；选择不改启用状态（纯请求上下文）。
    async function postSelections(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/selections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function selectInputRef(kind, ref) {
      return (async () => {
        if ((kind !== 'skill' && kind !== 'plugin') || typeof ref !== 'string' || ref === '') return null;
        const outcome = await postSelections({ action: 'select', kind, ref });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        await refresh();
        if (outcomeState === 'selected') return null;
        if (code === 'selection-skills-unread') return '未核验：技能清单还没读到，不能选择（先重试读取）。';
        if (code === 'selection-skill-not-listed') return '该技能不在当前挂载清单里（不是"已失效"）：未选择。';
        if (code === 'selection-skill-model-only') return '该技能仅模型可调用（本入口不可选）：未选择。';
        if (code === 'selection-plugin-not-mounted') return '该组件未挂载：未选择，也不对启用状态作结论。';
        return '选择未生效（' + String(code ?? '未知') + '）：不应重复点击。';
      })();
    }
    function clearInputRef(kind, ref) {
      return (async () => {
        if ((kind !== 'skill' && kind !== 'plugin') || typeof ref !== 'string' || ref === '') return;
        await postSelections({ action: 'clear', kind, ref });
        await refresh();
      })();
    }

    // 048：提交与核对。submit 恰一条具名写；核对同一条回执（不重复提交）。
    async function postFeedback(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    if (feedbackSubmit !== null) {
      feedbackSubmit.addEventListener('click', () => {
        const text = feedbackText !== null && typeof feedbackText.value === 'string' ? feedbackText.value.trim() : '';
        if (text === '') {
          feedbackLocalNotice = '先写下反馈文本再提交（不自动附任何日志或堆栈）。';
          if (feedbackNote !== null) feedbackNote.textContent = feedbackLocalNotice;
          return;
        }
        const code = feedbackCode !== null && typeof feedbackCode.value === 'string' ? feedbackCode.value.trim() : '';
        const stage = feedbackStage !== null && typeof feedbackStage.value === 'string' ? feedbackStage.value.trim() : '';
        const correlation = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.service !== null && typeof lastStatePayload.service === 'object' && typeof lastStatePayload.service.correlation === 'string'
          ? lastStatePayload.service.correlation : '';
        feedbackLocalNotice = null;
        feedbackSubmit.disabled = true;
        void (async () => {
          const outcome = await postFeedback({
            action: 'submit',
            text,
            ...(code === '' ? {} : { code }),
            ...(stage === '' ? {} : { stage }),
            ...(correlation === '' ? {} : { correlation }),
          });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const receiptCode = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState === 'accepted') {
            feedbackLocalNotice = '已接收：反馈只含你写的文本与结构化诊断（不含日志、堆栈、机器路径或凭据）。';
          } else if (outcomeState === 'unknown') {
            feedbackLocalNotice = '结果未知：本次提交已记录待核对——请用[核对同一提交]，不要重复提交。';
          } else if (outcomeState === 'unavailable') {
            feedbackLocalNotice = receiptCode === 'feedback-sink-unavailable' ? '未接线：反馈接收端口缺项（feedback-sink-unavailable）；未提交。' : '反馈未提交（' + String(receiptCode ?? '未就绪') + '）。';
          } else if (outcomeState === 'refused') {
            feedbackLocalNotice = '未提交（' + String(receiptCode ?? '未知') + '）。';
          } else {
            feedbackLocalNotice = '提交未送达：结果未知——只给核对，不重复提交。';
          }
          feedbackSubmit.disabled = false;
          await refresh();
          if (feedbackNote !== null && feedbackLocalNotice !== null) feedbackNote.textContent = feedbackLocalNotice;
        })();
      });
    }
    if (feedbackReceipts !== null) {
      feedbackReceipts.addEventListener('click', (event) => {
        const verify = event.target?.closest?.('[data-feedback-verify]') ?? null;
        if (verify === null || verify.disabled === true) return;
        const requestId = String(verify.dataset.feedbackVerify ?? '');
        if (requestId === '') return;
        verify.disabled = true;
        feedbackLocalNotice = null;
        void (async () => {
          const outcome = await postFeedback({ action: 'verify', requestId });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          feedbackLocalNotice = outcomeState === 'accepted' ? '已核对：同一提交的回执为「已接收」（核对不会再次提交）。'
            : outcomeState === 'unknown' ? '已核对：同一提交的回执仍为「结果未知」（没有重复提交）。'
              : outcomeState === 'not-found' ? '回执不在本次运行记录中（核对不重派）。'
                : '核对不可用（' + String(outcomeState ?? '未就绪') + '）。';
          verify.disabled = false;
          await refresh();
          if (feedbackNote !== null && feedbackLocalNotice !== null) feedbackNote.textContent = feedbackLocalNotice;
        })();
      });
    }

    // 043：终端面板。打开=一条有界读页（只读观察）；关闭是纯本地开关（React 侧零请求）。
    function openTerminal(terminalId) {
      return (async () => {
        if (typeof terminalId !== 'string' || terminalId === '') return { kind: 'notice', notice: '输出不可读（terminal-id-invalid）：未打开。' };
        let outcome = null;
        try {
          const response = await fetchWithinDeadline('/.sage/session/terminal-read', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ terminalId }),
          });
          outcome = await response.json();
        } catch { /* 轮询兜底 */ }
        await refresh();
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        if (outcomeState === 'read') {
          return {
            kind: 'read',
            text: typeof outcome.text === 'string' ? outcome.text : '',
            lineBegin: Number.isFinite(outcome.lineBegin) ? outcome.lineBegin : 0,
            lineEnd: Number.isFinite(outcome.lineEnd) ? outcome.lineEnd : 0,
            totalLines: Number.isFinite(outcome.totalLines) ? outcome.totalLines : 0,
            truncated: outcome.truncated === true,
          };
        }
        const notice = code === 'terminal-not-listed' ? '该终端不在当前清单内（不是"已失效"）：未打开输出。'
          : code === 'terminal-no-session' ? '还没有会话：无法读取（读取不会创建会话）。'
            : '输出不可读（' + String(code ?? '未知') + '）：未打开。';
        return { kind: 'notice', notice };
      })();
    }

    // 042：模型排队核对（只重新读取；结果未知不重试、不重复提交）。
    function verifyModelQueue() {
      return (async () => {
        await refresh();
        return '已重新读取该排队状态（核对=只读，不会重复提交任何请求）。';
      })();
    }

    // 041：授权等待答案。批准/拒绝/撤回各恰一条具名写；核对只重新读取（结果未知不给重试）。
    async function postApproval(path, body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    async function approvalResultOf(outcome) {
      const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
      const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
      const receipt = outcome !== null && typeof outcome === 'object' && outcome.receipt !== null && typeof outcome.receipt === 'object' ? outcome.receipt : null;
      let notice;
      if (outcomeState === 'recorded' && receipt !== null) {
        const receiptState = typeof receipt.state === 'string' ? receipt.state : '';
        const outcomeWord = typeof receipt.outcome === 'string' ? receipt.outcome : '';
        if (receiptState === 'accepted' && outcomeWord === 'allowed-once') notice = '批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。';
        else if (receiptState === 'accepted' && outcomeWord === 'rejected') notice = '拒绝已提交——依赖动作不会派发。';
        else if (receiptState === 'accepted' && outcomeWord === 'withdrawn') notice = '撤回已提交——等待不会兑现为执行条件（这不是失败，也不是批准）。';
        else notice = '结果未知：已记录待核对，不自动重试；未确认前不显示为已批准。';
      } else if (outcomeState === 'refused') {
        notice = code === 'approval-not-pending' ? '该等待已不进行中：未提交。'
          : code === 'approval-paused' ? '会话已暂停：未提交（继续后可答）。'
            : code === 'approval-not-withdrawable' ? '该等待不可撤回（请求方未提供取消能力）：未提交。'
              : '未提交（' + String(code ?? '未知') + '）。';
      } else {
        notice = '请求未送达：结果未知（不重试；可核对当前等待后再试）。';
      }
      await refresh();
      return notice;
    }
    function answerApproval(requestId, outcomeWord) {
      return (async () => {
        const matterRef = selectedMatterRef();
        const outcome = await postApproval('/.sage/session/approval-answer', { matterRef, requestId, outcome: outcomeWord });
        return approvalResultOf(outcome);
      })();
    }
    function withdrawApproval(requestId) {
      return (async () => {
        const matterRef = selectedMatterRef();
        const outcome = await postApproval('/.sage/session/approval-withdraw', { matterRef, requestId });
        return approvalResultOf(outcome);
      })();
    }
    function verifyApproval() {
      return (async () => {
        await refresh();
        return '已重新读取该等待的状态（核对=只读，不重试同一提交）。';
      })();
    }

    // 039：模式切换。一条具名请求（回执三态：已生效/下一步生效/未改变）；未生效显示当前实际模式；
    // 退出计划不暗示已执行，也不写任何默认值。
    async function postPlanMode(active) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/plan-mode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ active }),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function setPlanMode(active) {
      return (async () => {
        const outcome = await postPlanMode(active === true);
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const family = outcome !== null && typeof outcome === 'object' && typeof outcome.family === 'string' ? outcome.family : null;
        const outcomeWord = outcome !== null && typeof outcome === 'object' && typeof outcome.outcome === 'string' ? outcome.outcome : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        const viewActive = outcome !== null && typeof outcome === 'object' && outcome.view !== null && typeof outcome.view === 'object' && typeof outcome.view.active === 'boolean' ? outcome.view.active : null;
        let notice;
        if (outcomeState === 'settled' && family === 'applied') {
          notice = viewActive === true
            ? '已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。'
            : '已切换：已退出计划模式——退出不等于方案已执行。';
        } else if (outcomeState === 'settled' && family === 'pending') {
          notice = '切换已登记：将在下一步生效；当前实际模式不变（显示仍为当前模式）。';
        } else if (outcomeState === 'settled') {
          notice = outcomeWord === 'noop' ? '未改变：已经是该模式。' : '未改变：相反的待生效选择已取消（实际模式未变）。';
        } else if (outcomeState === 'refused') {
          notice = code === 'plan-mode-no-session' ? '还没有会话：无法切换（读取不会创建会话）。'
            : '切换未生效（' + String(code ?? '未知') + '）：不重复提交。';
        } else {
          notice = '切换请求未送达：结果未知（不重试；可先核对当前模式）。';
        }
        await refresh();
        return notice;
      })();
    }

    // 037：回复动作。复制/引用/建议由 React 纯本地处置（零写调用）；重试仅确定失败且走同一发送入口。
    function replyRetry() {
      return (async () => {
        const transcriptRows = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionChannel !== null && typeof lastStatePayload.sessionChannel === 'object' && Array.isArray(lastStatePayload.sessionChannel.transcript)
          ? lastStatePayload.sessionChannel.transcript
          : [];
        let lastUserText = '';
        for (const row of transcriptRows) {
          if (row !== null && typeof row === 'object' && row.role === 'user' && typeof row.text === 'string' && row.text !== '') lastUserText = row.text;
        }
        if (lastUserText === '') return '没有可重试的上一轮输入（最近读到的会话里没有用户文本）。';
        let outcome = null;
        try {
          const response = await fetchWithinDeadline('/.sage/session/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              matterRef: selectedMatterRef(),
              workspaceRoot: selectedWorkspaceRef(),
              text: lastUserText,
            }),
          });
          outcome = await response.json();
        } catch { /* 轮询兜底 */ }
        await refresh();
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        if (outcomeState === 'accepted') return '重试已受理（与普通发送同一入口）：受理不等于已开始执行，只看日志里有没有未结束的一轮。';
        if (outcomeState === 'deferred') return '会话已暂停：重试只登记为待继续（不唤醒执行）。';
        return '重试未确认送达（' + String(code ?? '未知') + '）：只给核对入口，不自动重试。';
      })();
    }
    function auditReply() {
      return (async () => {
        await refresh();
        return '已重新读取会话（核对）：未触发任何重发。';
      })();
    }

    // 036：编辑与重发。编辑只产生版本；重发走同一发送入口（恰一条 edit POST）；未知只给核对。
    async function postEdits(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/edits', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function saveEdit(messageRef, text) {
      return (async () => {
        if (typeof messageRef !== 'string' || messageRef === '') return '先从下方会话记录里选一条已发消息。';
        const outcome = await postEdits({ action: 'save', messageRef, text: typeof text === 'string' ? text : '' });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        await refresh();
        if (outcomeState === 'saved') return null;
        if (code === 'edit-text-invalid') return '新版本内容为空或过长（上限 16384 字）。';
        if (code === 'edit-message-not-found') return '这条消息不在最近读到的会话记录里：先刷新会话记录再试。';
        return '保存失败（' + String(code ?? '未知') + '）：未产生新版本。';
      })();
    }
    function resendEdit(editId) {
      return (async () => {
        const outcome = await postEdits({ action: 'resend', editId, workspaceRoot: selectedWorkspaceRef() });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        const version = outcome !== null && typeof outcome === 'object' && outcome.version !== null && typeof outcome.version === 'object' ? outcome.version : null;
        let notice;
        if (outcomeState === 'recorded') {
          notice = version !== null && version.submission === 'unknown'
            ? '重发结果未知：只给核对同一操作（不自动重试、不放回可重发队列）。'
            : '重发已接收（等待生效确认）：与普通发送同一入口。';
        } else {
          notice = code === 'edit-verify-required' ? '结果未知：先点「核对同一操作」——不给重试、不自动重发。'
            : code === 'edit-inflight' ? '上一次重发还在路上：未并行发起。'
              : code === 'edit-paused' ? '会话已暂停：重发没有派发（恢复后再次显式重发）。'
                : code === 'edit-workspace-missing' ? '先关联工作区再重发（重发走同一发送入口）。'
                  : '重发失败（' + String(code ?? '未知') + '）：未确认送达，请核对。';
        }
        await refresh();
        return notice;
      })();
    }
    function verifyEdit(editId) {
      return (async () => {
        const outcome = await postEdits({ action: 'verify', editId });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        const version = outcome !== null && typeof outcome === 'object' && outcome.version !== null && typeof outcome.version === 'object' ? outcome.version : null;
        let notice;
        if (outcomeState === 'checked') {
          notice = version !== null && version.submission === 'effective' ? '已生效：该版本已落史。'
            : code === 'edit-version-not-visible' ? '已接收但尚未见该版本落史（保持等待确认，不猜测）。'
              : version !== null && version.submission === 'not-delivered' ? '核对确认未送达：可再次显式重发（不自动）。'
                : '核对完成（' + String(code ?? '未见落史') + '）：保持现状。';
        } else {
          notice = '核对失败（' + String(code ?? '未知') + '）：保持现状，不自动重试。';
        }
        await refresh();
        return notice;
      })();
    }

    // 035：锚点读取/定位。预览与关闭由 React 纯本地处置（零请求；hover 无监听、不发命令）。
    async function postAnchors(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/anchors', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function readAnchors() {
      return (async () => {
        const outcome = await postAnchors({ action: 'read' });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        let notice = null;
        if (outcomeState !== 'read') {
          notice = outcomeState === 'no-session' ? '还没有会话：没有锚点可读（读取不会创建会话）。'
            : '锚点读取失败（' + String(code ?? '未知') + '）：未核验，不以空列表冒充。';
        }
        await refresh();
        return notice;
      })();
    }
    function locateAnchor(runSeq) {
      return (async () => {
        if (!Number.isSafeInteger(runSeq) || runSeq < 0) return { kind: 'notice', notice: '运行定位无效：未发起。' };
        const outcome = await postAnchors({ action: 'locate', runSeq });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        await refresh();
        if (outcomeState === 'located') {
          const preview = outcome !== null && typeof outcome === 'object' && typeof outcome.promptPreview === 'string' && outcome.promptPreview !== '' ? outcome.promptPreview : '（该轮没有用户文本预览）';
          return {
            kind: 'located',
            runSeq,
            previewText: '已定位：运行 @' + String(runSeq) + '——' + preview,
            notice: '已定位到运行 @' + String(runSeq) + ' 的该轮消息（短预览；只走了纯历史读取）。',
          };
        }
        if (outcomeState === 'no-session') return { kind: 'notice', notice: '还没有会话：无法定位（定位不会创建会话）。' };
        return { kind: 'notice', notice: '运行 @' + String(runSeq) + ' 不可读（' + String(code ?? '未知') + '）：保持缺失（不显示空白成功）——现场保留，不回落为空白。' };
      })();
    }

    // 034：澄清回答提交与核对。一次点击恰一条具名写；核对只重新读一次（结果未知不给重试）。
    async function postClarificationAnswer(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/clarification-answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    function submitClarification(requestId, answers) {
      return (async () => {
        if (typeof requestId !== 'string' || requestId === '') return null;
        const outcome = await postClarificationAnswer({ matterRef: selectedMatterRef(), requestId, answers: Array.isArray(answers) ? answers : [] });
        const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
        const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
        await refresh();
        if (outcomeState === 'recorded') return null;
        if (code === 'clarification-paused') return '会话已暂停：停止可能已中止该提问——回答不会送达；继续会话后再回答。';
        if (code === 'clarification-not-pending') return '该提问已不在等待中（可能已中止或已被处理）：未提交，不给重试。';
        if (code === 'clarification-answer-invalid') return '回答不完整或不在候选项内：每个问题至少选一项或填自定义（两者同权）。';
        return '回答提交失败（' + String(code ?? '未知') + '）：未确认送达，请核对。';
      })();
    }
    function verifyClarification() {
      return (async () => {
        await refresh();
      })();
    }

    // ADR-0261 P2: the trace drawer state machine (open/close, Escape/Tab containment, media
    // breakpoint, focus restoration) now lives in the React matter region component.
    // Batch 16: the React support cards call their explicit entries back through this down-bridge;
    // the request/refusal/text handling stays here (single home of the wire semantics).
    // Batch 20: the React link card also pushes its picker selection through the up-bridge below,
    // so every action's matter/workspace context comes from here, not from the card's DOM.
    globalThis.__SAGE_APP_SET_LINK_SELECTION__ = (matterRef, workspaceRef) => {
      linkSelection.matterRef = typeof matterRef === 'string' ? matterRef : '';
      linkSelection.workspaceRef = typeof workspaceRef === 'string' ? workspaceRef : '';
    };
    // Batch 22：事项列表卡的筛选镜像（侧栏计数是区域外事实，仍由本脚本更新）。
    globalThis.__SAGE_APP_SET_MATTER_LIST_FILTER__ = (showAll) => {
      matterListFilterShowAll = showAll === true;
      updateMatterNavCount();
    };
    // Batch 23：草案卡的字段镜像（退出检查的未保存字段链读这里；React 拥有输入框）。
    globalThis.__SAGE_APP_SET_DRAFT_FIELDS__ = (fields) => {
      const value = fields !== null && typeof fields === 'object' ? fields : {};
      draftFieldMirror.goal = typeof value.goal === 'string' ? value.goal : '';
      draftFieldMirror.deliverable = typeof value.deliverable === 'string' ? value.deliverable : '';
      draftFieldMirror.responsibility = typeof value.responsibility === 'string' ? value.responsibility : '';
      draftFieldMirror.projectRef = typeof value.projectRef === 'string' ? value.projectRef : '';
      draftFieldMirror.clarification = typeof value.clarification === 'string' ? value.clarification : '';
    };
    globalThis.__SAGE_LEGACY_ACTIONS__ = {
      openArtifact: (artifactId) => openArtifact(artifactId),
      openExternalLink: (url) => openExternalLink(url),
      runLogOpen: (path) => runLogOpen(path),
      runLogContinue: () => runLogContinue(),
      observeArtifacts: () => observeArtifacts(),
      retryArtifactPreview: () => retryArtifactPreview(),
      closeArtifactPreview: () => closeArtifactPreview(),
      setArtifactFullscreen: (on) => setArtifactFullscreen(on),
      artifactWindow: (action) => artifactWindow(action),
      createSideChat: () => createSideChat(),
      readSideChat: (sideChatId) => readSideChat(sideChatId),
      sendSideChat: (sideChatId, text) => sendSideChat(sideChatId, text),
      returnSideChat: (sideChatId, text) => returnSideChat(sideChatId, text),
      createActionItem: (title, note) => createActionItem(title, note),
      actionItemRowAction: (actionId, action) => actionItemRowAction(actionId, action),
      submitCorrection: (original, text) => submitCorrection(original, text),
      createProject: (name) => createProject(name),
      assignProject: (projectRef) => assignProject(projectRef),
      unassignProject: () => unassignProject(),
      createPlan: (title, stepsText) => createPlan(title, stepsText),
      acceptPlan: (planId) => acceptPlan(planId),
      prepareStep: (planId, stepNo) => prepareStep(planId, stepNo),
      executeStep: (planId, stepNo, confirmationId) => executeStep(planId, stepNo, confirmationId),
      addLink: (matterRef, workspaceRef) => addLink(matterRef, workspaceRef),
      removeLink: (matterRef, workspaceRef) => removeLink(matterRef, workspaceRef),
      setDefaultLink: (matterRef, workspaceRef) => setDefaultLink(matterRef, workspaceRef),
      archiveMatters: (targets, ground) => archiveMatters(targets, ground),
      restoreMatters: (targets) => restoreMatters(targets),
      renameMatter: (targets, title) => renameMatter(targets, title),
      createGroup: (name, targets) => createGroup(name, targets),
      renameGroup: (groupId, name) => renameGroup(groupId, name),
      removeGroup: (groupId) => removeGroup(groupId),
      assignGroupMembers: (groupId, operation, targets) => assignGroupMembers(groupId, operation, targets),
      selectMatterContext: (matterId, expectedContextGeneration) => selectMatterContext(matterId, expectedContextGeneration),
      sendDraft: (rawInput) => sendDraft(rawInput),
      saveDraft: (draftId, fields, clarification, selectedEntryIds) => saveDraft(draftId, fields, clarification, selectedEntryIds),
      reconcileDraft: (draftId) => reconcileDraft(draftId),
      cancelDraftAttempt: (draftId) => cancelDraftAttempt(draftId),
      prepareDraftConfirm: (draftId) => prepareDraftConfirm(draftId),
      executeDraftConvert: (draftId, confirmationId) => executeDraftConvert(draftId, confirmationId),
      sendSession: (text, mode) => sendSession(text, mode),
      stopSession: () => stopSession(),
      resumeSession: () => resumeSession(),
      pickAttachments: () => pickAttachments(),
      uploadAttachment: (itemId) => uploadAttachment(itemId),
      cancelAttachment: (itemId) => cancelAttachment(itemId),
      editPendingItem: (itemId, text) => editPendingItem(itemId, text),
      removePendingItem: (itemId) => removePendingItem(itemId),
      editQueueItem: (itemId, text) => editQueueItem(itemId, text),
      removeQueueItem: (itemId) => removeQueueItem(itemId),
      readHistory: (beforeSeq) => readHistory(beforeSeq),
      readHistoryDetail: (runSeq) => readHistoryDetail(runSeq),
      readAnchors: () => readAnchors(),
      locateAnchor: (runSeq) => locateAnchor(runSeq),
      saveEdit: (messageRef, text) => saveEdit(messageRef, text),
      resendEdit: (editId) => resendEdit(editId),
      verifyEdit: (editId) => verifyEdit(editId),
      selectInputRef: (kind, ref) => selectInputRef(kind, ref),
      clearInputRef: (kind, ref) => clearInputRef(kind, ref),
      submitClarification: (requestId, answers) => submitClarification(requestId, answers),
      verifyClarification: () => verifyClarification(),
      answerApproval: (requestId, outcome) => answerApproval(requestId, outcome),
      withdrawApproval: (requestId) => withdrawApproval(requestId),
      verifyApproval: () => verifyApproval(),
      verifyModelQueue: () => verifyModelQueue(),
      replyRetry: () => replyRetry(),
      auditReply: () => auditReply(),
      setPlanMode: (active) => setPlanMode(active),
      openTerminal: (terminalId) => openTerminal(terminalId),
      runSearch: (query) => runSearch(query),
    };

    if (userMenu && userMenuPanel) {
      const closeUserMenu = () => {
        userMenuPanel.hidden = true;
        userMenu.setAttribute('aria-expanded', 'false');
        userMenu.focus();
      };
      userMenu.addEventListener('click', () => {
        const open = userMenuPanel.hidden;
        userMenuPanel.hidden = !open;
        userMenu.setAttribute('aria-expanded', String(open));
      });
      const closeUserMenuOnEscape = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeUserMenu();
      };
      userMenu.addEventListener('keydown', closeUserMenuOnEscape);
      userMenuPanel.addEventListener('keydown', closeUserMenuOnEscape);
    }

    const displayThemeMedia = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-color-scheme: dark)')
      : null;
    if (displayThemeMedia !== null && typeof displayThemeMedia.addEventListener === 'function') {
      displayThemeMedia.addEventListener('change', () => { queueMicrotask(() => { void refresh(); }); });
    }

    setView('matter');
    void refresh();
    // Convergence poll: a login flow outlives the 5s request deadline, so vault transitions
    // (pending → signed-in, logout, supersession) must land without relying on a click's fetch settling.
    setInterval(() => { void refresh(); }, 2000);
  </script>
  <div id="sage-app-root" hidden></div>
  ${appScript}
</body>
</html>`
}
