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
    const capabilitySource = document.querySelector('#capability-source');
    const capabilityRows = document.querySelector('#capability-rows');
    const capabilityNote = document.querySelector('#capability-note');
    const modelRows = document.querySelector('#model-rows');
    const modelTest = document.querySelector('#model-test');
    const modelNote = document.querySelector('#model-note');
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
    const draftLock = document.querySelector('#draft-lock');
    const draftInput = document.querySelector('#draft-input');
    const draftSend = document.querySelector('#draft-send');
    const draftNote = document.querySelector('#draft-note');
    const draftDetail = document.querySelector('#draft-detail');
    const draftGoal = document.querySelector('#draft-goal');
    const draftDeliverable = document.querySelector('#draft-deliverable');
    const draftResponsibility = document.querySelector('#draft-responsibility');
    const draftResponsibilityNote = document.querySelector('#draft-responsibility-note');
    const draftProject = document.querySelector('#draft-project');
    const draftClarification = document.querySelector('#draft-clarification');
    const draftSave = document.querySelector('#draft-save');
    const draftHistory = document.querySelector('#draft-history');
    const draftHistoryNote = document.querySelector('#draft-history-note');
    const siteTemplateNote = document.querySelector('#site-template-note');
    const siteTemplateRows = document.querySelector('#site-template-rows');
    const draftConfirm = document.querySelector('#draft-confirm');
    const draftAttemptNote = document.querySelector('#draft-attempt');
    const draftReconcile = document.querySelector('#draft-reconcile');
    const draftCancelConfirm = document.querySelector('#draft-cancel');
    const draftResult = document.querySelector('#draft-result');
    const draftMatters = document.querySelector('#draft-matters');
    const draftConfirmation = document.querySelector('#draft-confirmation');
    const confirmTarget = document.querySelector('#confirm-target');
    const confirmAction = document.querySelector('#confirm-action');
    const confirmScope = document.querySelector('#confirm-scope');
    const confirmResources = document.querySelector('#confirm-resources');
    const confirmTime = document.querySelector('#confirm-time');
    const confirmPrerequisites = document.querySelector('#confirm-prerequisites');
    const confirmCost = document.querySelector('#confirm-cost');
    const draftConfirmExecute = document.querySelector('#draft-confirm-execute');
    const draftConfirmCancel = document.querySelector('#draft-confirm-cancel');
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
    const actionItemNote = document.querySelector('#action-item-note');
    const actionItemTitle = document.querySelector('#action-item-title');
    const actionItemBody = document.querySelector('#action-item-body');
    const actionItemCreate = document.querySelector('#action-item-create');
    const actionItemRows = document.querySelector('#action-item-rows');
    const actionRecordNote = document.querySelector('#action-record-note');
    const actionRecordRows = document.querySelector('#action-record-rows');
    const correctionOriginal = document.querySelector('#correction-original');
    const correctionText = document.querySelector('#correction-text');
    const correctionSubmit = document.querySelector('#correction-submit');
    const correctionNote = document.querySelector('#correction-note');
    const correctionRows = document.querySelector('#correction-rows');
    const projectName = document.querySelector('#project-name');
    const projectCreate = document.querySelector('#project-create');
    const projectSelect = document.querySelector('#project-select');
    const projectAssign = document.querySelector('#project-assign');
    const projectUnassign = document.querySelector('#project-unassign');
    const projectNote = document.querySelector('#project-note');
    const projectRows = document.querySelector('#project-rows');
    const matterAdminGround = document.querySelector('#matter-admin-ground');
    const matterAdminArchive = document.querySelector('#matter-admin-archive');
    const matterAdminRestore = document.querySelector('#matter-admin-restore');
    const matterAdminNote = document.querySelector('#matter-admin-note');
    const matterAdminRows = document.querySelector('#matter-admin-rows');
    const matterAdminBatchRows = document.querySelector('#matter-admin-batch-rows');
    const matterAdminRenameTitle = document.querySelector('#matter-admin-rename-title');
    const matterAdminRename = document.querySelector('#matter-admin-rename');
    const matterAdminRenameNote = document.querySelector('#matter-admin-rename-note');
    const matterAdminTrail = document.querySelector('#matter-admin-trail');
    const matterGroupsName = document.querySelector('#matter-groups-name');
    const matterGroupsCreate = document.querySelector('#matter-groups-create');
    const matterGroupsRows = document.querySelector('#matter-groups-rows');
    const matterGroupsList = document.querySelector('#matter-groups-list');
    const matterGroupsRenameTitle = document.querySelector('#matter-groups-rename-title');
    const matterGroupsRename = document.querySelector('#matter-groups-rename');
    const matterGroupsRemove = document.querySelector('#matter-groups-remove');
    const matterGroupsAdd = document.querySelector('#matter-groups-add');
    const matterGroupsRemoveMembers = document.querySelector('#matter-groups-remove-members');
    const matterGroupsNote = document.querySelector('#matter-groups-note');
    const matterGroupsReadback = document.querySelector('#matter-groups-readback');
    const matterGroupsBatchRows = document.querySelector('#matter-groups-batch-rows');
    const matterGroupsTrail = document.querySelector('#matter-groups-trail');
    const planTitle = document.querySelector('#plan-title');
    const planSteps = document.querySelector('#plan-steps');
    const planCreate = document.querySelector('#plan-create');
    const planNote = document.querySelector('#plan-note');
    const planRows = document.querySelector('#plan-rows');
    const planStepDetail = document.querySelector('#plan-step-detail');
    const planStepNote = document.querySelector('#plan-step-note');
    const planStepRows = document.querySelector('#plan-step-rows');
    const planStepCard = document.querySelector('#plan-step-card');
    const planStepTarget = document.querySelector('#plan-step-target');
    const planStepAction = document.querySelector('#plan-step-action');
    const planStepScope = document.querySelector('#plan-step-scope');
    const planStepResources = document.querySelector('#plan-step-resources');
    const planStepTime = document.querySelector('#plan-step-time');
    const planStepPrereq = document.querySelector('#plan-step-prereq');
    const planStepCost = document.querySelector('#plan-step-cost');
    const planStepExecute = document.querySelector('#plan-step-execute');
    const planStepCancel = document.querySelector('#plan-step-cancel');
    const planStepResult = document.querySelector('#plan-step-result');
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
    const linkMatter = document.querySelector('#link-matter');
    const linkWorkspace = document.querySelector('#link-workspace');
    const linkAdd = document.querySelector('#link-add');
    const linkRemove = document.querySelector('#link-remove');
    const linkDefault = document.querySelector('#link-default');
    const linkNote = document.querySelector('#link-note');
    const linkRows = document.querySelector('#link-rows');
    const linkTrail = document.querySelector('#link-trail');
    const sessionIdNode = document.querySelector('#session-id');
    const sessionSendState = document.querySelector('#session-send-state');
    const sessionExecution = document.querySelector('#session-execution');
    const sessionInput = document.querySelector('#session-input');
    const sessionSend = document.querySelector('#session-send');
    const sessionMode = document.querySelector('#session-mode');
    const queueRows = document.querySelector('#queue-rows');
    const queueNote = document.querySelector('#queue-note');
    const historyRead = document.querySelector('#history-read');
    const historyMore = document.querySelector('#history-more');
    const historyNote = document.querySelector('#history-note');
    const historyRows = document.querySelector('#history-rows');
    const historyDetail = document.querySelector('#history-detail');
    const historyDetailModel = document.querySelector('#history-detail-model');
    const historyDetailNote = document.querySelector('#history-detail-note');
    const historyDetailUsers = document.querySelector('#history-detail-users');
    const historyDetailOutput = document.querySelector('#history-detail-output');
    const historyDetailClarifications = document.querySelector('#history-detail-clarifications');
    const clarificationNote = document.querySelector('#clarification-note');
    const clarificationCards = document.querySelector('#clarification-cards');
    const clarificationDeferred = document.querySelector('#clarification-deferred');
    const clarificationReceipts = document.querySelector('#clarification-receipts');
    const feedbackText = document.querySelector('#feedback-text');
    const feedbackCode = document.querySelector('#feedback-code');
    const feedbackStage = document.querySelector('#feedback-stage');
    const feedbackSubmit = document.querySelector('#feedback-submit');
    const feedbackNote = document.querySelector('#feedback-note');
    const feedbackReceipts = document.querySelector('#feedback-receipts');
    const terminalNote = document.querySelector('#terminal-note');
    const terminalRows = document.querySelector('#terminal-rows');
    const terminalOutput = document.querySelector('#terminal-output');
    const terminalOutputNote = document.querySelector('#terminal-output-note');
    const modelQueueNote = document.querySelector('#model-queue-note');
    const modelQueueRows = document.querySelector('#model-queue-rows');
    const approvalNote = document.querySelector('#approval-note');
    const approvalCards = document.querySelector('#approval-cards');
    const approvalLapsed = document.querySelector('#approval-lapsed');
    const approvalReceipts = document.querySelector('#approval-receipts');
    const anchorRead = document.querySelector('#anchor-read');
    const anchorNote = document.querySelector('#anchor-note');
    const anchorRows = document.querySelector('#anchor-rows');
    const anchorPreview = document.querySelector('#anchor-preview');
    const anchorPreviewText = document.querySelector('#anchor-preview-text');
    const anchorLocate = document.querySelector('#anchor-locate');
    const anchorPreviewClose = document.querySelector('#anchor-preview-close');
    const editTarget = document.querySelector('#edit-target');
    const editInput = document.querySelector('#edit-input');
    const editSave = document.querySelector('#edit-save');
    const editNote = document.querySelector('#edit-note');
    const editRows = document.querySelector('#edit-rows');
    const sessionNote = document.querySelector('#session-note');
    const replyActions = document.querySelector('#reply-actions');
    const selectionNote = document.querySelector('#selection-note');
    const selectionSkills = document.querySelector('#selection-skills');
    const selectionPlugins = document.querySelector('#selection-plugins');
    const selectionChips = document.querySelector('#selection-chips');
    const planModeBar = document.querySelector('#plan-mode-bar');
    const planModeGoal = document.querySelector('#plan-mode-goal');
    const planModePlan = document.querySelector('#plan-mode-plan');
    const planModeNote = document.querySelector('#plan-mode-note');
    const replyNote = document.querySelector('#reply-note');
    const suggestionNote = document.querySelector('#suggestion-note');
    const suggestionChips = document.querySelector('#suggestion-chips');
    const sessionTranscript = document.querySelector('#session-transcript');
    const sessionStop = document.querySelector('#session-stop');
    const sessionResume = document.querySelector('#session-resume');
    const pendingNote = document.querySelector('#pending-note');
    const pendingRows = document.querySelector('#pending-rows');
    const attachmentPick = document.querySelector('#attachment-pick');
    const attachmentNote = document.querySelector('#attachment-note');
    const attachmentItems = document.querySelector('#attachment-items');
    const sideChatCreate = document.querySelector('#side-chat-create');
    const sideChatNote = document.querySelector('#side-chat-note');
    const sideChatRows = document.querySelector('#side-chat-rows');
    const sideChatView = document.querySelector('#side-chat-view');
    const sideChatViewLabel = document.querySelector('#side-chat-view-label');
    const sideChatTranscript = document.querySelector('#side-chat-transcript');
    const sideChatInput = document.querySelector('#side-chat-input');
    const sideChatSend = document.querySelector('#side-chat-send');
    const sideChatReturn = document.querySelector('#side-chat-return');
    const sideChatViewClose = document.querySelector('#side-chat-view-close');
    const sideChatViewNote = document.querySelector('#side-chat-view-note');
    let sideChatLocalNotice = null;
    let currentSideChatId = null;
    const navMatterCount = document.querySelector('#nav-matter-count');
    const matterListAll = document.querySelector('#matter-list-all');
    const matterListNote = document.querySelector('#matter-list-note');
    const matterCountAction = document.querySelector('#matter-count-action');
    const matterRowsAction = document.querySelector('#matter-rows-action');
    const matterCountProgress = document.querySelector('#matter-count-progress');
    const matterRowsProgress = document.querySelector('#matter-rows-progress');
    const matterCountAcceptance = document.querySelector('#matter-count-acceptance');
    const matterAcceptanceNote = document.querySelector('#matter-acceptance-note');
    const searchInput = document.querySelector('#search-input');
    const searchRun = document.querySelector('#search-run');
    const searchNote = document.querySelector('#search-note');
    const searchMatterRows = document.querySelector('#search-matter-rows');
    const searchSessionState = document.querySelector('#search-session-state');
    const searchSessionRows = document.querySelector('#search-session-rows');
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
    const modelConfigReasonNotes = {
      'not-read': '未核验：还没有读到配置文档。',
      'bridge-unavailable': '未核验：读取配置需要的能力运行时当前不可用。',
      'bridge-refused': '未核验：读取配置的请求被拒绝了。',
      'not-plain-data': '未核验：配置文档的形状不认识，已按不可信拒绝采用。',
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
    const capabilityReasonNotes = {
      'observation-not-read': '未核验：还没有读到运行时的清单，无法判断任何一项的状态。',
      'registry-service-absent': '未核验：这一版运行时没有提供目录服务，因此没有清单可读。',
      'invalid-roster': '未核验：运行时返回的清单不完整，已按不可信拒绝采用。',
      'observation-failed': '未核验：读取运行时清单时失败，稍后会再读一次。',
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
    // 002：草案面。字段只由用户输入写；确认按钮只在三项必填都有内容时可用；已建项只说服务回执。
    let currentDraftId = null;
    let draftRevision = null;
    // 004（US-008）：责任默认值的注入账。默认只在表单面提供、来源是 main 的登录投影；这两个变量
    // 记住「上次注入的默认值」与「注入所依据的版本」，以便身份态变化时重算且不覆盖用户正在输入的文本。
    let draftResponsibilityRevision = null;
    let draftResponsibilityDefaultShown = null;
    // 025：已展开的执行前确认卡（含它所属的草案）。它只在卡片自己的「确认执行」点击后被消费；
    // 2s 轮询不清它（只有换草案、取消或该草案已建项才清）。
    let pendingDraftConfirmation = null;
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
    let actionItemLocalNotice = null;
    let currentActionItemId = null;
    let correctionLocalNotice = null;
    let correctionOriginals = [];
    let correctionOriginalsSignature = '';
    let selectedOriginalIndex = 0;
    let projectLocalNotice = null;
    // 029：事项管理面。选择集是本页本地的（复选框），批量结果与重命名回读来自投影；
    // 拒绝提示走 local-notice 守卫。归档状态本身由 022 的列表生命周期消费。
    let matterAdminLocalNotice = null;
    let matterAdminRenameLocalNotice = null;
    const matterAdminSelected = new Set();
    let matterGroupsLocalNotice = null;
    const matterGroupsSelected = new Set();
    let matterGroupsPicked = null;
    // 031：监控面。面板开合是本地视图状态（不发请求、不取消运行）；日志游标本页保留。
    let runLogCursor = null;
    // 032：方案面。接受回执与步骤执行结果都从投影读；被拒绝的代码走 local-notice 守卫。
    let planLocalNotice = null;
    let currentPlanId = null;
    let pendingPlanStep = null;
    let planStepLocalNotice = null;
    // 退出检查：影响清单由投影事实＋本页真实未保存内容合成；对话框开合只在本页。
    let exitDialogOpen = false;
    let exitLocalNotice = null;
    // A local refusal (e.g. "nothing chosen yet") must survive the 2s poll: the poll only writes
    // its own sentence while no local notice is pending.
    let draftLocalNotice = null;
    let siteTemplateLocalNotice = null;
    let linkLocalNotice = null;
    let sessionLocalNotice = null;
    let attachmentLocalNotice = null;
    let queueLocalNotice = null;
    let historyLocalNotice = null;
    let clarificationLocalNotice = null;
    let approvalLocalNotice = null;
    let modelQueueLocalNotice = null;
    let terminalLocalNotice = null;
    let feedbackLocalNotice = null;
    let terminalOpenedId = null;
    let anchorLocalNotice = null;
    let anchorSelected = null;
    let editLocalNotice = null;
    let editTargetRef = null;
    let replyLocalNotice = null;
    let suggestionLocalNotice = null;
    let selectionLocalNotice = null;
    let planModeLocalNotice = null;
    let autoDetailKey = null;
    let searchLocalNotice = null;
    let searchInFlight = false;
    // The last state payload, kept for click handlers that need a workspace lookup at send time.
    let lastStatePayload = null;
    /** The matter and its environment as the page's own selects express them; null when incomplete.
     *  Shared by the send click and the attachment acts so none of them invents either. */
    function currentSendContext() {
      const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
      const workspaceRef = linkWorkspace !== null && typeof linkWorkspace.value === 'string' ? linkWorkspace.value : '';
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
    function renderDraftConfirmation() {
      if (draftConfirmation === null) return;
      const pending = pendingDraftConfirmation;
      const show = pending !== null && currentDraftId !== null && pending.draftId === currentDraftId
        && pending.card !== null && typeof pending.card === 'object';
      draftConfirmation.hidden = !show;
      if (!show) {
        if (draftConfirmExecute !== null) draftConfirmExecute.disabled = false;
        return;
      }
      const card = pending.card;
      const target = card.target !== null && typeof card.target === 'object' ? card.target : {};
      const action = card.action !== null && typeof card.action === 'object' ? card.action : {};
      if (confirmTarget !== null) confirmTarget.textContent = String(target.matterRef ?? '—') + '（修订 ' + String(target.revisionRef ?? '—') + '）';
      if (confirmAction !== null) confirmAction.textContent = String(action.type ?? '—');
      if (confirmScope !== null) confirmScope.textContent = action.scope === 'matter' ? '整个事项（matter）' : '本修订（revision）';
      if (confirmResources !== null) {
        const resources = Array.isArray(card.resources) ? card.resources : [];
        confirmResources.textContent = resources.length === 0 ? '无' : resources.map((entry) => {
          const item = entry !== null && typeof entry === 'object' ? entry : {};
          const ref = typeof item.ref === 'string' && item.ref !== '' ? item.ref : '未选定';
          return String(item.kind ?? '资源') + '：' + ref;
        }).join('；');
      }
      if (confirmTime !== null) confirmTime.textContent = typeof card.preparedAt === 'string' ? card.preparedAt : '—';
      if (confirmPrerequisites !== null) {
        const prerequisites = Array.isArray(card.prerequisites) ? card.prerequisites : [];
        confirmPrerequisites.textContent = prerequisites.length === 0 ? '无附加前提' : prerequisites.map((entry) => {
          const item = entry !== null && typeof entry === 'object' ? entry : {};
          const wording = item.state === 'met' ? '已满足' : item.state === 'unmet' ? '未满足' : '未断言（派发前逐次重验）';
          return String(item.name ?? '前提') + '：' + wording;
        }).join('；');
      }
      if (confirmCost !== null) {
        const cost = card.costEstimate !== null && typeof card.costEstimate === 'object' ? card.costEstimate : null;
        confirmCost.textContent = cost === null || cost.state !== 'estimate'
          ? '暂不可得（本版没有费用预估来源——不冒充数字）'
          : String(cost.amount) + ' ' + String(cost.currency);
      }
    }

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

    function correctionReceiptText(receipt) {
      if (receipt === null || typeof receipt !== 'object') return '回执未知';
      if (receipt.state === 'received') return '已接收（受理回执；受理不等于生效）';
      if (receipt.state === 'pending-application') {
        const reason = receipt.reason === 'queued' ? '在队列中' : receipt.reason === 'deferred' ? '在待继续中' : '尚未观察到消费读数';
        return '待应用（' + reason + '，等一次安全派发）';
      }
      if (receipt.state === 'effective') return '已生效（队列消费读数；不撤销既有外部效果、不重放旧动作）';
      if (receipt.state === 'refused') return '被拒绝（' + String(receipt.code) + '）';
      return '回执未知';
    }

    function renderActionItems(payload) {
      if (actionItemRows === null) return;
      const status = actionItemsOf(payload);
      if (status.state !== 'read') {
        actionItemRows.textContent = '';
        if (actionRecordRows !== null) actionRecordRows.textContent = '';
        if (actionRecordNote !== null) actionRecordNote.textContent = '';
        if (correctionRows !== null) correctionRows.textContent = '';
        if (actionItemNote !== null && actionItemLocalNotice === null) actionItemNote.textContent = '未核验：这一版还没有接上行动项存储。';
        return;
      }
      actionItemRows.textContent = '';
      const items = status.items;
      const current = items.find((entry) => entry !== null && typeof entry === 'object' && entry.actionId === currentActionItemId)
        ?? items[items.length - 1];
      for (const entry of items) {
        if (entry === null || typeof entry !== 'object' || typeof entry.actionId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.actionItemId = entry.actionId;
        const title = document.createElement('strong');
        title.textContent = typeof entry.title === 'string' ? entry.title : entry.actionId;
        row.appendChild(title);
        const stateTag = document.createElement('span');
        stateTag.className = 'sage-roster-tag ' + (entry.state === 'done' ? 'is-ok' : '');
        stateTag.textContent = entry.state === 'done' ? '已完成（≠交付验收）' : entry.state === 'in-progress' ? '进行中' : '未开始';
        row.appendChild(stateTag);
        const revisionTag = document.createElement('span');
        revisionTag.className = 'sage-roster-tag';
        revisionTag.textContent = '第 ' + String(entry.revision) + ' 版 · 记录 ' + String(Array.isArray(entry.records) ? entry.records.length : 0) + ' 次';
        row.appendChild(revisionTag);
        if (entry.state !== 'done') {
          const startButton = document.createElement('button');
          startButton.className = 'sage-row-button';
          startButton.type = 'button';
          startButton.dataset.actionItemAction = 'start';
          startButton.textContent = '登记一次执行';
          row.appendChild(startButton);
        }
        const doneButton = document.createElement('button');
        doneButton.className = 'sage-row-button';
        doneButton.type = 'button';
        doneButton.dataset.actionItemAction = 'complete';
        doneButton.textContent = '标记完成';
        row.appendChild(doneButton);
        actionItemRows.appendChild(row);
      }
      if (current === undefined || current === null || typeof current !== 'object') {
        currentActionItemId = null;
        if (actionRecordRows !== null) actionRecordRows.textContent = '';
        if (actionRecordNote !== null) actionRecordNote.textContent = '';
      } else {
        currentActionItemId = current.actionId;
        if (actionRecordNote !== null) {
          const records = Array.isArray(current.records) ? current.records : [];
          actionRecordNote.textContent = records.length === 0
            ? '「' + String(current.title) + '」还没有执行记录——完成只是状态变更，不代表执行成功。'
            : '「' + String(current.title) + '」的执行记录（冻结登记当时的依据版本）：';
        }
        if (actionRecordRows !== null) {
          actionRecordRows.textContent = '';
          const records = Array.isArray(current.records) ? current.records : [];
          for (const record of records) {
            if (record === null || typeof record !== 'object') continue;
            const basis = record.basis !== null && typeof record.basis === 'object' ? record.basis : {};
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.recordNo = String(record.recordNo ?? '');
            const no = document.createElement('span');
            no.className = 'sage-roster-tag';
            no.textContent = '第 ' + String(record.recordNo ?? '?') + ' 次';
            row.appendChild(no);
            const basisTag = document.createElement('span');
            basisTag.textContent = '依据 第 ' + String(basis.revision ?? '?') + ' 版：「' + String(basis.title ?? '') + '」' + (typeof basis.note === 'string' && basis.note !== '' ? ' · ' + basis.note : '');
            row.appendChild(basisTag);
            const at = document.createElement('span');
            at.className = 'sage-roster-tag';
            at.textContent = typeof record.at === 'string' ? record.at : '';
            row.appendChild(at);
            actionRecordRows.appendChild(row);
          }
        }
      }
      if (correctionRows !== null) {
        correctionRows.textContent = '';
        for (const entry of status.corrections) {
          if (entry === null || typeof entry !== 'object' || typeof entry.correctionId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.correctionId = entry.correctionId;
          const text = document.createElement('strong');
          text.textContent = typeof entry.text === 'string' ? entry.text : entry.correctionId;
          row.appendChild(text);
          const original = entry.original !== null && typeof entry.original === 'object' ? entry.original : {};
          const originalTag = document.createElement('span');
          originalTag.className = 'sage-roster-tag';
          originalTag.textContent = '关联原要求：「' + String(original.text ?? '') + '」' + (typeof original.at === 'string' ? ' · ' + original.at : '');
          row.appendChild(originalTag);
          const receiptTag = document.createElement('span');
          receiptTag.className = 'sage-roster-tag ' + (entry.receipt !== null && typeof entry.receipt === 'object' && entry.receipt.state === 'effective' ? 'is-ok' : entry.receipt !== null && typeof entry.receipt === 'object' && entry.receipt.state === 'refused' ? 'is-blocked' : '');
          receiptTag.textContent = correctionReceiptText(entry.receipt);
          row.appendChild(receiptTag);
          correctionRows.appendChild(row);
        }
      }
      // 原要求候选＝会话投影里已发送的 user 条目。签名守卫：会话没变就不重填，别吞掉用户的选择。
      if (correctionOriginal !== null) {
        const channel = payload !== null && typeof payload === 'object' && payload.sessionChannel !== null && typeof payload.sessionChannel === 'object'
          ? payload.sessionChannel : null;
        const transcript = channel !== null && Array.isArray(channel.transcript) ? channel.transcript : [];
        const originals = transcript
          .filter((entry) => entry !== null && typeof entry === 'object' && entry.role === 'user' && typeof entry.text === 'string' && entry.text !== '')
          .map((entry) => ({ text: entry.text, at: typeof entry.at === 'string' ? entry.at : null }));
        const signature = originals.map((entry) => entry.at + '\\u0000' + entry.text).join('\\u0001');
        if (signature !== correctionOriginalsSignature) {
          correctionOriginalsSignature = signature;
          correctionOriginals = originals;
          correctionOriginal.textContent = '';
          if (originals.length === 0) {
            const option = document.createElement('option');
            option.value = 'none';
            option.textContent = '（还没有已发送的消息）';
            correctionOriginal.appendChild(option);
            selectedOriginalIndex = 0;
          } else {
            originals.forEach((entry, index) => {
              const option = document.createElement('option');
              option.value = String(index);
              option.textContent = entry.text.length > 40 ? entry.text.slice(0, 40) + '…' : entry.text;
              correctionOriginal.appendChild(option);
            });
            if (selectedOriginalIndex >= originals.length) selectedOriginalIndex = originals.length - 1;
            correctionOriginal.value = String(selectedOriginalIndex);
          }
        }
      }
    }

    function renderProjects(payload) {
      if (projectRows === null) return;
      const slot = payload !== null && typeof payload === 'object' ? payload.projects : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      if (state !== 'read') {
        projectRows.textContent = '';
        if (projectSelect !== null) projectSelect.textContent = '';
        if (projectNote !== null && projectLocalNotice === null) projectNote.textContent = '未核验：这一版还没有接上项目存储。';
        return;
      }
      const projects = Array.isArray(slot.projects) ? slot.projects : [];
      const selected = projectSelect !== null && typeof projectSelect.value === 'string' ? projectSelect.value : '';
      if (projectSelect !== null) {
        projectSelect.textContent = '';
        for (const entry of projects) {
          if (entry === null || typeof entry !== 'object' || typeof entry.projectRef !== 'string') continue;
          const option = document.createElement('option');
          option.value = entry.projectRef;
          option.textContent = (typeof entry.name === 'string' ? entry.name : entry.projectRef) + '（' + String(Array.isArray(entry.matterRefs) ? entry.matterRefs.length : 0) + ' 个事项）';
          projectSelect.appendChild(option);
        }
        if (projects.length === 0) {
          const option = document.createElement('option');
          option.value = 'none';
          option.textContent = '（还没有项目）';
          projectSelect.appendChild(option);
        } else if (selected !== '' && projects.some((entry) => entry !== null && typeof entry === 'object' && entry.projectRef === selected)) {
          projectSelect.value = selected;
        }
      }
      projectRows.textContent = '';
      for (const entry of projects) {
        if (entry === null || typeof entry !== 'object' || typeof entry.projectRef !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.projectRef = entry.projectRef;
        const name = document.createElement('strong');
        name.textContent = typeof entry.name === 'string' ? entry.name : entry.projectRef;
        row.appendChild(name);
        const count = document.createElement('span');
        count.className = 'sage-roster-tag';
        count.textContent = String(Array.isArray(entry.matterRefs) ? entry.matterRefs.length : 0) + ' 个事项（引用同一事项记录，复制不了事实）';
        row.appendChild(count);
        const refs = document.createElement('span');
        refs.className = 'sage-roster-tag';
        refs.textContent = Array.isArray(entry.matterRefs) && entry.matterRefs.length > 0 ? entry.matterRefs.join('、') : '（暂无归属事项）';
        row.appendChild(refs);
        projectRows.appendChild(row);
      }
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

    function renderMatterAdmin(payload) {
      if (matterAdminRows === null) return;
      const slot = payload !== null && typeof payload === 'object' ? payload.matterAdmin : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList : null;
      const items = list !== null && Array.isArray(list.items) ? list.items : [];
      if (state !== 'read') {
        matterAdminRows.textContent = '';
        if (matterAdminBatchRows !== null) matterAdminBatchRows.textContent = '';
        if (matterAdminTrail !== null) matterAdminTrail.textContent = '';
        if (matterAdminNote !== null && matterAdminLocalNotice === null) matterAdminNote.textContent = '未核验：这一版还没有接上事项管理存储。';
        return;
      }
      const archivedRefs = new Set(
        (Array.isArray(slot.entries) ? slot.entries : [])
          .filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.matterRef === 'string')
          .map((entry) => entry.matterRef),
      );
      matterAdminRows.textContent = '';
      for (const item of items) {
        if (item === null || typeof item !== 'object' || typeof item.matterRef !== 'string' || item.matterRef === '') continue;
        const ref = item.matterRef;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.matterAdminRef = ref;
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'sage-history-toggle';
        toggle.dataset.matterAdminToggle = ref;
        toggle.checked = matterAdminSelected.has(ref);
        toggle.setAttribute('aria-label', '选择这项');
        row.appendChild(toggle);
        const name = document.createElement('strong');
        name.textContent = typeof item.title === 'string' ? item.title : ref;
        row.appendChild(name);
        const refTag = document.createElement('span');
        refTag.className = 'sage-roster-tag';
        refTag.textContent = ref;
        row.appendChild(refTag);
        const stateTag = document.createElement('span');
        stateTag.className = 'sage-roster-tag ' + (archivedRefs.has(ref) ? 'is-blocked' : '');
        stateTag.textContent = archivedRefs.has(ref) ? '已归档（可恢复；≠停止执行）' : '活动';
        row.appendChild(stateTag);
        matterAdminRows.appendChild(row);
      }
      // 批量结果：逐项行＋计数；任何情况下都没有「整体成功」的话。
      if (matterAdminBatchRows !== null) {
        matterAdminBatchRows.textContent = '';
        const batch = slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null;
        if (batch !== null && Array.isArray(batch.rows)) {
          const summary = document.createElement('li');
          summary.className = 'sage-roster-row';
          summary.textContent = (batch.operation === 'archive' ? '批量归档' : '批量恢复') + '逐项结果：共 ' + String(batch.rows.length)
            + ' 项，成功 ' + String(batch.okCount ?? 0) + '、拒绝 ' + String(batch.refusedCount ?? 0) + '（逐项为准，无整体成功）。';
          matterAdminBatchRows.appendChild(summary);
          for (const entry of batch.rows) {
            if (entry === null || typeof entry !== 'object' || typeof entry.matterRef !== 'string') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.batchRef = entry.matterRef;
            const ref = document.createElement('span');
            ref.className = 'sage-roster-tag';
            ref.textContent = entry.matterRef;
            row.appendChild(ref);
            const verdict = document.createElement('span');
            verdict.className = 'sage-roster-tag ' + (entry.outcome === 'ok' ? 'is-ok' : 'is-blocked');
            verdict.textContent = entry.outcome === 'ok' ? '该项成功' : '该项拒绝：' + matterAdminRefusalText(entry.code);
            row.appendChild(verdict);
            matterAdminBatchRows.appendChild(row);
          }
        }
      }
      // 重命名：显示服务回读的生效值；请求值只作对照。
      if (matterAdminRenameNote !== null) {
        const rename = slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null;
        if (matterAdminRenameLocalNotice !== null) {
          matterAdminRenameNote.textContent = matterAdminRenameLocalNotice;
        } else if (rename !== null && typeof rename.effective === 'string') {
          matterAdminRenameNote.textContent = '请求「' + String(rename.requested) + '」→ 服务回读生效「' + rename.effective + '」（显示的是实际生效值）。';
        } else {
          matterAdminRenameNote.textContent = '';
        }
      }
      if (matterAdminTrail !== null) {
        matterAdminTrail.textContent = '';
        const trail = Array.isArray(slot.trail) ? slot.trail : [];
        for (const record of trail.slice(-6)) {
          if (record === null || typeof record !== 'object') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.textContent = (record.action === 'archive' ? '归档' : '恢复') + ' ' + String(record.matterRef)
            + (typeof record.ground === 'string' ? '（依据：' + record.ground + '，声明）' : '') + ' · ' + String(record.at ?? '');
          matterAdminTrail.appendChild(row);
        }
      }
    }

    // 049：任务分组。事项行与分组行都来自同一批既有事实；分组只改变列表组织（不改变事实、可见范围、责任或权限）。
    function matterGroupsRefusalText(code) {
      const notes = {
        'group-name-invalid': '分组名称需要 1–120 字。',
        'batch-size-invalid': '批量一次 1–32 项。',
        'group-unknown': '这个分组查不到——操作不会隐式建组，也不做枚举。',
        'item-unknown': '这项在事项列表里查不到——未知与无权同码，不做枚举。',
        'matter-groups-unavailable': '这一版还没有接上任务分组存储。',
      };
      return notes[code] ?? ('操作被拒绝（' + String(code) + '）。');
    }

    function renderMatterGroups(payload) {
      if (matterGroupsRows === null) return;
      const slot = payload !== null && typeof payload === 'object' ? payload.matterGroups : null;
      const state = slot !== null && typeof slot === 'object' && typeof slot.state === 'string' ? slot.state : 'unavailable';
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList : null;
      const items = list !== null && Array.isArray(list.items) ? list.items : [];
      if (state !== 'read') {
        matterGroupsRows.textContent = '';
        if (matterGroupsList !== null) matterGroupsList.textContent = '';
        if (matterGroupsBatchRows !== null) matterGroupsBatchRows.textContent = '';
        if (matterGroupsTrail !== null) matterGroupsTrail.textContent = '';
        if (matterGroupsNote !== null && matterGroupsLocalNotice === null) {
          matterGroupsNote.textContent = '未核验：这一版还没有接上任务分组存储。';
        }
        return;
      }
      const groups = Array.isArray(slot.groups)
        ? slot.groups.filter((group) => group !== null && typeof group === 'object' && typeof group.groupId === 'string')
        : [];
      // 事项行：勾选用于成员批量；标签明示当前所属分组（组织可见，不改事实）。
      matterGroupsRows.textContent = '';
      for (const item of items) {
        if (item === null || typeof item !== 'object' || typeof item.itemId !== 'string' || item.itemId === '') continue;
        const itemId = item.itemId;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.matterGroupItem = itemId;
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'sage-history-toggle';
        toggle.dataset.matterGroupToggle = itemId;
        toggle.checked = matterGroupsSelected.has(itemId);
        toggle.setAttribute('aria-label', '选择这项');
        row.appendChild(toggle);
        const name = document.createElement('strong');
        name.textContent = typeof item.title === 'string' ? item.title : itemId;
        row.appendChild(name);
        const refTag = document.createElement('span');
        refTag.className = 'sage-roster-tag';
        refTag.textContent = itemId;
        row.appendChild(refTag);
        const mine = groups.filter((group) => Array.isArray(group.memberIds) && group.memberIds.includes(itemId));
        const groupTag = document.createElement('span');
        groupTag.className = 'sage-roster-tag';
        groupTag.textContent = mine.length === 0 ? '未分组' : '分组：' + mine.map((group) => typeof group.name === 'string' ? group.name : group.groupId).join('、');
        row.appendChild(groupTag);
        matterGroupsRows.appendChild(row);
      }
      // 分组行：单选用于改名／移除／成员批量；数量是回读的成员数。
      if (matterGroupsList !== null) {
        matterGroupsList.textContent = '';
        for (const group of groups) {
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.matterGroupRow = group.groupId;
          const pick = document.createElement('input');
          pick.type = 'checkbox';
          pick.className = 'sage-history-toggle';
          pick.dataset.matterGroupPick = group.groupId;
          pick.checked = matterGroupsPicked === group.groupId;
          pick.setAttribute('aria-label', '选择这个分组');
          row.appendChild(pick);
          const name = document.createElement('strong');
          name.textContent = typeof group.name === 'string' ? group.name : group.groupId;
          row.appendChild(name);
          const count = document.createElement('span');
          count.className = 'sage-roster-tag';
          count.textContent = String(Array.isArray(group.memberIds) ? group.memberIds.length : 0) + ' 项（回读）';
          row.appendChild(count);
          matterGroupsList.appendChild(row);
        }
      }
      // 成员批量：逐项行＋计数；任何情况下都没有「整体成功」的话。
      if (matterGroupsBatchRows !== null) {
        matterGroupsBatchRows.textContent = '';
        const batch = slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null;
        if (batch !== null && Array.isArray(batch.rows)) {
          const summary = document.createElement('li');
          summary.className = 'sage-roster-row';
          summary.textContent = '批量' + (batch.operation === 'add' ? '入组' : '移出') + '逐项结果：共 ' + String(batch.rows.length)
            + ' 项，成功 ' + String(batch.okCount ?? 0) + '、未变化 ' + String(batch.unchangedCount ?? 0) + '、拒绝 ' + String(batch.refusedCount ?? 0) + '（逐项为准，无整体成功）。';
          matterGroupsBatchRows.appendChild(summary);
          for (const entry of batch.rows) {
            if (entry === null || typeof entry !== 'object' || typeof entry.itemId !== 'string') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.groupBatchRef = entry.itemId;
            const ref = document.createElement('span');
            ref.className = 'sage-roster-tag';
            ref.textContent = entry.itemId;
            row.appendChild(ref);
            const verdict = document.createElement('span');
            verdict.className = 'sage-roster-tag ' + (entry.outcome === 'ok' ? 'is-ok' : entry.outcome === 'refused' ? 'is-blocked' : '');
            verdict.textContent = entry.outcome === 'ok' ? '该项已变更'
              : entry.outcome === 'unchanged' ? (entry.code === 'already-member' ? '未变化：已在该分组' : '未变化：不在该分组')
                : '该项拒绝：' + matterGroupsRefusalText(entry.code);
            row.appendChild(verdict);
            matterGroupsBatchRows.appendChild(row);
          }
        }
      }
      // 改名回读：显示实际生效值；请求值只作对照。本地提示优先（跨轮询保留）。
      if (matterGroupsReadback !== null) {
        if (matterGroupsLocalNotice !== null) {
          matterGroupsReadback.textContent = matterGroupsLocalNotice;
        } else {
          const rename = slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null;
          matterGroupsReadback.textContent = rename !== null && typeof rename.effective === 'string'
            ? '请求「' + String(rename.requested) + '」→ 回读生效「' + rename.effective + '」（显示的是实际生效值）。'
            : '';
        }
      }
      if (matterGroupsTrail !== null) {
        matterGroupsTrail.textContent = '';
        const labels = { create: '建立', rename: '改名', remove: '移除', 'add-members': '入组', 'remove-members': '移出' };
        const trail = Array.isArray(slot.trail) ? slot.trail : [];
        for (const record of trail.slice(-6)) {
          if (record === null || typeof record !== 'object') continue;
          const label = labels[record.action] ?? String(record.action);
          const withCount = record.action === 'create' || record.action === 'remove' || record.action === 'add-members' || record.action === 'remove-members';
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.textContent = label + '「' + String(record.name ?? record.groupId) + '」'
            + (withCount ? '（' + String(record.count ?? 0) + ' 项）' : '')
            + ' · ' + String(record.at ?? '');
          matterGroupsTrail.appendChild(row);
        }
      }
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

    function renderPlanStepCard() {
      if (planStepCard === null) return;
      const pending = pendingPlanStep;
      planStepCard.hidden = pending === null;
      if (pending === null) return;
      const card = pending.card;
      const target = card.target !== null && typeof card.target === 'object' ? card.target : {};
      const action = card.action !== null && typeof card.action === 'object' ? card.action : {};
      if (planStepTarget !== null) planStepTarget.textContent = String(target.matterRef ?? '—') + '（步骤 ' + String(pending.stepNo) + ' · ' + String(target.revisionRef ?? '') + '）';
      if (planStepAction !== null) planStepAction.textContent = String(action.type ?? '—');
      if (planStepScope !== null) planStepScope.textContent = action.scope === 'matter' ? '整个事项（matter）' : '本修订（revision）';
      if (planStepResources !== null) {
        const resources = Array.isArray(card.resources) ? card.resources : [];
        planStepResources.textContent = resources.length === 0 ? '无' : resources.map((entry) => String(entry?.kind ?? '资源') + '：' + (typeof entry?.ref === 'string' && entry.ref !== '' ? entry.ref : '未选定')).join('；');
      }
      if (planStepTime !== null) planStepTime.textContent = typeof card.preparedAt === 'string' ? card.preparedAt : '—';
      if (planStepPrereq !== null) {
        const prerequisites = Array.isArray(card.prerequisites) ? card.prerequisites : [];
        planStepPrereq.textContent = prerequisites.length === 0 ? '无附加前提' : prerequisites.map((entry) => String(entry?.name ?? '前提') + '：' + (entry?.state === 'met' ? '已满足' : '未断言（派发前逐次重验）')).join('；');
      }
      if (planStepCost !== null) planStepCost.textContent = '暂不可得（本版没有费用预估来源——不冒充数字）';
    }

    function renderPlanStepRun(run) {
      if (planStepResult === null) return;
      if (planStepLocalNotice !== null) {
        planStepResult.textContent = planStepLocalNotice;
        return;
      }
      planStepResult.textContent = run === null ? ''
        : run.state === 'settled' ? '该项已结算（完成的是这一步本身）：' + String(run.code ?? '（回执已在结果面）') + '——接受方案不等于执行方案，步骤结算也不等于整份方案完成。'
          : run.state === 'not-ready' ? '步骤执行未接线（' + String(run.code) + '）：没有伪造运行，也不消耗确认。'
            : run.state === 'unknown' ? '步骤结果未知（' + String(run.code) + '）：可能已发生——不要盲目重放，先核对。'
              : run.code === 'confirmation-required' ? '这次派发缺少执行前确认：请先展开步骤确认卡。'
                : run.code === 'confirmation-consumed' ? '这次确认已经用过了：一次确认只兑现一次派发，请重新准备。'
                  : run.code === 'confirmation-stale' ? '确认已失效：动作、前提或版本已变化——请重新准备。'
                    : run.code === 'step-premise-unknown' ? '前提未知：按阻断处理，旧的确认卡已作废，请重新准备。'
                      : run.code === 'step-not-ready' ? '步骤未就绪：按阻断处理，未派发。'
                        : '步骤被拒绝（' + String(run.code) + '）。';
    }

    function renderPlans(payload) {
      if (planRows === null) return;
      const status = plansOf(payload);
      if (status.state !== 'read') {
        planRows.textContent = '';
        if (planStepDetail !== null) planStepDetail.hidden = true;
        if (planNote !== null && planLocalNotice === null) planNote.textContent = '未核验：这一版还没有接上方案存储。';
        return;
      }
      planRows.textContent = '';
      const plans = status.plans;
      const current = plans.find((entry) => entry !== null && typeof entry === 'object' && entry.planId === currentPlanId) ?? plans[plans.length - 1];
      for (const entry of plans) {
        if (entry === null || typeof entry !== 'object' || typeof entry.planId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.planId = entry.planId;
        const name = document.createElement('strong');
        name.textContent = typeof entry.title === 'string' ? entry.title : entry.planId;
        row.appendChild(name);
        const stateTag = document.createElement('span');
        stateTag.className = 'sage-roster-tag ' + (entry.state === 'accepted' ? 'is-ok' : '');
        stateTag.textContent = entry.state === 'accepted'
          ? '已接受（回执 ' + String(entry.acceptedAt ?? '') + '；接受≠执行）'
          : '草稿';
        row.appendChild(stateTag);
        row.appendChild(document.createElement('span'));
        if (entry.state !== 'accepted') {
          const acceptButton = document.createElement('button');
          acceptButton.className = 'sage-row-button';
          acceptButton.type = 'button';
          acceptButton.dataset.planAction = 'accept';
          acceptButton.textContent = '接受方案（只记回执）';
          row.appendChild(acceptButton);
        }
        planRows.appendChild(row);
      }
      if (current === undefined || current === null || typeof current !== 'object') {
        currentPlanId = null;
        if (planStepDetail !== null) planStepDetail.hidden = true;
        if (planNote !== null && planLocalNotice === null) planNote.textContent = '还没有方案：写下标题与步骤（每行一条）形成方案。';
        return;
      }
      currentPlanId = current.planId;
      if (planStepDetail !== null) planStepDetail.hidden = false;
      if (planStepNote !== null) planStepNote.textContent = '「' + String(current.title) + '」的步骤（就绪按动作前提判断；未就绪或未知=阻断，不显示执行入口）：';
      if (planStepRows !== null) {
        planStepRows.textContent = '';
        const steps = Array.isArray(current.steps) ? current.steps : [];
        for (const step of steps) {
          if (step === null || typeof step !== 'object' || typeof step.stepNo !== 'number') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.planStepNo = String(step.stepNo);
          const no = document.createElement('span');
          no.className = 'sage-roster-tag';
          no.textContent = '步骤 ' + String(step.stepNo);
          row.appendChild(no);
          const name = document.createElement('strong');
          name.textContent = typeof step.title === 'string' ? step.title : '';
          row.appendChild(name);
          const badge = document.createElement('span');
          badge.className = 'sage-roster-tag ' + (step.readiness === 'ready' ? 'is-ok' : 'is-blocked');
          badge.textContent = step.readiness === 'ready' ? '就绪' : step.readiness === 'not-ready' ? '未就绪（阻断——不派发）' : '未知（阻断——不派发）';
          row.appendChild(badge);
          const note = document.createElement('span');
          note.textContent = typeof step.readinessNote === 'string' ? step.readinessNote : '';
          row.appendChild(note);
          if (step.readiness === 'ready') {
            const prepareButton = document.createElement('button');
            prepareButton.className = 'sage-row-button';
            prepareButton.type = 'button';
            prepareButton.dataset.planAction = 'prepare-step';
            prepareButton.dataset.stepNo = String(step.stepNo);
            prepareButton.textContent = '准备执行确认卡';
            row.appendChild(prepareButton);
          }
          planStepRows.appendChild(row);
        }
      }
      renderPlanStepCard();
      renderPlanStepRun(status.lastStepRun);
    }

    // 032：退出检查 / 引导 / 环境。影响清单＝投影事实＋本页真实未保存内容的合成。
    function unsavedDraftFields() {
      const payload = lastStatePayload;
      const draft = payload !== null && typeof payload === 'object' ? payload.draft : null;
      const drafts = draft !== null && typeof draft === 'object' && Array.isArray(draft.drafts) ? draft.drafts : [];
      const current = drafts.find((entry) => entry !== null && typeof entry === 'object' && entry.draftId === currentDraftId) ?? drafts[drafts.length - 1];
      if (current === undefined || current === null || typeof current !== 'object') return [];
      const pairs = [
        ['目标', draftGoal, current.fields?.goal],
        ['预期交付', draftDeliverable, current.fields?.deliverable],
        ['责任', draftResponsibility, current.fields?.responsibility],
        ['项目', draftProject, current.fields?.projectRef],
        ['澄清', draftClarification, current.clarification],
      ];
      return pairs.filter(([, node, saved]) => node !== null && typeof node.value === 'string' && node.value !== (typeof saved === 'string' ? saved : '')).map(([label]) => label);
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
    function renderSiteTemplates(payload) {
      if (siteTemplateNote === null && siteTemplateRows === null) return;
      const catalog = payload !== null && typeof payload === 'object' && payload.siteTemplates !== null && typeof payload.siteTemplates === 'object'
        ? payload.siteTemplates
        : null;
      const read = catalog !== null && catalog.state === 'read';
      const entries = read && Array.isArray(catalog.entries) ? catalog.entries : [];
      if (siteTemplateNote !== null && siteTemplateLocalNotice === null) {
        siteTemplateNote.textContent = catalog === null || catalog.state === 'unavailable'
          ? '未核验：模板目录不可用（' + String(catalog?.reason ?? 'site-templates-provider-unavailable') + '）；不以空列表冒充，也不静默替换。'
          : entries.length === 0
            ? '模板目录可读，但当前没有条目（不把可读的空目录说成"没有模板源"）。'
            : '共 ' + String(entries.length) + ' 项（来源与版本见行内）；选择只填入本次草案输入，不建站、不写配置。';
      }
      if (siteTemplateRows !== null) {
        siteTemplateRows.textContent = '';
        for (const entry of read ? entries : []) {
          if (entry === null || typeof entry !== 'object' || typeof entry.templateId !== 'string' || typeof entry.name !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.siteTemplateRow = entry.templateId;
          const name = document.createElement('strong');
          name.textContent = entry.name;
          row.appendChild(name);
          const provenance = document.createElement('span');
          provenance.className = 'sage-roster-tag';
          provenance.textContent = '来源：' + String(entry.source ?? '未标注') + ' · 版本：' + String(entry.version ?? '未标注');
          row.appendChild(provenance);
          if (typeof entry.prompt === 'string' && entry.prompt !== '') {
            const use = document.createElement('button');
            use.className = 'sage-row-button';
            use.type = 'button';
            use.dataset.siteTemplateUse = entry.templateId;
            use.textContent = '使用（填入草案输入）';
            row.appendChild(use);
          } else {
            const missing = document.createElement('span');
            missing.className = 'sage-roster-tag';
            missing.textContent = '提示词未接线（本入口不可用；不代表模板已失效）';
            row.appendChild(missing);
          }
          const preview = document.createElement('button');
          preview.className = 'sage-row-button';
          preview.type = 'button';
          preview.disabled = true;
          preview.textContent = '预览（未接线）';
          row.appendChild(preview);
          siteTemplateRows.appendChild(row);
        }
      }
    }

    function renderDraft(payload) {
      if (draftLock === null) return;
      const draft = draftOf(payload);
      if (draft.state === 'locked') {
        draftLock.textContent = '已锁定（登出期间不读取、不写入）';
        // The send entry is inert while locked: main would refuse anyway, and offering a button
        // that can only fail would read as a working entry.
        if (draftSend !== null) draftSend.disabled = true;
        if (draftNote !== null && draftLocalNotice === null) draftNote.textContent = '登出状态下草案保持加密锁定；重新登录并获准后才会恢复显示。';
        if (draftDetail !== null) draftDetail.hidden = true;
        if (draftMatters !== null) draftMatters.textContent = '';
        if (draftConfirmation !== null) draftConfirmation.hidden = true;
        return;
      }
      if (draft.state !== 'unlocked') {
        draftLock.textContent = '未核验：这一版还没有接上草案存储';
        if (draftSend !== null) draftSend.disabled = true;
        if (draftNote !== null && draftLocalNotice === null) draftNote.textContent = '';
        if (draftDetail !== null) draftDetail.hidden = true;
        if (draftConfirmation !== null) draftConfirmation.hidden = true;
        return;
      }
      draftLock.textContent = '本次运行内已解锁（设备本地，' + String(draft.drafts.length) + ' 份草案）';
      if (draftSend !== null) draftSend.disabled = false;
      const current = draft.drafts.find((entry) => entry !== null && typeof entry === 'object' && entry.draftId === currentDraftId)
        ?? draft.drafts[draft.drafts.length - 1];
      if (current === undefined || current === null || typeof current !== 'object') {
        currentDraftId = null;
        if (draftDetail !== null) draftDetail.hidden = true;
        if (draftNote !== null && draftLocalNotice === null) draftNote.textContent = '还没有草案：在上面的输入框里写下需求并发送。';
        if (draftMatters !== null) draftMatters.textContent = '';
        if (draftConfirmation !== null) draftConfirmation.hidden = true;
        return;
      }
      currentDraftId = current.draftId;
      if (draftDetail !== null) draftDetail.hidden = false;
      // The fields are re-synced only when the draft actually changed (a save round-trip): the 2s
      // poll must never wipe what is being typed between edits.
      const stale = current.updatedAt === draftRevision;
      draftRevision = current.updatedAt;
      const setField = (node, value) => { if (node !== null && node.value !== value) node.value = value; };
      if (!stale) {
        setField(draftGoal, typeof current.fields.goal === 'string' ? current.fields.goal : '');
        setField(draftDeliverable, typeof current.fields.deliverable === 'string' ? current.fields.deliverable : '');
        setField(draftProject, typeof current.fields.projectRef === 'string' ? current.fields.projectRef : '');
        setField(draftClarification, typeof current.clarification === 'string' ? current.clarification : '');
      }
      // 004（US-008）：责任默认值只在表单面提供，来源是 main 的登录投影（同一份 auth 值）——
      // 不是 renderer 自造，也让 UI 自报文本永远进不了任何判定；默认文本在用户点「保存草案」
      // 时才随其保存动作落盘，未认证/未就绪时保持为空并说明缺失（不伪造占位身份）。
      {
        const auth = payload !== null && typeof payload === 'object' && payload.service !== null && typeof payload.service === 'object'
          ? payload.service.auth : null;
        const authStatus = auth !== null && typeof auth === 'object' && typeof auth.status === 'string' ? auth.status : 'signed-out';
        const authName = auth !== null && typeof auth === 'object' && typeof auth.displayName === 'string' && auth.displayName !== '' ? auth.displayName : null;
        const savedResponsibility = typeof current.fields.responsibility === 'string' ? current.fields.responsibility : '';
        const responsibilityRevision = current.updatedAt + '|' + authStatus + '|' + String(authName);
        if (!stale || responsibilityRevision !== draftResponsibilityRevision) {
          draftResponsibilityRevision = responsibilityRevision;
          if (savedResponsibility !== '') {
            // 已保存值优先；只把默认位让开，绝不改写用户已保存的内容。
            if (!stale) setField(draftResponsibility, savedResponsibility);
            draftResponsibilityDefaultShown = null;
            if (draftResponsibilityNote !== null) draftResponsibilityNote.textContent = '';
          } else {
            const offered = authStatus === 'signed-in' && authName !== null ? authName : null;
            const currentText = draftResponsibility !== null && typeof draftResponsibility.value === 'string' ? draftResponsibility.value : '';
            // 注入只发生在输入框为空、或仍是我们上次注入的默认文本时——用户正在输入的文本不被覆盖。
            if (offered !== null && (currentText === '' || currentText === draftResponsibilityDefaultShown)) {
              setField(draftResponsibility, offered);
            }
            if (offered === null && currentText === draftResponsibilityDefaultShown && currentText !== '') {
              setField(draftResponsibility, '');
            }
            draftResponsibilityDefaultShown = offered;
            if (draftResponsibilityNote !== null) {
              draftResponsibilityNote.textContent = offered !== null
                ? '责任默认：当前登录身份「' + offered + '」——来自 main 的登录投影，可改；随「保存草案」落盘；改责任值不改变任何权限判定。'
                : authStatus === 'pending'
                  ? '未就绪：登录进行中——完成前不填默认责任（不用占位身份）。'
                  : authStatus === 'signed-in'
                    ? '已认证：身份显示名未提供——责任默认值不伪造（可手动填写）。'
                    : '未认证：责任字段没有默认值——登录后自动填入当前身份（不用占位身份填充）。';
            }
          }
        }
      }
      const attempt = current.attempt !== null && typeof current.attempt === 'object' ? current.attempt : null;
      const attemptState = attempt !== null && typeof attempt.state === 'string' ? attempt.state : null;
      // 025：该草案一旦建项，悬着的确认卡就没有对象可确认了。
      if (current.status === 'converted' && pendingDraftConfirmation !== null && pendingDraftConfirmation.draftId === current.draftId) {
        pendingDraftConfirmation = null;
      }
      const pendingForCurrent = pendingDraftConfirmation !== null && pendingDraftConfirmation.draftId === current.draftId;
      if (draftConfirm !== null) {
        // US-007: the confirm entry exists but stays disabled until all three required fields hold
        // something the user typed; the service refuses an incomplete draft as well.
        // US-119: while the outcome is unknown the entry is *not* a retry — 核对 is the only way on.
        const blockedByAttempt = attemptState === 'pending' || attemptState === 'unknown';
        draftConfirm.disabled = current.complete !== true || current.status === 'converted' || blockedByAttempt || pendingForCurrent;
        draftConfirm.textContent = current.status === 'converted' ? '已建项（不重复创建）'
          : attemptState === 'unknown' ? '结果未知期间不重复建项'
            : pendingForCurrent ? '待确认：见下方执行前确认卡' : '确认建项';
      }
      if (draftAttemptNote !== null) {
        draftAttemptNote.textContent = attemptState === 'pending'
          ? '创建中：请求已发出，结果还没回来。可以继续等待，或取消这次未提交的确认（草案内容不会丢）。'
          : attemptState === 'unknown'
            ? '结果未知：这次建项可能已经生效。请用「核对同一请求」确认状态——不要重复建项。'
            : attemptState === 'failed'
              ? '确定失败：这次建项没有生效（可回下面的字段修正后再次确认）。'
              : '';
      }
      if (draftReconcile !== null) draftReconcile.hidden = attemptState !== 'unknown';
      if (draftCancelConfirm !== null) draftCancelConfirm.hidden = attemptState !== 'pending';
      if (draftSave !== null) draftSave.disabled = current.status === 'converted';
      if (draftHistory !== null) {
        draftHistory.textContent = '';
        const history = Array.isArray(current.history) ? current.history : [];
        for (const entry of history) {
          if (entry === null || typeof entry !== 'object' || typeof entry.entryId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.historyEntryId = entry.entryId;
          const toggle = document.createElement('input');
          toggle.type = 'checkbox';
          toggle.className = 'sage-history-toggle';
          toggle.dataset.historyToggle = entry.entryId;
          toggle.checked = entry.selected === true;
          toggle.setAttribute('aria-label', '随建项附入这段前史');
          row.appendChild(toggle);
          const label = document.createElement('span');
          label.textContent = typeof entry.text === 'string' ? entry.text : '';
          row.appendChild(label);
          draftHistory.appendChild(row);
        }
      }
      if (draftHistoryNote !== null && historyCount(current) === 0) draftHistoryNote.textContent = '还没有前史。';
      if (draftResult !== null && current.status === 'converted' && typeof current.matterRef === 'string' && current.matterRef !== '') {
        draftResult.textContent = '已建项：' + current.matterRef + '（来自服务回执，不是本地编号）。';
      }
      if (draftMatters !== null) {
        draftMatters.textContent = '';
        for (const entry of draft.drafts) {
          if (entry === null || typeof entry !== 'object' || entry.status !== 'converted' || typeof entry.matterRef !== 'string' || entry.matterRef === '') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.matterRef = entry.matterRef;
          const name = document.createElement('strong');
          name.textContent = typeof entry.fields.goal === 'string' && entry.fields.goal !== '' ? entry.fields.goal : entry.matterRef;
          row.appendChild(name);
          const ref = document.createElement('span');
          ref.className = 'sage-roster-tag';
          ref.textContent = '回执 ' + entry.matterRef;
          row.appendChild(ref);
          draftMatters.appendChild(row);
        }
      }
      renderDraftConfirmation();
    }

    // 005：会话面。回执与执行分开；最终文本以历史为准（reconciled 表明这次是从历史读回的）。
    function renderSessionChannel(payload) {
      if (sessionIdNode === null) return;
      const channel = payload !== null && typeof payload === 'object' && payload.sessionChannel !== null && typeof payload.sessionChannel === 'object'
        ? payload.sessionChannel
        : null;
      const known = channel !== null;
      const state = known && typeof channel.state === 'string' ? channel.state : 'unavailable';
      if (sessionIdNode !== null) {
        sessionIdNode.textContent = known && typeof channel.sessionId === 'string' && channel.sessionId !== ''
          ? channel.sessionId
          : state === 'no-session' ? '还没有会话（发送后才会创建）' : '未核验';
      }
      const transcript = known && Array.isArray(channel.transcript) ? channel.transcript : [];
      const echoes = transcript.filter((entry) => entry !== null && typeof entry === 'object' && entry.source === 'echo');
      if (sessionSendState !== null) {
        // The ack sentence names admission and nothing else — never "the model started working".
        sessionSendState.textContent = echoes.length === 0 ? '尚未发送'
          : '已受理 · ' + String(echoes.length) + ' 条（进入队列；执行与否看下一行）';
      }
      if (sessionExecution !== null) {
        sessionExecution.textContent = !known || state === 'unavailable' ? '未核验'
          : channel.execution === 'executing' ? '执行中（日志里有一轮未结束）'
            : typeof channel.lastTurnEnd === 'string' && channel.lastTurnEnd !== '' ? '本轮已结束（' + channel.lastTurnEnd + '）'
              : '空闲（没有未结束的一轮）';
      }
      if (sessionNote !== null && sessionNote !== undefined && sessionLocalNotice === null) {
        if (!known || state === 'unavailable') sessionNote.textContent = '未核验：这一版还没有接上会话通道。';
        else if (state === 'no-session') sessionNote.textContent = '还没有为这个事项建立会话；发出第一条输入时才会创建。';
        else if (channel.streamBroken === true) sessionNote.textContent = '流已断开：' + String(channel.code ?? 'unknown') + '（最终文本以历史对账为准）';
        else if (channel.reconciled === true) sessionNote.textContent = '已按历史对账：下面助手这一段是从会话历史读回的最终文本。';
        else sessionNote.textContent = '';
      }
      // 006：待继续清单。只有 pending 项可编辑/移除；已消费项冻结在只读态。
      if (pendingNote !== null && pendingNote !== undefined) {
        const paused = known && channel.paused === true;
        pendingNote.textContent = !known ? ''
          : paused ? '已暂停：新输入只会存成待继续项，不会自动送去执行；点「继续」才按顺序派发。'
            : (Array.isArray(channel.pending) && channel.pending.length > 0 ? '未暂停；下列待继续项要等一次显式「继续」才会派发。' : '');
      }
      // 009：历史运行区（纯历史接点；打开历史不激活执行）。空列表=尚未读取，不冒充"没有运行"。
      const history = payload !== null && typeof payload === 'object' && payload.sessionHistory !== null && typeof payload.sessionHistory === 'object'
        ? payload.sessionHistory
        : null;
      const historyKnown = history !== null && history.state === 'read';
      const runs = historyKnown && Array.isArray(history.runs) ? history.runs : [];
      if (historyNote !== null && historyNote !== undefined && historyLocalNotice === null) {
        historyNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : !historyKnown ? '未核验：历史读取端口未接线（不以空列表冒充能力）。'
            : runs.length === 0 ? '还没有读取历史运行：点「读取历史运行」走纯历史接点（打开历史不会激活执行）。'
              : '共 ' + String(runs.length) + ' 次运行（按时间倒序；默认展开最近一次的输出与产物卡；更早的运行按页加载）。';
      }
      if (historyMore !== null) historyMore.hidden = !(historyKnown && history.hasMore === true);
      if (historyRows !== null) {
        historyRows.textContent = '';
        if (historyKnown) {
          for (const run of runs) {
            if (run === null || typeof run !== 'object' || typeof run.runSeq !== 'number') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.historyRun = String(run.runSeq);
            const name = document.createElement('strong');
            name.textContent = '运行 @' + String(run.runSeq);
            row.appendChild(name);
            const model = document.createElement('span');
            model.className = 'sage-roster-tag';
            model.textContent = typeof run.model === 'string' && run.model !== ''
              ? '当时模型 ' + String(run.provider ?? '') + '/' + run.model
              : '未记录请求头模型';
            row.appendChild(model);
            const statusTag = document.createElement('span');
            statusTag.textContent = run.endSeq === null ? '进行中（未结束）' : '已结束（' + String(run.endReason ?? 'ended') + '）';
            row.appendChild(statusTag);
            const count = document.createElement('span');
            count.textContent = String(run.messages ?? 0) + ' 条消息';
            row.appendChild(count);
            const open = document.createElement('button');
            open.className = 'sage-row-button';
            open.type = 'button';
            open.dataset.historyAction = 'detail';
            open.dataset.historyRun = String(run.runSeq);
            open.textContent = '展开详情';
            row.appendChild(open);
            historyRows.appendChild(row);
          }
        }
      }
      if (historyDetail !== null) {
        const detail = historyKnown && history.detail !== null && typeof history.detail === 'object' ? history.detail : null;
        historyDetail.hidden = detail === null;
        if (detail !== null) {
          if (historyDetailModel !== null) {
            historyDetailModel.textContent = detail.state === 'missing' ? ''
              : '当时实际模型（本运行请求头快照）：' + (typeof detail.model === 'string' && detail.model !== ''
                  ? String(detail.provider ?? '') + '/' + detail.model
                  : '未记录') + '——与本事项当前选择分开显示（当前默认见模型卡）。';
          }
          if (historyDetailNote !== null) {
            historyDetailNote.textContent = detail.state === 'missing'
              ? '这一运行的详情不可读（' + String(detail.code ?? 'unreadable') + '）：保持缺失（不显示空白成功）。'
              : '运行 @' + String(detail.runSeq) + '：' + String(detail.userTexts.length) + ' 条用户输入' + (detail.outputTruncated === true ? '；输出为有界预览（有截断）。' : '。');
          }
          if (historyDetailUsers !== null) {
            historyDetailUsers.textContent = '';
            if (detail.state === 'read') {
              for (const text of detail.userTexts) {
                const row = document.createElement('li');
                row.className = 'sage-roster-row';
                row.textContent = text;
                historyDetailUsers.appendChild(row);
              }
            }
          }
          if (historyDetailOutput !== null) historyDetailOutput.textContent = detail.state === 'read' && typeof detail.outputPreview === 'string' ? detail.outputPreview : '';
          // 034/US-180：澄清问答沿历史只读回看（没有任何提交控件；重开不重复提交）。
          if (historyDetailClarifications !== null) {
            historyDetailClarifications.textContent = '';
            const entries = detail.state === 'read' && Array.isArray(detail.clarifications) ? detail.clarifications : [];
            for (const entry of entries) {
              if (entry === null || typeof entry !== 'object') continue;
              const row = document.createElement('li');
              row.className = 'sage-roster-row';
              const parts = [];
              const selectedText = Array.isArray(entry.selected) ? entry.selected.join('、') : '';
              const customText = typeof entry.custom === 'string' && entry.custom !== '' ? entry.custom : '';
              if (selectedText !== '') parts.push(selectedText);
              if (customText !== '') parts.push('自定义：' + customText);
              const answer = entry.answered === true
                ? (parts.length > 0 ? '回答：' + parts.join('；') : '回答：（未记录内容）')
                : '未回答（提问中止或仍在等待）';
              row.textContent = '问：' + String(entry.question ?? '') + ' —— ' + answer;
              historyDetailClarifications.appendChild(row);
            }
          }
        }
      }
      // 035：消息锚点区（纯历史读取；点击先预览、再显式定位；hover 不发命令）。
      const anchors = payload !== null && typeof payload === 'object' && payload.sessionAnchors !== null && typeof payload.sessionAnchors === 'object'
        ? payload.sessionAnchors
        : null;
      const anchorsKnown = anchors !== null && anchors.state === 'read';
      const anchorList = anchorsKnown && Array.isArray(anchors.anchors) ? anchors.anchors : [];
      if (anchorNote !== null && anchorNote !== undefined && anchorLocalNotice === null) {
        anchorNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : anchors === null || anchors.state === 'unavailable' ? '未核验：锚点读取端口未接线（不以空列表冒充能力）。'
            : anchors.state === 'no-session' ? '还没有会话：没有可定位的轮次锚点（读取不会创建会话）。'
              : anchorList.length === 0 ? '还没有读取锚点：点「读取锚点（最近轮次）」走纯历史接点（不会激活执行）。'
                : '共 ' + String(anchorList.length) + ' 个轮次锚点（按时间倒序；点击先看短预览，再显式定位）。';
      }
      if (anchorRows !== null) {
        anchorRows.textContent = '';
        if (anchorsKnown) {
          for (const anchor of anchorList) {
            if (anchor === null || typeof anchor !== 'object' || typeof anchor.runSeq !== 'number') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.anchorRun = String(anchor.runSeq);
            const label = document.createElement('strong');
            label.textContent = '运行 @' + String(anchor.runSeq) + (typeof anchor.turn === 'number' ? '·第 ' + String(anchor.turn) + ' 轮' : '');
            row.appendChild(label);
            const preview = document.createElement('span');
            preview.className = 'sage-roster-tag';
            preview.textContent = typeof anchor.promptPreview === 'string' && anchor.promptPreview !== '' ? '预览：' + anchor.promptPreview : '（该轮没有用户文本预览）';
            row.appendChild(preview);
            const open = document.createElement('button');
            open.className = 'sage-row-button';
            open.type = 'button';
            open.dataset.anchorPreview = String(anchor.runSeq);
            open.textContent = '锚点预览';
            row.appendChild(open);
            anchorRows.appendChild(row);
          }
          // 保持现场：已定位标记随投影重建（刷新不清场景）。
          if (anchors.located !== null && typeof anchors.located === 'object' && typeof anchors.located.runSeq === 'number') {
            const locatedRow = anchorRows.querySelector('[data-anchor-run="' + String(anchors.located.runSeq) + '"]');
            if (locatedRow !== null) locatedRow.dataset.anchorLocated = 'true';
          }
        }
      }
      // 无选中即收合短预览（初始也由此收敛；选中期间刷新保持打开——保现场）。
      if (anchorPreview !== null && anchorSelected === null) anchorPreview.hidden = true;

      // 036：编辑重发区（原消息不改写；版本链回看；重发同入口；未知只给核对）。
      const edits = payload !== null && typeof payload === 'object' && payload.sessionEdits !== null && typeof payload.sessionEdits === 'object'
        ? payload.sessionEdits
        : null;
      const editRecords = edits !== null && edits.state === 'read' && Array.isArray(edits.records) ? edits.records : [];
      if (editNote !== null && editNote !== undefined && editLocalNotice === null) {
        editNote.textContent = edits === null ? '未核验：编辑记录端口未接线（不以空列表冒充能力）。'
          : editRecords.length === 0 ? '还没有编辑稿：在会话记录里点某条已发消息的「编辑」。'
            : '共 ' + String(editRecords.length) + ' 份编辑稿（原消息保持原样；重发只走高版本链、同一发送入口）。';
      }
      if (editTarget !== null) {
        editTarget.textContent = editTargetRef === null ? '（从下方会话记录里选一条已发消息）' : '消息 ' + String(editTargetRef) + '（原消息不变）';
        if (editTargetRef !== null) editTarget.dataset.editSelected = String(editTargetRef);
      }
      if (editRows !== null) {
        editRows.textContent = '';
        const bounded = (value) => typeof value === 'string' ? (value.length > 400 ? value.slice(0, 400) + '…' : value) : '';
        const submissionText = (version) => version.submission === 'unsent' ? '未重发'
          : version.submission === 'accepted' ? '已接收（等待生效确认）'
            : version.submission === 'effective' ? '已生效（已落史）'
              : version.submission === 'unknown' ? '结果未知（只给核对，不给重试）'
                : '未送达（核对确认；可再次显式重发）';
        for (const record of editRecords) {
          if (record === null || typeof record !== 'object' || typeof record.editId !== 'string' || !Array.isArray(record.versions)) continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.editRecord = record.editId;
          const head = document.createElement('strong');
          head.textContent = '编辑稿 ' + record.editId.slice(0, 22);
          row.appendChild(head);
          const origin = document.createElement('span');
          origin.className = 'sage-roster-tag';
          origin.dataset.editOriginal = String(record.messageRef ?? '');
          origin.textContent = '原消息（未改写）：' + bounded(record.originalText);
          row.appendChild(origin);
          let active = null;
          for (const version of record.versions) {
            if (version === null || typeof version !== 'object' || typeof version.version !== 'number') continue;
            if (version.version === record.activeVersion) active = version;
            const block = document.createElement('div');
            block.dataset.editVersion = String(version.version);
            const label = document.createElement('span');
            label.className = 'sage-roster-tag';
            label.textContent = 'v' + String(version.version) + (version.version === record.activeVersion ? '（当前）' : '') + '：' + bounded(version.text);
            block.appendChild(label);
            const status = document.createElement('span');
            status.className = 'sage-roster-tag';
            status.textContent = submissionText(version);
            block.appendChild(status);
            row.appendChild(block);
          }
          if (active !== null) {
            if (active.submission === 'unknown' || active.submission === 'accepted') {
              const verify = document.createElement('button');
              verify.className = 'sage-row-button';
              verify.type = 'button';
              verify.dataset.editVerify = record.editId;
              verify.textContent = '核对同一操作';
              row.appendChild(verify);
            } else {
              const resend = document.createElement('button');
              resend.className = 'sage-row-button';
              resend.type = 'button';
              resend.dataset.editResend = record.editId;
              resend.textContent = '重发 v' + String(active.version);
              row.appendChild(resend);
            }
          }
          editRows.appendChild(row);
        }
      }

      // 034：澄清问答区（读取来自主进程中继的活卡；回答单发一条具名写；核对只重读）。
      const clarifications = payload !== null && typeof payload === 'object' && payload.sessionClarifications !== null && typeof payload.sessionClarifications === 'object'
        ? payload.sessionClarifications
        : null;
      const clarificationsKnown = clarifications !== null && clarifications.state === 'read';
      const clarifyCards = clarificationsKnown && Array.isArray(clarifications.pending) ? clarifications.pending : [];
      const clarifyDeferred = clarificationsKnown && Array.isArray(clarifications.deferred) ? clarifications.deferred : [];
      const clarifyReceipts = clarificationsKnown && Array.isArray(clarifications.receipts) ? clarifications.receipts : [];
      if (clarificationNote !== null && clarificationNote !== undefined && clarificationLocalNotice === null) {
        clarificationNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : clarifications === null || clarifications.state === 'unavailable' ? '未核验：澄清读取端口未接线（不以空列表冒充能力）。'
            : clarifications.state === 'no-session' ? '还没有会话：没有运行中的澄清提问可读（读取不会创建会话）。'
              : clarifyCards.length === 0 ? '当前没有待回答的澄清提问（提问只在运行中由模型发出）。'
                : '共 ' + String(clarifyCards.length) + ' 个待回答的澄清提问（回答前不派发依赖该答案的后续步骤）。';
      }
      if (clarificationCards !== null) {
        clarificationCards.textContent = '';
        if (clarificationsKnown) {
          for (const card of clarifyCards) {
            if (card === null || typeof card !== 'object' || typeof card.requestId !== 'string' || !Array.isArray(card.questions)) continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.clarificationRequest = card.requestId;
            const head = document.createElement('strong');
            head.textContent = '澄清提问';
            row.appendChild(head);
            const runTag = document.createElement('span');
            runTag.className = 'sage-roster-tag';
            runTag.textContent = card.run !== null && typeof card.run === 'object' && typeof card.run.runSeq === 'number'
              ? '所属运行 @' + String(card.run.runSeq)
              : '所属运行未核验';
            row.appendChild(runTag);
            for (const question of card.questions) {
              const block = document.createElement('div');
              const label = document.createElement('span');
              label.className = 'sage-roster-tag';
              label.textContent = '问：' + String(question.question ?? '');
              block.appendChild(label);
              if (typeof question.header === 'string' && question.header !== '') {
                const header = document.createElement('span');
                header.className = 'sage-roster-tag';
                header.textContent = '（' + question.header + '）';
                block.appendChild(header);
              }
              if (typeof question.intentKind === 'string' && question.intentKind !== '') {
                const intent = document.createElement('span');
                intent.className = 'sage-roster-tag';
                intent.textContent = '确认意图：' + question.intentKind + (typeof question.approveLabel === 'string' && question.approveLabel !== '' ? '（通过=' + question.approveLabel + '）' : '');
                block.appendChild(intent);
              }
              // 039（US-194）：方案审阅卡把方案正文按预览呈现；接受方案不等于执行其中动作。
              if (question.intentKind === 'plan-review') {
                if (typeof question.detail === 'string' && question.detail !== '') {
                  const preview = document.createElement('pre');
                  preview.className = 'sage-plan-preview';
                  preview.dataset.planReviewPreview = String(question.questionId);
                  preview.textContent = question.detail;
                  block.appendChild(preview);
                }
                const scope = document.createElement('span');
                scope.className = 'sage-roster-tag';
                scope.textContent = '方案预览：接受方案不等于执行其中动作（业务动作仍需执行前确认）。';
                block.appendChild(scope);
              }
              const options = Array.isArray(question.options) ? question.options : [];
              for (const option of options) {
                const optionLabel = document.createElement('label');
                const input = document.createElement('input');
                input.type = question.multiSelect === true ? 'checkbox' : 'radio';
                input.name = 'clarify-' + card.requestId + '-' + String(question.questionId);
                input.value = String(option.label ?? '');
                input.dataset.clarificationOption = String(question.questionId);
                optionLabel.appendChild(input);
                const optionText = document.createElement('span');
                optionText.textContent = ' ' + String(option.label ?? '') + (typeof option.description === 'string' && option.description !== '' ? '（' + option.description + '）' : '');
                optionLabel.appendChild(optionText);
                block.appendChild(optionLabel);
              }
              const custom = document.createElement('input');
              custom.type = 'text';
              custom.className = 'sage-row-input';
              custom.dataset.clarificationCustom = String(question.questionId);
              custom.placeholder = '自定义回答（与候选项同权）';
              custom.setAttribute('aria-label', '自定义回答');
              block.appendChild(custom);
              row.appendChild(block);
            }
            const submit = document.createElement('button');
            submit.className = 'sage-row-button';
            submit.type = 'button';
            submit.dataset.clarificationSubmit = card.requestId;
            submit.textContent = '提交回答';
            row.appendChild(submit);
            clarificationCards.appendChild(row);
          }
        }
      }
      if (clarificationDeferred !== null) {
        clarificationDeferred.textContent = '';
        if (clarificationsKnown) {
          for (const entry of clarifyDeferred) {
            if (entry === null || typeof entry !== 'object') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            const questionText = Array.isArray(entry.questions) && entry.questions.length > 0 ? String(entry.questions[0].question ?? '') : '';
            row.textContent = '待继续：' + questionText + (entry.reason === 'stopped'
              ? '——停止已中止该提问（未回答）；继续会话后可按需重新发起。'
              : '——该提问已结束（未从本工作面提交回答）。');
            clarificationDeferred.appendChild(row);
          }
        }
      }
      if (clarificationReceipts !== null) {
        clarificationReceipts.textContent = '';
        if (clarificationsKnown) {
          for (const receipt of clarifyReceipts) {
            if (receipt === null || typeof receipt !== 'object' || typeof receipt.requestId !== 'string') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            const code = typeof receipt.code === 'string' && receipt.code !== '' ? '（' + receipt.code + '）' : '';
            row.textContent = receipt.state === 'accepted' ? '已接收（等待生效确认）：回答已提交给所属会话' + code
              : receipt.state === 'effective' ? '已生效：运行已采用该回答（结果已落历史）' + code
                : receipt.state === 'aborted' ? '未生效：该提问已中止或不在等待中；仅可核对，不给重试' + code
                  : '结果未知：请核对同一操作（不给重试）' + code;
            if (receipt.verifyOnly === true) {
              const verify = document.createElement('button');
              verify.className = 'sage-row-button';
              verify.type = 'button';
              verify.dataset.clarificationVerify = String(receipt.requestId);
              verify.textContent = '核对';
              row.appendChild(verify);
            }
            clarificationReceipts.appendChild(row);
          }
        }
      }
      if (sessionStop !== null) sessionStop.disabled = !known || state === 'unavailable' || channel.paused === true;
      if (sessionResume !== null) sessionResume.disabled = !known || state === 'unavailable' || channel.paused !== true;
      // 008：队列区。暂停态只显示待继续（上区），不渲染队列行；快照缺席如实说未核验。
      const pausedNow = known && channel.paused === true;
      const queue = known && channel.queue !== null && typeof channel.queue === 'object' ? channel.queue : null;
      if (queueNote !== null && queueNote !== undefined && queueLocalNotice === null) {
        queueNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : pausedNow ? '已暂停：队列面板只显示待继续（见上）；恢复后才按顺序派发。本版没有定时或循环自动化入口。'
            : queue === null || queue.state !== 'read' ? '未核验：这一版没有读到队列快照（不以空列表冒充）。本版没有定时或循环自动化入口。'
              : queue.occurrences.length === 0 ? '队列为空（权威快照；不是能力清单）。本版没有定时或循环自动化入口。'
                : '来自基座权威队列快照（' + String(queue.occurrences.length) + ' 项；steer 只在步骤边界消费）。本版没有定时或循环自动化入口。';
      }
      if (queueRows !== null) {
        queueRows.textContent = '';
        if (!pausedNow && known && queue !== null && queue.state === 'read') {
          for (const occurrence of queue.occurrences) {
            if (occurrence === null || typeof occurrence !== 'object' || typeof occurrence.queueItemId !== 'string') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.queueId = occurrence.queueItemId;
            const badge = document.createElement('span');
            badge.className = 'sage-roster-tag';
            badge.textContent = occurrence.position === 'steering' ? '步骤边界（steer）'
              : occurrence.position === 'context' ? '上下文（context）' : '排队中（本轮结束后处理）';
            row.appendChild(badge);
            const input = document.createElement('input');
            input.className = 'sage-row-input';
            input.type = 'text';
            input.value = typeof occurrence.preview === 'string' ? occurrence.preview : '';
            input.setAttribute('aria-label', '队列项文本');
            input.dataset.queueInput = occurrence.queueItemId;
            row.appendChild(input);
            const edit = document.createElement('button');
            edit.className = 'sage-row-button';
            edit.type = 'button';
            edit.dataset.queueAction = 'edit';
            edit.textContent = '保存修改';
            row.appendChild(edit);
            const remove = document.createElement('button');
            remove.className = 'sage-row-button';
            remove.type = 'button';
            remove.dataset.queueAction = 'remove';
            remove.textContent = '移除';
            row.appendChild(remove);
            queueRows.appendChild(row);
          }
        }
      }
      if (pendingRows !== null) {
        pendingRows.textContent = '';
        const pending = known && Array.isArray(channel.pending) ? channel.pending : [];
        for (const item of pending) {
          if (item === null || typeof item !== 'object' || typeof item.itemId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.pendingId = item.itemId;
          const stateTag = document.createElement('span');
          stateTag.className = 'sage-roster-tag ' + (item.state === 'consumed' ? 'is-blocked' : item.state === 'submitted' ? '' : 'is-ok');
          stateTag.textContent = item.state === 'pending'
            ? (item.note === 'drained-at-stop' ? '待继续（停止时已收回）' : '待继续（尚未派发）')
            : item.state === 'dispatching' ? '派发中（已冻结，不可编辑）'
              : item.state === 'submitted' ? '已提交·在队列' : '已消费（只读）';
          row.appendChild(stateTag);
          const input = document.createElement('input');
          input.className = 'sage-row-input';
          input.type = 'text';
          input.value = typeof item.text === 'string' ? item.text : '';
          input.setAttribute('aria-label', '待继续输入');
          input.dataset.pendingInput = item.itemId;
          input.disabled = item.editable !== true;
          row.appendChild(input);
          if (item.editable === true) {
            const edit = document.createElement('button');
            edit.className = 'sage-row-button';
            edit.type = 'button';
            edit.dataset.pendingAction = 'edit';
            edit.textContent = '保存修改';
            row.appendChild(edit);
            const remove = document.createElement('button');
            remove.className = 'sage-row-button';
            remove.type = 'button';
            remove.dataset.pendingAction = 'remove';
            remove.textContent = '移除';
            row.appendChild(remove);
          }
          pendingRows.appendChild(row);
        }
      }
      if (sessionTranscript === null) return;
      sessionTranscript.textContent = '';
      for (const entry of transcript) {
        if (entry === null || typeof entry !== 'object' || typeof entry.text !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.sessionRole = String(entry.role);
        row.dataset.sessionSource = String(entry.source);
        const tag = document.createElement('span');
        tag.className = 'sage-roster-tag';
        tag.textContent = entry.role === 'user' ? (entry.source === 'history' ? '我 · 历史' : '我（本机回显）') : entry.source === 'history' ? '助手 · 历史' : '助手';
        row.appendChild(tag);
        const body = document.createElement('span');
        body.textContent = entry.text;
        row.appendChild(body);
        // 036：用户行带消息身份时给 [编辑]（编辑产生新版本；原消息不被改写）。
        if (entry.role === 'user' && typeof entry.messageRef === 'string' && entry.messageRef !== '') {
          const edit = document.createElement('button');
          edit.className = 'sage-row-button';
          edit.type = 'button';
          edit.dataset.editMessage = entry.messageRef;
          edit.dataset.editText = entry.text;
          edit.textContent = '编辑';
          row.appendChild(edit);
        }
        // 014：随消息发送的附件以持久引用回显（名称与字节数来自会话日志，不是本机路径）。
        const files = Array.isArray(entry.attachments) ? entry.attachments : [];
        for (const file of files) {
          if (file === null || typeof file !== 'object' || typeof file.name !== 'string') continue;
          const chip = document.createElement('span');
          chip.className = 'sage-roster-tag';
          chip.dataset.sessionAttachment = String(file.attachmentId);
          chip.textContent = '附件：' + file.name + '（' + String(file.bytes) + ' 字节 · 内容核验通过）';
          row.appendChild(chip);
        }
        sessionTranscript.appendChild(row);
      }
    // 037：回复操作区（动作清单来自投影事实；未知/流断只给核对，不给重试）。
    const replyFacts = known && state === 'read' && channel !== null && typeof channel === 'object' && channel.reply !== null && typeof channel.reply === 'object'
      ? channel.reply
      : null;
    const replyActionsList = replyFacts !== null && Array.isArray(replyFacts.actions) ? replyFacts.actions : [];
    const replyUncertain = known && state === 'read' && channel !== null && typeof channel === 'object' && channel.streamBroken === true;
    if (replyActions !== null) {
      replyActions.textContent = '';
      if (replyFacts !== null) {
        for (const action of replyActionsList) {
          if (action !== 'copy' && action !== 'quote' && action !== 'retry') continue;
          // 未知/流断时撤回重试：只给核对入口（US-188 的"未知不出现重试"）。
          if (action === 'retry' && replyUncertain) continue;
          const button = document.createElement('button');
          button.className = 'sage-row-button';
          button.type = 'button';
          button.dataset.replyAction = action;
          button.textContent = action === 'copy' ? '复制回复' : action === 'quote' ? '引用' : '重试上一轮（确定失败）';
          replyActions.appendChild(button);
        }
        if (replyUncertain) {
          const audit = document.createElement('button');
          audit.className = 'sage-row-button';
          audit.type = 'button';
          audit.dataset.replyAudit = 'true';
          audit.textContent = '核对（重新读取会话）';
          replyActions.appendChild(audit);
        }
      }
    }
    if (replyNote !== null && replyNote !== undefined && replyLocalNotice === null) {
      replyNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
        : state === 'no-session' ? '还没有为这个事项建立会话；发出第一条输入时才会创建。'
          : replyFacts === null || replyFacts.text === null ? '还没有可操作的回复（读到回复文本后才会出现操作）。'
            : replyUncertain ? '会话流已断：状态未知——只给核对入口，不给重试。'
              : replyFacts.failed ? '上一轮以确定失败结束（' + String(replyFacts.endKind) + '）：只提供已核实动作——复制、引用、重试。'
                : '回复操作只提供已核实动作（复制、引用）；本版不会在非确定失败时提供重试。';
    }
    // 037：后续建议（来自方案投影中可推进的步骤；点击只填输入区）。
    const plansSource = payload !== null && typeof payload === 'object' && payload.plans !== null && typeof payload.plans === 'object' ? payload.plans : null;
    const planList = plansSource !== null && plansSource.state === 'read' && Array.isArray(plansSource.plans) ? plansSource.plans : [];
    const latestPlan = planList.length > 0 && planList[planList.length - 1] !== null && typeof planList[planList.length - 1] === 'object' ? planList[planList.length - 1] : null;
    const readySteps = latestPlan !== null && Array.isArray(latestPlan.steps)
      ? latestPlan.steps.filter((step) => step !== null && typeof step === 'object' && step.readiness === 'ready' && typeof step.title === 'string' && step.title !== '').slice(0, 3)
      : [];
    if (suggestionNote !== null && suggestionNote !== undefined && suggestionLocalNotice === null) {
      suggestionNote.textContent = plansSource === null || plansSource.state !== 'read' ? '后续建议未核验：方案投影未接线（不以固定文案冒充建议）。'
        : readySteps.length === 0 ? '当前没有可用的后续建议（建议来自方案投影中可推进的步骤）。'
          : '共 ' + String(readySteps.length) + ' 条后续建议（点击只填入输入区）。';
    }
    if (suggestionChips !== null) {
      suggestionChips.textContent = '';
      for (const step of readySteps) {
        const chip = document.createElement('li');
        chip.className = 'sage-roster-row';
        const button = document.createElement('button');
        button.className = 'sage-row-button';
        button.type = 'button';
        button.dataset.suggestionText = step.title;
        button.textContent = '建议：' + String(step.title).slice(0, 200);
        chip.appendChild(button);
        suggestionChips.appendChild(chip);
      }
    }

      // 038：输入区引用选择器（只读清单来自实际挂载；选择只随下一次发送携带，不改变启用状态）。
      const selections = payload !== null && typeof payload === 'object' && payload.inputSelections !== null && typeof payload.inputSelections === 'object'
        ? payload.inputSelections
        : null;
      const selectionsRead = selections !== null && selections.state === 'read';
      const skillRows = selectionsRead && Array.isArray(selections.skills) ? selections.skills : [];
      const pluginRows = selectionsRead && Array.isArray(selections.plugins) ? selections.plugins : [];
      const selectedRows = selections !== null && Array.isArray(selections.selected) ? selections.selected : [];
      if (selectionNote !== null && selectionNote !== undefined && selectionLocalNotice === null) {
        selectionNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : selections === null || selections.state === 'unavailable' ? '未核验：技能清单不可读（不以空列表冒充能力）；挂载行见下。'
            : selections.skillsNote !== null ? String(selections.skillsNote)
              : '引用只随下一次发送携带；本次请求受理后自动清空（不改变任何启用状态）。';
      }
      if (selectionSkills !== null) {
        selectionSkills.textContent = '';
        for (const skill of skillRows) {
          if (skill === null || typeof skill !== 'object' || typeof skill.name !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.skillRow = skill.name;
          const label = document.createElement('strong');
          label.textContent = skill.name;
          row.appendChild(label);
          const origin = document.createElement('span');
          origin.className = 'sage-roster-tag';
          origin.textContent = '来源：' + String(skill.source ?? '未标注') + (typeof skill.provider === 'string' && skill.provider !== '' ? '·' + skill.provider : '');
          row.appendChild(origin);
          const availability = document.createElement('span');
          availability.className = 'sage-roster-tag';
          availability.textContent = skill.userInvocable === true ? '可选用（本入口）' : '仅模型可调用（本入口不可选）';
          row.appendChild(availability);
          if (skill.userInvocable === true) {
            const use = document.createElement('button');
            use.className = 'sage-row-button';
            use.type = 'button';
            use.dataset.selectionAction = 'select';
            use.dataset.selectionKind = 'skill';
            use.dataset.selectionRef = skill.name;
            use.textContent = '选用';
            row.appendChild(use);
          } else {
            const denied = document.createElement('button');
            denied.className = 'sage-row-button';
            denied.type = 'button';
            denied.disabled = true;
            denied.textContent = '选用';
            row.appendChild(denied);
          }
          selectionSkills.appendChild(row);
        }
      }
      if (selectionPlugins !== null) {
        selectionPlugins.textContent = '';
        if (selections !== null && selections.pluginsNote !== null && selections.pluginsNote !== undefined) {
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.textContent = String(selections.pluginsNote);
          selectionPlugins.appendChild(row);
        } else {
          for (const plugin of pluginRows) {
            if (plugin === null || typeof plugin !== 'object' || typeof plugin.identity !== 'string') continue;
            const row = document.createElement('li');
            row.className = 'sage-roster-row';
            row.dataset.pluginRow = plugin.identity;
            const label = document.createElement('strong');
            label.textContent = plugin.identity;
            row.appendChild(label);
            const mounted = document.createElement('span');
            mounted.className = 'sage-roster-tag';
            mounted.textContent = '已挂载（组合内实际存在）' + (typeof plugin.version === 'string' && plugin.version !== '' ? '·v' + plugin.version : '');
            row.appendChild(mounted);
            const use = document.createElement('button');
            use.className = 'sage-row-button';
            use.type = 'button';
            use.dataset.selectionAction = 'select';
            use.dataset.selectionKind = 'plugin';
            use.dataset.selectionRef = plugin.identity;
            use.textContent = '选用';
            row.appendChild(use);
            selectionPlugins.appendChild(row);
          }
        }
      }
      if (selectionChips !== null) {
        selectionChips.textContent = '';
        for (const entry of selectedRows) {
          if (entry === null || typeof entry !== 'object' || typeof entry.ref !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.selectionChip = entry.ref;
          const label = document.createElement('span');
          label.className = 'sage-roster-tag';
          label.textContent = entry.kind === 'skill' ? '已选：技能 ' + entry.ref + '（随下一次发送携带）' : '已选：插件 ' + entry.ref + '（随下一次发送携带；不改变启用状态，也不代表已获得能力）';
          row.appendChild(label);
          const clear = document.createElement('button');
          clear.className = 'sage-row-button';
          clear.type = 'button';
          clear.dataset.selectionClear = entry.ref;
          clear.dataset.selectionKind = String(entry.kind);
          clear.textContent = '清除';
          row.appendChild(clear);
          selectionChips.appendChild(row);
        }
      }

      // 039：目标/计划模式（状态=服务投影的裁剪视图；未生效显示实际模式；切换=具名请求）。
      const planMode = payload !== null && typeof payload === 'object' && payload.sessionPlanMode !== null && typeof payload.sessionPlanMode === 'object'
        ? payload.sessionPlanMode
        : null;
      const planModeRead = planMode !== null && planMode.state === 'read';
      const planModeActive = planModeRead && planMode.active === true;
      const planModePending = planModeRead && planMode.pending === true;
      if (planModeNote !== null && planModeNote !== undefined && planModeLocalNotice === null) {
        planModeNote.textContent = !known || state === 'unavailable' ? '未核验：这一版还没有接上会话通道。'
          : planMode === null || planMode.state === 'unavailable' ? '未核验：模式状态未接线（' + String(planMode?.reason ?? 'plan-mode-unavailable') + '）；不以默认值冒充。'
            : planMode.state === 'no-session' ? '还没有会话：没有可切换的模式状态（读取不会创建会话）。'
              : planModePending ? '切换已登记：将在下一步生效；当前实际为' + (planModeActive ? '计划模式' : '目标模式') + '。'
                : '当前：' + (planModeActive ? '计划模式（只出方案；其中动作仍需执行前确认）' : '目标模式。');
      }
      if (planModeGoal !== null || planModePlan !== null) {
        const markOf = (mode) => planModeRead
          ? ((mode === 'plan') === planModeActive ? 'active' : (planModePending ? 'pending-target' : 'idle'))
          : 'unavailable';
        const targets = [
          { button: planModeGoal, mode: 'goal', label: '目标模式' },
          { button: planModePlan, mode: 'plan', label: '计划模式' },
        ];
        for (const { button, mode, label } of targets) {
          if (button === null || button === undefined) continue;
          const mark = markOf(mode);
          button.disabled = !planModeRead;
          button.dataset.planMode = mode;
          button.dataset.planModeState = mark;
          button.textContent = label + (mark === 'active' ? '（当前）' : mark === 'pending-target' ? '（下一步生效）' : '');
        }
      }
    }

    // 043：集成终端（只读运行观察）；打开/关闭是本地开关（零写）；输出不进对话与产物。
    function renderTerminal(payload) {
      if (terminalNote === null && terminalRows === null) return;
      const terminal = payload !== null && typeof payload === 'object' && payload.terminal !== null && typeof payload.terminal === 'object'
        ? payload.terminal
        : null;
      const read = terminal !== null && terminal.state === 'read';
      const sessions = read && Array.isArray(terminal.terminals) ? terminal.terminals : [];
      if (terminalNote !== null && terminalLocalNotice === null) {
        terminalNote.textContent = terminal === null || terminal.state === 'unavailable'
          ? '未就绪：终端能力不可用（' + String(terminal?.reason ?? 'terminals-provider-unavailable') + '）——缺项未满足，不显示空终端。'
          : terminal.state === 'no-session' ? '还没有会话：没有可观察的终端（读取不会创建会话）。'
            : sessions.length === 0 ? '当前没有终端会话：这里只作只读观察，不在此创建终端。'
              : '终端 ' + String(sessions.length) + ' 项（只读运行观察；打开/关闭面板不影响执行）。';
      }
      if (terminalRows !== null) {
        terminalRows.textContent = '';
        for (const session of sessions) {
          if (session === null || typeof session !== 'object' || typeof session.terminalId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.terminalRow = session.terminalId;
          const label = document.createElement('strong');
          label.textContent = (typeof session.name === 'string' && session.name !== '' ? session.name : session.terminalId) + ' · ' + String(session.type ?? '');
          row.appendChild(label);
          const status = document.createElement('span');
          status.className = 'sage-roster-tag';
          status.textContent = session.status !== null && typeof session.status === 'object' && session.status.kind === 'exited'
            ? '已退出' + (typeof session.status.exitCode === 'number' ? '（exitCode ' + String(session.status.exitCode) + '）' : '') + (typeof session.status.signal === 'string' && session.status.signal !== '' ? '（' + session.status.signal + '）' : '')
            : '运行中';
          row.appendChild(status);
          const toggle = document.createElement('button');
          toggle.className = 'sage-row-button';
          toggle.type = 'button';
          toggle.dataset.terminalOpen = session.terminalId;
          toggle.textContent = terminalOpenedId === session.terminalId ? '关闭输出' : '打开输出（只读）';
          row.appendChild(toggle);
          terminalRows.appendChild(row);
        }
      }
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

    // 042：模型排队三态（排队等待/重试进行中/已恢复）——服务事实投影；超时=结果未知只给核对。
    function renderModelQueue(payload) {
      if (modelQueueNote === null && modelQueueRows === null) return;
      const queue = payload !== null && typeof payload === 'object' && payload.modelQueue !== null && typeof payload.modelQueue === 'object'
        ? payload.modelQueue
        : null;
      const read = queue !== null && queue.state === 'read';
      const verdict = read && typeof queue.verdict === 'string' ? queue.verdict : null;
      const retries = read && Array.isArray(queue.retries) ? queue.retries : [];
      const last = retries.length > 0 ? retries[retries.length - 1] : null;
      const describeAttempt = (entry) => '第 ' + String(entry.attempt) + (entry.maxAttempts === null ? '' : '/' + String(entry.maxAttempts)) + ' 次';
      if (modelQueueNote !== null && modelQueueLocalNotice === null) {
        modelQueueNote.textContent = queue === null || queue.state === 'unavailable'
          ? '未核验：模型排队读取端口未接线（' + String(queue?.reason ?? 'model-queue-provider-unavailable') + '）；不以空状态冒充。'
          : queue.state === 'no-session' ? '还没有会话：没有模型排队或重试可读（读取不会创建会话）。'
            : verdict === 'waiting' && last !== null ? '排队等待恢复（' + describeAttempt(last) + '，全部为服务事实）：服务端安排 ' + String(last.delayMs) + ' ms 后继续，原因 ' + String(last.failureCode) + '——就绪只看日志事实，不用界面倒计时。'
              : verdict === 'retrying' && last !== null ? '重试进行中（' + describeAttempt(last) + ' 尝试已开始）：等待本轮进展；这不是失败，也不是需要重复提交。'
                : verdict === 'ready' ? '已恢复（就绪）：重试等待成功后本轮已有输出（服务事实：llm/retry-started + 消息）——无需重复提交。'
                  : verdict === 'unknown' ? '结果未知：该等待所在轮次已结束且未见恢复证据——只给核对（重新读取），不给重试。'
                    : '当前没有进行中的模型排队或重试。';
      }
      if (modelQueueRows !== null) {
        modelQueueRows.textContent = '';
        for (const entry of read ? retries : []) {
          if (entry === null || typeof entry !== 'object' || typeof entry.retryId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.modelQueueRetry = entry.retryId;
          const label = document.createElement('strong');
          label.textContent = describeAttempt(entry) + ' · 服务端延迟 ' + String(entry.delayMs) + ' ms';
          row.appendChild(label);
          const source = document.createElement('span');
          source.className = 'sage-roster-tag';
          source.textContent = '提供方：' + String(entry.provider ?? '未标注') + ' · 原因：' + String(entry.failureCode ?? '未标注');
          row.appendChild(source);
          const state = document.createElement('span');
          state.className = 'sage-roster-tag';
          state.textContent = entry.started === true ? '尝试已开始' : '等待中（服务端安排）';
          row.appendChild(state);
          modelQueueRows.appendChild(row);
        }
        if (verdict === 'unknown') {
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          const verify = document.createElement('button');
          verify.className = 'sage-row-button';
          verify.type = 'button';
          verify.dataset.modelQueueVerify = 'last';
          verify.textContent = '核对（重新读取）';
          row.appendChild(verify);
          modelQueueRows.appendChild(row);
        }
      }
    }

    // 041：外部授权等待（未批准也未失败）；批准=仅此一次；撤回是具名动作；失效需重新申请。
    function renderApprovals(payload) {
      if (approvalNote === null && approvalCards === null && approvalLapsed === null && approvalReceipts === null) return;
      const approvals = payload !== null && typeof payload === 'object' && payload.sessionApprovals !== null && typeof payload.sessionApprovals === 'object'
        ? payload.sessionApprovals
        : null;
      const read = approvals !== null && approvals.state === 'read';
      const pendingCards = read && Array.isArray(approvals.pending) ? approvals.pending : [];
      const lapsedCards = read && Array.isArray(approvals.lapsed) ? approvals.lapsed : [];
      const receipts = read && Array.isArray(approvals.receipts) ? approvals.receipts : [];
      if (approvalNote !== null && approvalLocalNotice === null) {
        approvalNote.textContent = approvals === null || approvals.state === 'unavailable'
          ? '未核验：授权等待端口未接线（' + String(approvals?.code ?? 'approval-relay-unavailable') + '）；不以空列表冒充。'
          : approvals.state === 'no-session' ? '还没有会话：没有进行中的外部授权等待（读取不会创建会话）。'
            : pendingCards.length > 0 ? '等待授权 ' + String(pendingCards.length) + ' 项：未批准前依赖动作保持阻断（等待≠失败，也≠已批准）。'
              : '当前没有进行中的授权等待：未获授权的依赖动作保持阻断。';
      }
      if (approvalCards !== null) {
        approvalCards.textContent = '';
        for (const card of pendingCards) {
          if (card === null || typeof card !== 'object' || typeof card.requestId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.approvalRequest = card.requestId;
          const scope = document.createElement('strong');
          scope.textContent = '等待授权：' + String(card.toolName ?? '未知工具');
          row.appendChild(scope);
          const source = document.createElement('span');
          source.className = 'sage-roster-tag';
          source.textContent = '来源：' + (typeof card.reason === 'string' && card.reason !== '' ? card.reason : '未提供说明');
          row.appendChild(source);
          if (typeof card.callId === 'string' && card.callId !== '') {
            const call = document.createElement('span');
            call.className = 'sage-roster-tag';
            call.textContent = '调用：' + card.callId;
            row.appendChild(call);
          }
          const approve = document.createElement('button');
          approve.className = 'sage-row-button';
          approve.type = 'button';
          approve.dataset.approvalAnswer = 'allowed-once';
          approve.dataset.approvalRequestId = card.requestId;
          approve.textContent = '批准（仅此一次）';
          row.appendChild(approve);
          const reject = document.createElement('button');
          reject.className = 'sage-row-button';
          reject.type = 'button';
          reject.dataset.approvalAnswer = 'rejected';
          reject.dataset.approvalRequestId = card.requestId;
          reject.textContent = '拒绝';
          row.appendChild(reject);
          if (card.withdrawable === true) {
            const withdraw = document.createElement('button');
            withdraw.className = 'sage-row-button';
            withdraw.type = 'button';
            withdraw.dataset.approvalWithdraw = card.requestId;
            withdraw.textContent = '撤回等待';
            row.appendChild(withdraw);
          } else {
            const locked = document.createElement('span');
            locked.className = 'sage-roster-tag';
            locked.textContent = '不可撤回（请求方未提供取消能力）';
            row.appendChild(locked);
          }
          approvalCards.appendChild(row);
        }
      }
      if (approvalLapsed !== null) {
        approvalLapsed.textContent = '';
        for (const entry of lapsedCards) {
          if (entry === null || typeof entry !== 'object' || typeof entry.requestId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.textContent = '已失效：' + String(entry.toolName ?? '未知工具') + '（' + (entry.lapse === 'stopped' ? '会话已停止' : '等待已消失') + '）——需重新申请；旧等待不会自动兑现为执行条件。';
          approvalLapsed.appendChild(row);
        }
      }
      if (approvalReceipts !== null) {
        approvalReceipts.textContent = '';
        for (const receipt of receipts) {
          if (receipt === null || typeof receipt !== 'object' || typeof receipt.requestId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.approvalReceipt = receipt.requestId;
          const text = document.createElement('span');
          text.className = 'sage-roster-tag';
          if (receipt.state === 'accepted') {
            text.textContent = receipt.outcome === 'withdrawn'
              ? '撤回已提交：等待生效证据（等待不会兑现为执行条件）。'
              : receipt.outcome === 'allowed-once' ? '批准已提交（仅此一次）：等待生效证据——未生效前不显示为已批准。' : '拒绝已提交：等待生效证据。';
          } else if (receipt.state === 'effective') {
            text.textContent = receipt.outcome === 'allowed-once' ? '已批准（仅此一次，有日志证据）。' : '已拒绝（有日志证据）。';
          } else if (receipt.state === 'lapsed') {
            text.textContent = '已失效：' + String(receipt.code ?? '等待结束') + '——需重新申请；不代表已批准。';
          } else {
            text.textContent = '结果未知：只给核对，不自动重试；未确认前不显示为已批准。';
          }
          row.appendChild(text);
          if (receipt.state === 'accepted' || receipt.state === 'unknown') {
            const verify = document.createElement('button');
            verify.className = 'sage-row-button';
            verify.type = 'button';
            verify.dataset.approvalVerify = receipt.requestId;
            verify.textContent = '核对（重新读取）';
            row.appendChild(verify);
          }
          approvalReceipts.appendChild(row);
        }
      }
    }

    // 014：附件块渲染。传输中/内容核验/随消息发出各自成态；"上传成功"不写成"模型已读取"。
    function renderAttachments(attachments) {
      if (attachmentItems === null) return;
      const known = attachments !== null && attachments !== undefined && typeof attachments === 'object';
      const items = known && Array.isArray(attachments.items) ? attachments.items : [];
      attachmentItems.textContent = '';
      let storedCount = 0;
      for (const item of items) {
        if (item === null || typeof item !== 'object' || typeof item.itemId !== 'string') continue;
        const stage = typeof item.stage === 'string' ? item.stage : 'candidate';
        if (stage === 'stored') storedCount += 1;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.attachmentId = item.itemId;
        row.dataset.attachmentStage = stage;
        const tag = document.createElement('span');
        tag.className = 'sage-roster-tag';
        tag.textContent = stage === 'candidate' ? '候选（未上传）'
          : stage === 'uploading' ? '传输中 ' + String(item.sentBytes ?? 0) + '/' + String(item.bytes) + ' 字节'
            : stage === 'stored' ? '已上传 · 内容核验通过（将随下一条消息发送）'
              : stage === 'sent' ? '已随消息发送（关联于该会话）'
                : stage === 'failed' ? '上传失败（可重试同一封存版本）'
                  : stage === 'source-changed' ? '源内容在选取与上传间发生变化（需重新选择）'
                    : '已取消（不会随消息发送）';
        row.appendChild(tag);
        const name = document.createElement('span');
        name.textContent = String(item.name ?? '') + '（' + String(item.bytes ?? 0) + ' 字节）';
        row.appendChild(name);
        const actions = stage === 'candidate' ? ['upload', 'cancel'] : stage === 'failed' ? ['upload', 'cancel'] : stage === 'uploading' ? ['cancel'] : stage === 'stored' ? ['cancel'] : [];
        for (const action of actions) {
          const button = document.createElement('button');
          button.className = 'sage-row-button';
          button.type = 'button';
          button.dataset.attachmentAction = action;
          button.dataset.attachmentId = item.itemId;
          button.textContent = action === 'upload' ? (stage === 'failed' ? '重试上传' : '确认上传') : action === 'cancel' ? (stage === 'uploading' ? '取消上传' : '移除') : action;
          row.appendChild(button);
        }
        attachmentItems.appendChild(row);
      }
      if (attachmentNote !== null && attachmentLocalNotice === null) {
        attachmentNote.textContent = !known ? '未核验：这一版还没有接上附件端口。'
          : storedCount > 0 ? String(storedCount) + ' 项已上传（内容核验通过），将随下一条消息发送；发送与否以会话受理回执为准。'
            : items.length > 0 ? '候选尚未上传；"确认上传"才会经运行时上传并核验内容。'
              : '';
      }
    }

    // 022：事项列表分区。由 main 推导，renderer 只按 partition 字段分组呈现，绝不自判。
    let lastMatterList = null;
    let matterContextLocalNotice = null;
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

    function setMatterListNote(base, context) {
      if (matterListNote === null) return;
      if (matterContextLocalNotice !== null) {
        matterListNote.dataset.contextSelectionNote = matterContextLocalNotice.kind;
        matterListNote.textContent = base + ' ' + matterContextLocalNotice.text;
        return;
      }
      if (context === null) {
        matterListNote.dataset.contextSelectionNote = 'unavailable';
        matterListNote.textContent = base + ' 事项选择未接线：activeContext 未读取或格式无效；选择按钮已禁用。';
        return;
      }
      matterListNote.dataset.contextSelectionNote = 'ready';
      matterListNote.textContent = base;
    }

    function appendMatterContextControl(row, item, context) {
      if (item.lifecycle === 'archived') return;
      const rawMatterId = typeof item.matterRef === 'string' ? item.matterRef : '';
      const matterId = rawMatterId !== '' && rawMatterId.trim() === rawMatterId ? rawMatterId : '';
      if (matterId === '') return;
      const active = context !== null && context.state === 'active' && context.matterId === matterId;
      const button = document.createElement('button');
      button.className = 'sage-row-button';
      button.type = 'button';
      button.dataset.matterContextAction = 'select';
      button.dataset.matterContextState = active ? 'active' : context === null ? 'unavailable' : 'selectable';
      button.dataset.matterId = matterId;
      button.dataset.contextGeneration = context === null ? '' : String(context.contextGeneration);
      button.textContent = active ? '当前事项' : '选择事项';
      button.disabled = active || context === null;
      row.appendChild(button);
    }

    function renderMatterList(payload) {
      if (matterRowsAction === null || matterRowsProgress === null) return;
      const list = payload !== null && typeof payload === 'object' && payload.matterList !== null && typeof payload.matterList === 'object'
        ? payload.matterList
        : null;
      const activeContext = activeMatterContextOf(payload);
      if (matterContextLocalNotice !== null
        && (activeContext === null || matterContextLocalNotice.contextGeneration !== activeContext.contextGeneration)) {
        matterContextLocalNotice = null;
      }
      lastMatterList = list;
      const showAll = matterListAll !== null && matterListAll.checked === true;
      const known = list !== null && typeof list.state === 'string';
      const state = known ? list.state : 'unavailable';
      matterRowsAction.textContent = '';
      matterRowsProgress.textContent = '';
      // 023：侧栏计数与卡片计数是同一份投影事实（matterList.counts）——没有第二份"未读"。
      if (navMatterCount !== null) navMatterCount.hidden = true;
      if (!known || state !== 'read') {
        if (matterCountAction !== null) matterCountAction.textContent = '—';
        if (matterCountProgress !== null) matterCountProgress.textContent = '—';
        if (matterCountAcceptance !== null) matterCountAcceptance.textContent = '—';
        if (matterAcceptanceNote !== null) matterAcceptanceNote.textContent = '';
        setMatterListNote(!known ? '列表未核验：这一版还没有接上事项列表。'
          : '列表未核验：' + String(list.code ?? 'unknown') + '（不显示仿造行——fixture 不当列表数据）。', activeContext);
        return;
      }
      const items = Array.isArray(list.items) ? list.items : [];
      // The view filters by lifecycle only; membership itself is main's derivation (US-092/095).
      const visible = items.filter((item) => item !== null && typeof item === 'object'
        && (showAll || item.lifecycle !== 'archived'));
      for (const item of visible) {
        if (typeof item.title !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.matterItem = String(item.itemId ?? '');
        row.dataset.matterPartition = String(item.partition ?? '');
        const name = document.createElement('strong');
        name.textContent = item.title;
        row.appendChild(name);
        // 029：归档行只在筛选展开时可见；标签明说可恢复且不等于停止执行（US-154）。
        if (item.lifecycle === 'archived') {
          const archivedTag = document.createElement('span');
          archivedTag.className = 'sage-roster-tag is-blocked';
          archivedTag.dataset.matterLifecycle = 'archived';
          archivedTag.textContent = '已归档（可恢复；≠停止执行）';
          row.appendChild(archivedTag);
        }
        if (item.partition === 'action') {
          const triggers = Array.isArray(item.triggers) ? item.triggers : [];
          for (const trigger of triggers) {
            const tag = document.createElement('span');
            tag.className = 'sage-roster-tag';
            tag.dataset.matterTrigger = String(trigger.kind ?? '');
            tag.textContent = trigger.kind === 'attempt-unknown' ? '触发：建项结果未知（核对同一请求）— ' + String(trigger.ref ?? '')
              : trigger.kind === 'attempt-failed' ? '触发：建项确认失败（修正后可重试）— ' + String(trigger.ref ?? '')
                : trigger.kind === 'pending-inputs' ? '触发：待继续输入 ' + String(trigger.count ?? 0) + ' 条（点「继续」才派发）'
                  : '触发：' + String(trigger.kind ?? 'unknown');
            row.appendChild(tag);
          }
          appendMatterContextControl(row, item, activeContext);
          matterRowsAction.appendChild(row);
          continue;
        }
        if (item.partition === 'in-progress') {
          const when = document.createElement('span');
          when.className = 'sage-roster-tag';
          when.textContent = '最近更新 ' + String(item.updatedAt ?? '');
          row.appendChild(when);
          appendMatterContextControl(row, item, activeContext);
          matterRowsProgress.appendChild(row);
        }
        // 待验收 items are counted, never listed (US-094).
      }
      const actionCount = visible.filter((item) => item.partition === 'action').length;
      if (matterCountAction !== null) matterCountAction.textContent = String(actionCount);
      if (navMatterCount !== null) {
        navMatterCount.hidden = actionCount === 0;
        navMatterCount.textContent = String(actionCount);
        navMatterCount.setAttribute('aria-label', '待我处理 ' + String(actionCount) + ' 项');
      }
      if (matterCountProgress !== null) matterCountProgress.textContent = String(visible.filter((item) => item.partition === 'in-progress').length);
      const acceptance = visible.filter((item) => item.partition === 'acceptance');
      if (matterCountAcceptance !== null) matterCountAcceptance.textContent = String(acceptance.length);
      if (matterAcceptanceNote !== null) {
        matterAcceptanceNote.textContent = acceptance.length === 0 ? '' : '待验收只显示计数：' + String(acceptance.length) + ' 项有观察到的产物候选；分项验收与整体完成语义未收口，本版不定义。';
      }
      setMatterListNote(visible.length === 0 ? '还没有任何事项记录（草案建项或出现待处理事实后才会出现在这里）。'
        : (showAll ? '显示全部（含归档/完成——本版还没有这类事实来源，与默认一致）。' : '默认不展开归档/完成；分区由 main 每次读取重新推导。'), activeContext);
    }
    if (matterListAll !== null) {
      matterListAll.addEventListener('change', () => { renderMatterList(lastStatePayload); });
    }

    async function selectActiveMatter(matterId, expectedContextGeneration) {
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
        matterContextLocalNotice = null;
        queueMicrotask(() => { void refresh(); });
        return;
      }
      const code = isRecord(outcome) && isNonEmptyString(outcome.code)
        ? outcome.code
        : 'context-select-invalid-response';
      matterContextLocalNotice = {
        kind: isRecord(outcome) && outcome.state === 'refused' ? 'refused' : 'invalid',
        text: '事项选择未完成：' + code + '。',
        contextGeneration: expectedContextGeneration,
      };
      renderMatterList(lastStatePayload);
    }

    function registerMatterContextSelection(container) {
      if (container === null) return;
      container.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-matter-context-action]') ?? null;
        if (button === null || button.disabled) return;
        const matterId = typeof button.dataset.matterId === 'string' ? button.dataset.matterId : '';
        const expectedContextGeneration = Number(button.dataset.contextGeneration);
        const currentContext = activeMatterContextOf(lastStatePayload);
        if (matterId === '' || !Number.isSafeInteger(expectedContextGeneration)
          || currentContext === null || currentContext.contextGeneration !== expectedContextGeneration) {
          matterContextLocalNotice = currentContext === null ? null : {
            kind: 'invalid',
            text: '事项选择未完成：context-select-client-stale。',
            contextGeneration: currentContext.contextGeneration,
          };
          renderMatterList(lastStatePayload);
          return;
        }
        button.disabled = true;
        void selectActiveMatter(matterId, expectedContextGeneration)
          .finally(() => { button.disabled = false; });
      });
    }
    registerMatterContextSelection(matterRowsAction);
    registerMatterContextSelection(matterRowsProgress);

    // 024：侧聊列表（派生记录）。打开/发送只动子会话；带回主对话是显式动作。
    function renderSideChats(payload) {
      if (sideChatRows === null) return;
      const status = payload !== null && typeof payload === 'object' && payload.sideChats !== null && typeof payload.sideChats === 'object'
        ? payload.sideChats
        : null;
      const known = status !== null && typeof status.state === 'string';
      sideChatRows.textContent = '';
      if (!known || status.state !== 'read') {
        if (sideChatNote !== null && sideChatLocalNotice === null) {
          sideChatNote.textContent = !known ? '侧聊未核验：这一版还没有接上侧聊记录。'
            : '侧聊未核验：' + String(status.code ?? 'unknown') + '。';
        }
        return;
      }
      const items = Array.isArray(status.items) ? status.items : [];
      for (const item of items) {
        if (item === null || typeof item !== 'object' || typeof item.sideChatId !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.sideChat = item.sideChatId;
        const tag = document.createElement('span');
        tag.className = 'sage-roster-tag';
        tag.textContent = item.execution === 'executing' ? '侧聊 · 执行中'
          : item.execution === 'not-read' ? '侧聊 · 未读'
            : item.lastTurnEnd !== null ? '侧聊 · 本轮已结束（' + String(item.lastTurnEnd) + '）' : '侧聊 · 空闲';
        row.appendChild(tag);
        const id = document.createElement('span');
        id.textContent = item.sideChatId + '（派生自 ' + String(item.createdAt ?? '') + (item.atSeq === null ? ' · 从最后一个完成轮' : ' · 锚点 ' + String(item.atSeq)) + '）';
        row.appendChild(id);
        const view = document.createElement('button');
        view.className = 'sage-row-button';
        view.type = 'button';
        view.dataset.sideChatAction = 'view';
        view.dataset.sideChat = item.sideChatId;
        view.textContent = '单独回看';
        row.appendChild(view);
        sideChatRows.appendChild(row);
      }
      if (sideChatNote !== null && sideChatLocalNotice === null) {
        sideChatNote.textContent = items.length === 0 ? '还没有侧聊；派生一条不会改动主对话历史。'
          : String(items.length) + ' 条侧聊记录（独立投影，不混排进主对话）。';
      }
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

    function renderSideTranscript(outcome) {
      if (sideChatTranscript === null) return;
      sideChatTranscript.textContent = '';
      const channel = outcome !== null && typeof outcome === 'object' && outcome.channel !== null && typeof outcome.channel === 'object' ? outcome.channel : null;
      const transcript = channel !== null && Array.isArray(channel.transcript) ? channel.transcript : [];
      for (const entry of transcript) {
        if (entry === null || typeof entry !== 'object' || typeof entry.text !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.sideChatEntry = String(entry.role);
        const tag = document.createElement('span');
        tag.className = 'sage-roster-tag';
        tag.textContent = entry.role === 'user' ? '我（侧聊回显）' : '助手 · 历史';
        row.appendChild(tag);
        const body = document.createElement('span');
        body.textContent = entry.text;
        row.appendChild(body);
        sideChatTranscript.appendChild(row);
      }
      if (sideChatViewNote !== null && sideChatLocalNotice === null) {
        const execution = channel !== null && typeof channel.execution === 'string' ? channel.execution : 'idle';
        sideChatViewNote.textContent = execution === 'executing' ? '子会话执行中（侧聊内容仍与主对话独立）。' : '';
      }
    }

    if (sideChatCreate !== null) {
      sideChatCreate.addEventListener('click', () => {
        const context = currentSendContext();
        if (context === null) {
          sideChatLocalNotice = '先在上面选好事项与工作区：派生不会自动替你挑一个。';
          if (sideChatNote !== null) sideChatNote.textContent = sideChatLocalNotice;
          return;
        }
        sideChatLocalNotice = null;
        sideChatCreate.disabled = true;
        void postSideChat({ action: 'create', matterRef: context.matterRef }).then((outcome) => {
          const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
          if (state === 'created') {
            sideChatLocalNotice = '已派生侧聊 ' + String(outcome.item && outcome.item.sideChatId) + '（子会话，独立上下文；主对话历史未改动）。';
          } else {
            sideChatLocalNotice = '派生没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '（会如实说明是"尚无已完成轮"还是其他原因）。';
          }
          if (sideChatNote !== null) sideChatNote.textContent = sideChatLocalNotice;
        }).finally(() => { if (sideChatCreate !== null) sideChatCreate.disabled = false; });
      });
    }
    if (sideChatRows !== null) {
      sideChatRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-side-chat-action]') ?? null;
        if (button === null || button.disabled) return;
        const sideChatId = typeof button.dataset.sideChat === 'string' ? button.dataset.sideChat : '';
        if (sideChatId === '') return;
        sideChatLocalNotice = null;
        button.disabled = true;
        void postSideChat({ action: 'read', sideChatId }).then((outcome) => {
          if (outcome === null || typeof outcome !== 'object' || outcome.state !== 'read') {
            sideChatLocalNotice = '回看失败：' + String((outcome && outcome.code) ?? 'unknown') + '。';
            if (sideChatNote !== null) sideChatNote.textContent = sideChatLocalNotice;
            return;
          }
          currentSideChatId = sideChatId;
          if (sideChatView !== null) sideChatView.hidden = false;
          if (sideChatViewLabel !== null) sideChatViewLabel.textContent = '侧聊内容 · ' + sideChatId + '（独立于主对话）';
          renderSideTranscript(outcome);
        }).finally(() => { if (button !== null) button.disabled = false; });
      });
    }
    if (sideChatSend !== null) {
      sideChatSend.addEventListener('click', () => {
        const text = sideChatInput !== null && typeof sideChatInput.value === 'string' ? sideChatInput.value.trim() : '';
        if (currentSideChatId === null || text === '') {
          sideChatLocalNotice = '先打开一条侧聊并写好输入。';
          if (sideChatViewNote !== null) sideChatViewNote.textContent = sideChatLocalNotice;
          return;
        }
        sideChatLocalNotice = null;
        sideChatSend.disabled = true;
        void postSideChat({ action: 'send', sideChatId: currentSideChatId, text }).then((outcome) => {
          const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
          if (state === 'accepted') {
            sideChatLocalNotice = '已发送到侧聊（受理≠执行；这条只在子会话里）。';
          } else {
            sideChatLocalNotice = '发送没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '（主对话不受影响）。';
          }
          if (sideChatViewNote !== null) sideChatViewNote.textContent = sideChatLocalNotice;
          return postSideChat({ action: 'read', sideChatId: currentSideChatId }).then((fresh) => {
            if (fresh !== null && typeof fresh === 'object' && fresh.state === 'read') renderSideTranscript(fresh);
          });
        }).finally(() => { if (sideChatSend !== null) sideChatSend.disabled = false; });
      });
    }
    if (sideChatReturn !== null) {
      sideChatReturn.addEventListener('click', () => {
        const text = sideChatInput !== null && typeof sideChatInput.value === 'string' ? sideChatInput.value.trim() : '';
        if (currentSideChatId === null || text === '') {
          sideChatLocalNotice = '先打开一条侧聊并写好要带回的文本。';
          if (sideChatViewNote !== null) sideChatViewNote.textContent = sideChatLocalNotice;
          return;
        }
        sideChatLocalNotice = null;
        sideChatReturn.disabled = true;
        void postSideChat({ action: 'return', sideChatId: currentSideChatId, text }).then((outcome) => {
          const state = outcome !== null && typeof outcome === 'object' ? outcome.state : '';
          sideChatLocalNotice = state === 'accepted'
            ? '已把这段文本作为主对话输入发出（受理≠执行；侧聊历史未改动）。'
            : '带回没有完成：' + String((outcome && outcome.code) ?? 'unknown') + '。';
          if (sideChatViewNote !== null) sideChatViewNote.textContent = sideChatLocalNotice;
        }).finally(() => { if (sideChatReturn !== null) sideChatReturn.disabled = false; });
      });
    }
    if (sideChatViewClose !== null) {
      sideChatViewClose.addEventListener('click', () => {
        currentSideChatId = null;
        if (sideChatView !== null) sideChatView.hidden = true;
      });
    }

    // 021：搜索两区。事项=本地匹配；会话=运行时检索（不可用与"无结果"分开说）。命中只读。
    function renderSearchOutcome(outcome) {
      if (searchMatterRows === null || searchSessionState === null || searchSessionRows === null) return;
      const known = outcome !== null && outcome !== undefined && typeof outcome === 'object';
      const state = known && typeof outcome.state === 'string' ? outcome.state : '';
      searchMatterRows.textContent = '';
      searchSessionRows.textContent = '';
      if (!known || state === 'refused') {
        searchSessionState.textContent = '';
        if (searchNote !== null) searchNote.textContent = !known ? '搜索没有返回可读结果。' : '搜索被拒绝：' + String(outcome.code ?? 'unknown') + '。';
        return;
      }
      const matters = Array.isArray(outcome.matters) ? outcome.matters : [];
      for (const hit of matters) {
        if (hit === null || typeof hit !== 'object' || typeof hit.matterRef !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.searchMatter = hit.matterRef;
        const tag = document.createElement('span');
        tag.className = 'sage-roster-tag';
        const fieldLabel = hit.matchedField === 'goal' ? '标题' : hit.matchedField === 'deliverable' ? '交付' : hit.matchedField === 'responsibility' ? '责任' : '项目';
        tag.textContent = '命中：' + fieldLabel + '（本地记录）';
        row.appendChild(tag);
        const title = document.createElement('span');
        title.textContent = String(hit.title ?? hit.matterRef);
        row.appendChild(title);
        searchMatterRows.appendChild(row);
      }
      const sessions = outcome.sessions !== null && typeof outcome.sessions === 'object' ? outcome.sessions : { state: 'failed', code: 'search-unrecognised' };
      if (sessions.state === 'available') {
        const items = Array.isArray(sessions.items) ? sessions.items : [];
        for (const item of items) {
          if (item === null || typeof item !== 'object' || typeof item.sessionId !== 'string') continue;
          const row = document.createElement('li');
          row.className = 'sage-roster-row';
          row.dataset.searchSession = item.sessionId;
          const tag = document.createElement('span');
          tag.className = 'sage-roster-tag';
          tag.textContent = '会话命中';
          row.appendChild(tag);
          const snippet = document.createElement('span');
          snippet.textContent = String(item.snippet ?? '');
          row.appendChild(snippet);
          searchSessionRows.appendChild(row);
        }
        searchSessionState.textContent = items.length === 0
          ? '检索可用：没有命中的会话（"无结果"说的是这件事）。'
          : (sessions.hasMore === true ? '检索可用：显示前 ' + String(items.length) + ' 条，还有更多命中未列出。' : '检索可用：' + String(items.length) + ' 条命中。');
      } else if (sessions.state === 'unavailable') {
        searchSessionState.textContent = '会话检索不可用：运行时没有挂载 dsh-session-query（这不是"无结果"；事项本地匹配不受影响）。';
      } else {
        searchSessionState.textContent = '会话检索失败：' + String(sessions.code ?? 'unknown') + '（这不是"无结果"）。';
      }
      if (searchNote !== null && searchLocalNotice === null) {
        searchNote.textContent = '查询"' + String(outcome.query ?? '') + '"：事项 ' + String(matters.length) + ' 条命中；会话区见下。命中只是文本，点击不会打开会话或加载正文。';
      }
    }
    if (searchRun) {
      const runSearch = () => {
        // 分页/重复点击不并发重复：在途期间再点直接忽略（同一时刻至多一个查询）。
        if (searchInFlight) return;
        const raw = searchInput !== null && typeof searchInput.value === 'string' ? searchInput.value : '';
        const query = raw.trim();
        if (query === '') {
          searchLocalNotice = '先写关键词再搜索。';
          if (searchNote !== null) searchNote.textContent = searchLocalNotice;
          return;
        }
        searchLocalNotice = null;
        searchInFlight = true;
        searchRun.disabled = true;
        void (async () => {
          let outcome = null;
          try {
            const response = await fetchWithinDeadline('/.sage/search', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ query }),
            });
            outcome = await response.json();
          } catch { /* 查询失败按拒绝句显示 */ }
          renderSearchOutcome(outcome);
        })().finally(() => {
          searchInFlight = false;
          if (searchRun !== null) searchRun.disabled = false;
        });
      };
      searchRun.addEventListener('click', runSearch);
      if (searchInput !== null) {
        searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') runSearch();
        });
      }
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

    // 011：关联面。列表默认只显示已关联项；操作记录是只读的留痕（谁/何时/哪一步）。
    function renderMatterLinks(payload) {
      if (linkRows === null) return;
      const state = payload !== null && typeof payload === 'object' ? payload.matterLinks : null;
      const known = state !== null && state !== undefined && typeof state === 'object';
      const links = known && Array.isArray(state.links) ? state.links : [];
      const trail = known && Array.isArray(state.trail) ? state.trail : [];
      const matters = draftOf(payload).drafts.filter((entry) => entry !== null && typeof entry === 'object' && entry.status === 'converted' && typeof entry.matterRef === 'string' && entry.matterRef !== '');
      const workspaces = payload !== null && typeof payload === 'object' && payload.workspaces !== null && typeof payload.workspaces === 'object' && Array.isArray(payload.workspaces.entries)
        ? payload.workspaces.entries
        : [];

      const fillSelect = (node, options, labelOf) => {
        if (node === null) return;
        const previous = node.value;
        node.textContent = '';
        for (const option of options) {
          const element = document.createElement('option');
          element.value = option.value;
          element.textContent = option.label;
          node.appendChild(element);
        }
        if (options.length === 0) {
          const element = document.createElement('option');
          element.value = '';
          element.textContent = labelOf;
          node.appendChild(element);
          node.value = '';
          return;
        }
        node.value = options.some((option) => option.value === previous) ? previous : String(options[0].value);
      };
      fillSelect(linkMatter, matters.map((entry) => ({ value: entry.matterRef, label: (typeof entry.fields.goal === 'string' && entry.fields.goal !== '' ? entry.fields.goal : entry.matterRef) + '　' + entry.matterRef })), '（本设备还没有已建项的事项）');
      fillSelect(linkWorkspace, workspaces.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.workspaceId === 'string').map((entry) => ({ value: entry.workspaceId, label: (typeof entry.title === 'string' && entry.title !== '' ? entry.title : entry.workspaceId) + '　' + String(entry.path ?? '') })), '（还没有已采纳的工作区）');

      if (linkNote !== null && linkLocalNotice === null) {
        if (!known || state.state !== 'read') {
          linkNote.textContent = '未核验：这一版还没有接上关联存储。';
        } else if (trail.length === 0) {
          linkNote.textContent = '还没有任何关联操作记录。';
        } else {
          linkNote.textContent = '操作记录 ' + String(trail.length) + ' 条（只读留痕）。';
        }
      }
      if (linkRows === null) return;
      linkRows.textContent = '';
      // Default view: linked entries only — an unlinked workspace is absent, not "已解除".
      for (const link of links) {
        if (link === null || typeof link !== 'object') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.linkKey = String(link.matterRef) + '|' + String(link.workspaceRef);
        const name = document.createElement('strong');
        name.textContent = String(link.workspacePath !== '' ? link.workspacePath : link.workspaceRef);
        row.appendChild(name);
        const matter = document.createElement('span');
        matter.className = 'sage-roster-tag';
        matter.textContent = '事项 ' + String(link.matterRef);
        row.appendChild(matter);
        if (link.isDefault === true) {
          const badge = document.createElement('span');
          badge.className = 'sage-roster-tag is-ok';
          badge.textContent = '默认执行环境';
          row.appendChild(badge);
        }
        linkRows.appendChild(row);
      }
      if (linkTrail === null) return;
      linkTrail.textContent = '';
      const actionLabels = { 'linked': '建立关联', 'unlinked': '解除关联', 'default-set': '设为默认', 'default-cleared': '清除默认' };
      for (const record of trail) {
        if (record === null || typeof record !== 'object') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.trailId = String(record.linkId);
        const step = document.createElement('span');
        step.className = 'sage-roster-tag';
        step.textContent = actionLabels[record.action] ?? String(record.action);
        row.appendChild(step);
        const label = document.createElement('span');
        label.textContent = String(record.matterRef) + (record.workspaceRef === undefined ? '' : ' → ' + String(record.workspaceRef));
        row.appendChild(label);
        const when = document.createElement('span');
        when.className = 'sage-roster-tag';
        when.textContent = String(record.at);
        row.appendChild(when);
        linkTrail.appendChild(row);
      }
    }

    function historyCount(draft) {
      return Array.isArray(draft !== null && draft !== undefined && typeof draft === 'object' ? draft.history : null) ? draft.history.length : 0;
    }

    function draftSelections() {
      if (draftHistory === null) return [];
      // Real DOM: children 是 HTMLCollection（没有数组方法）——2026-10-03 真机探针抓到
      // .filter 直呼会让「保存草案」点击在实机抛 TypeError、整条保存链不发包；Fake DOM
      // 的 children 是数组，测不出这一类。这里必须先转数组。
      return Array.from(draftHistory.children)
        .filter((row) => row.dataset.historyEntryId !== undefined && row.querySelector('[data-history-toggle]') !== null)
        .filter((row) => row.querySelector('[data-history-toggle]').checked === true)
        .map((row) => row.dataset.historyEntryId);
    }

    function draftFieldValues() {
      const valueOf = (node) => (node !== null && typeof node.value === 'string' ? node.value : '');
      return {
        goal: valueOf(draftGoal),
        deliverable: valueOf(draftDeliverable),
        responsibility: valueOf(draftResponsibility),
        projectRef: valueOf(draftProject),
      };
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
    // US-043/044/047: structure and state only. "已保存" never means "可用"; credentials are a
    // count, not a value; nothing here can edit a setting.
    function renderModelConfig(modelConfig) {
      if (modelRows === null || modelTest === null || modelNote === null) return;
      const known = modelConfig !== null && modelConfig !== undefined && typeof modelConfig === 'object';
      const read = known && modelConfig.state === 'read';
      modelRows.textContent = '';
      // The connectivity field is its own fact from the projection; the view words it, it never
      // invents it (an unknown value must not read as "tested").
      modelTest.textContent = known && modelConfig.connectivityTest === 'untested'
        ? '连通性：未测试（保存配置不代表供应商已被调用过）。'
        : '连通性：无法核验。';
      if (!read) {
        const reason = known && typeof modelConfig.reason === 'string' ? modelConfig.reason : 'not-read';
        modelNote.textContent = modelConfigReasonNotes[reason] ?? modelConfigReasonNotes['not-read'];
        return;
      }
      const rows = Array.isArray(modelConfig.namespaces) ? modelConfig.namespaces : [];
      if (rows.length === 0) {
        modelNote.textContent = '未就绪：这份配置文档里还没有任何命名空间。';
        return;
      }
      let missingSecrets = 0;
      for (const entry of rows) {
        if (entry === null || typeof entry !== 'object' || typeof entry.ns !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.modelNamespace = entry.ns;
        const name = document.createElement('strong');
        name.textContent = entry.ns;
        row.appendChild(name);
        const saved = document.createElement('span');
        saved.className = 'sage-roster-tag';
        saved.textContent = entry.saved === 'user' ? '已保存' : entry.saved === 'base-only' ? '仅默认值' : '未配置';
        row.appendChild(saved);
        const applies = document.createElement('span');
        applies.className = 'sage-roster-tag ' + (entry.applies === 'live' ? 'is-ok' : 'is-blocked');
        applies.textContent = entry.applies === 'live' ? '立即生效' : '需重启';
        row.appendChild(applies);
        const secrets = entry.secrets !== null && typeof entry.secrets === 'object' ? entry.secrets : { set: 0, total: 0 };
        const total = typeof secrets.total === 'number' ? secrets.total : 0;
        const set = typeof secrets.set === 'number' ? secrets.set : 0;
        if (total > set) missingSecrets += 1;
        const credential = document.createElement('span');
        credential.className = 'sage-roster-tag ' + (total === 0 || set === total ? 'is-ok' : 'is-blocked');
        credential.textContent = total === 0 ? '凭据：此命名空间不需要' : '凭据：已设置 ' + String(set) + '/' + String(total);
        row.appendChild(credential);
        modelRows.appendChild(row);
      }
      // Partial failure must never read as a finished item: the note names the gap instead.
      modelNote.textContent = missingSecrets === 0
        ? '已读 ' + String(rows.length) + ' 个命名空间的结构；配置值与凭据内容都不在本页。'
        : '仍有 ' + String(missingSecrets) + ' 个命名空间缺凭据；缺凭据的项不算配置完成。';
    }

    // US-155~158: the surface prints facts it was given and never upgrades them into a market,
    // an install offer, or "disabled". 已配置 / 已启用 / 可用 stay three separate statements.
    function renderCapability(capability) {
      if (capabilitySource === null || capabilityRows === null || capabilityNote === null) return;
      const known = capability !== null && typeof capability === 'object';
      const presets = known && Array.isArray(capability.agentPresets) ? capability.agentPresets : [];
      const observed = known && capability.observed === true;
      capabilitySource.textContent = observed
        ? '来源：运行时清单观察'
        : known && typeof capability.source === 'string' ? '来源：尚未读到运行时清单' : '来源：等待运行时清单';
      capabilityRows.textContent = '';
      if (!observed) {
        const reason = known && typeof capability.reason === 'string' ? capability.reason : 'observation-not-read';
        capabilityNote.textContent = capabilityReasonNotes[reason] ?? capabilityReasonNotes['observation-not-read'];
        return;
      }
      for (const preset of presets) {
        if (preset === null || typeof preset !== 'object' || typeof preset.id !== 'string') continue;
        const row = document.createElement('li');
        row.className = 'sage-roster-row';
        row.dataset.presetId = preset.id;
        const name = document.createElement('strong');
        name.textContent = preset.id;
        row.appendChild(name);
        const configured = document.createElement('span');
        configured.className = 'sage-roster-tag';
        configured.textContent = '已配置';
        row.appendChild(configured);
        const enabled = document.createElement('span');
        enabled.className = 'sage-roster-tag ' + (preset.state === 'enabled' ? 'is-ok' : 'is-blocked');
        enabled.textContent = preset.state === 'enabled' ? '已启用' : '未启用';
        row.appendChild(enabled);
        const available = document.createElement('span');
        available.className = 'sage-roster-tag is-blocked';
        available.textContent = '可用性：外部能力面未接线，无法核验';
        row.appendChild(available);
        capabilityRows.appendChild(row);
      }
      const blocked = presets.filter((preset) => preset !== null && typeof preset === 'object' && preset.state !== 'enabled').length;
      capabilityNote.textContent = presets.length === 0
        ? '未就绪：运行时清单里没有任何已配置项，这不等于"已停用"。'
        : '已配置 ' + String(presets.length) + ' 项，其中 ' + String(blocked) + ' 项未启用。已启用不等于可用。';
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
          renderCapability(undefined);
          renderModelConfig(undefined);
          return;
        }
        const payload = parseServiceStateEnvelope(statePayload);
        if (payload === null) {
          lastStatePayload = null;
          publishMatterUnavailable('invalid');
          renderAuth(undefined);
          render(fallback());
          renderCommand(null);
          renderCapability(undefined);
          renderModelConfig(undefined);
          return;
        }
        lastStatePayload = payload;
        publishMatterProjection(payload.matter);
        renderAuth(payload.service.auth);
        render(payload.runtime);
        renderCommand(payload.service.command ?? null);
        renderCapability(payload.capability);
        renderModelConfig(payload.modelConfig);
        renderWorkspaceAdoption(payload.workspaceAdoption ?? null);
        renderWorkspaceList(payload.workspaces);
        renderWorkspaceMutation(payload.workspaceMutation ?? null);
        fillFileWorkspaces(payload.workspaces);
        renderFileCandidates(payload.fileCandidates ?? null);
        renderFileReferences(Array.isArray(payload.fileReferences) ? payload.fileReferences : []);
        renderFileUse(payload.fileReferenceUse ?? null);
        renderEditDrafts(payload);
        renderActionItems(payload);
        renderProjects(payload);
        renderMatterAdmin(payload);
        renderMatterGroups(payload);
        publishRunMonitorSlice(payload);
        renderPlans(payload);
        renderExitCards(payload);
        renderDraft(payload);
        renderSiteTemplates(payload);
        renderMatterLinks(payload);
        renderSessionChannel(payload);
        renderApprovals(payload);
        renderModelQueue(payload);
        renderTerminal(payload);
        renderFeedback(payload);
        renderAttachments(payload.attachments ?? null);
        publishArtifactsSlice(payload);
        publishToolResultsSlice(payload);
        publishSitesSlice(payload);
        renderMatterList(payload);
        renderSideChats(payload);
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
        renderCapability(undefined);
        renderModelConfig(undefined);
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
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        if (matterRef === '') {
          editDraftLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项：修改稿属于某个事项。';
          if (editDraftNote !== null) editDraftNote.textContent = editDraftLocalNotice;
          return;
        }
        editDraftLocalNotice = null;
        button.disabled = true;
        void postEditDraft('/.sage/edit-drafts/create', { referenceId, matterRef }).finally(() => { button.disabled = false; });
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

    if (actionItemCreate !== null) {
      actionItemCreate.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        const title = actionItemTitle !== null && typeof actionItemTitle.value === 'string' ? actionItemTitle.value.trim() : '';
        if (matterRef === '') {
          actionItemLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项：行动项属于某个事项。';
          if (actionItemNote !== null) actionItemNote.textContent = actionItemLocalNotice;
          return;
        }
        if (title === '') {
          actionItemLocalNotice = '先写一个行动项标题（≤200 字）。';
          if (actionItemNote !== null) actionItemNote.textContent = actionItemLocalNotice;
          return;
        }
        actionItemLocalNotice = null;
        const body = actionItemBody !== null && typeof actionItemBody.value === 'string' && actionItemBody.value.trim() !== ''
          ? actionItemBody.value.trim() : null;
        actionItemCreate.disabled = true;
        void postActionItem('/.sage/action-items', { action: 'create', matterRef, title, ...(body === null ? {} : { note: body }) })
          .finally(() => { if (actionItemCreate !== null) actionItemCreate.disabled = false; });
      });
    }

    if (actionItemRows !== null) {
      actionItemRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-action-item-action]') ?? null;
        if (button !== null) {
          if (button.disabled === true) return;
          const row = button.closest('[data-action-item-id]');
          const actionId = row === null ? null : row.dataset.actionItemId;
          if (typeof actionId === 'string' && actionId !== '') {
            button.disabled = true;
            void postActionItem('/.sage/action-items', { action: button.dataset.actionItemAction, actionId });
          }
          return;
        }
        const row = event.target?.closest?.('[data-action-item-id]') ?? null;
        if (row === null) return;
        const actionId = row.dataset.actionItemId;
        if (typeof actionId !== 'string' || actionId === '' || actionId === currentActionItemId) return;
        currentActionItemId = actionId;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (correctionOriginal !== null) {
      correctionOriginal.addEventListener('change', () => {
        const index = Number.parseInt(String(correctionOriginal.value), 10);
        if (!Number.isSafeInteger(index) || index < 0 || index >= correctionOriginals.length) return;
        selectedOriginalIndex = index;
        // 「更正此要求」= 编辑副本（D-057）：把选中原要求填进更正框，原消息本身不动。
        if (correctionText !== null) correctionText.value = correctionOriginals[index].text;
      });
    }

    if (correctionSubmit !== null) {
      correctionSubmit.addEventListener('click', () => {
        const context = currentSendContext();
        const entry = correctionOriginals[selectedOriginalIndex];
        const text = correctionText !== null && typeof correctionText.value === 'string' ? correctionText.value.trim() : '';
        if (context === null) {
          correctionLocalNotice = '先选好事项与工作区：更正经主对话的同一发送路径发出。';
          if (correctionNote !== null) correctionNote.textContent = correctionLocalNotice;
          return;
        }
        if (entry === undefined) {
          correctionLocalNotice = '先选一条原要求（已发送的消息）。';
          if (correctionNote !== null) correctionNote.textContent = correctionLocalNotice;
          return;
        }
        if (text === '') {
          correctionLocalNotice = '更正副本还是空的——先写清要改什么。';
          if (correctionNote !== null) correctionNote.textContent = correctionLocalNotice;
          return;
        }
        correctionLocalNotice = null;
        correctionSubmit.disabled = true;
        void postActionItem('/.sage/corrections', {
          matterRef: context.matterRef,
          workspaceRoot: context.workspaceRoot,
          originalText: entry.text,
          ...(entry.at === null ? {} : { originalAt: entry.at }),
          text,
        }).finally(() => { if (correctionSubmit !== null) correctionSubmit.disabled = false; });
      });
    }

    if (projectCreate !== null) {
      projectCreate.addEventListener('click', () => {
        const name = projectName !== null && typeof projectName.value === 'string' ? projectName.value.trim() : '';
        if (name === '') {
          projectLocalNotice = '先写一个项目名（≤100 字）。';
          if (projectNote !== null) projectNote.textContent = projectLocalNotice;
          return;
        }
        projectLocalNotice = null;
        projectCreate.disabled = true;
        void postActionItem('/.sage/projects', { action: 'create', name })
          .finally(() => { if (projectCreate !== null) projectCreate.disabled = false; });
      });
    }

    if (projectAssign !== null) {
      projectAssign.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        const projectRef = projectSelect !== null && typeof projectSelect.value === 'string' ? projectSelect.value : '';
        if (matterRef === '') {
          projectLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项。';
          if (projectNote !== null) projectNote.textContent = projectLocalNotice;
          return;
        }
        if (projectRef === '' || projectRef === 'none') {
          projectLocalNotice = '先新建一个项目再归属。';
          if (projectNote !== null) projectNote.textContent = projectLocalNotice;
          return;
        }
        projectLocalNotice = null;
        projectAssign.disabled = true;
        void postActionItem('/.sage/projects', { action: 'assign', matterRef, projectRef })
          .finally(() => { if (projectAssign !== null) projectAssign.disabled = false; });
      });
    }

    if (projectUnassign !== null) {
      projectUnassign.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        if (matterRef === '') {
          projectLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项。';
          if (projectNote !== null) projectNote.textContent = projectLocalNotice;
          return;
        }
        projectLocalNotice = null;
        projectUnassign.disabled = true;
        void postActionItem('/.sage/projects', { action: 'unassign', matterRef })
          .finally(() => { if (projectUnassign !== null) projectUnassign.disabled = false; });
      });
    }

    // 029 的动作：选择集在行内切换；批量与重命名各走一条精确体路由。
    if (matterAdminRows !== null) {
      matterAdminRows.addEventListener('click', (event) => {
        const toggle = event.target?.closest?.('[data-matter-admin-toggle]') ?? null;
        if (toggle === null) return;
        const ref = toggle.dataset.matterAdminToggle;
        if (typeof ref !== 'string' || ref === '') return;
        if (toggle.checked === true) matterAdminSelected.add(ref);
        else matterAdminSelected.delete(ref);
      });
    }

    function selectedAdminTargets() {
      return [...matterAdminSelected];
    }

    if (matterAdminArchive !== null) {
      matterAdminArchive.addEventListener('click', () => {
        const targets = selectedAdminTargets();
        if (targets.length === 0) {
          matterAdminLocalNotice = '先勾选要归档的事项（可多选：批量逐项返回结果）。';
          if (matterAdminNote !== null) matterAdminNote.textContent = matterAdminLocalNotice;
          return;
        }
        const ground = matterAdminGround !== null && typeof matterAdminGround.value === 'string' && matterAdminGround.value !== 'completed' ? 'stopped' : 'completed';
        matterAdminLocalNotice = null;
        matterAdminArchive.disabled = true;
        void postActionItem('/.sage/matter-admin', { action: 'batch', operation: 'archive', targets, ground })
          .finally(() => { if (matterAdminArchive !== null) matterAdminArchive.disabled = false; });
      });
    }

    if (matterAdminRestore !== null) {
      matterAdminRestore.addEventListener('click', () => {
        const targets = selectedAdminTargets();
        if (targets.length === 0) {
          matterAdminLocalNotice = '先勾选要恢复的事项。';
          if (matterAdminNote !== null) matterAdminNote.textContent = matterAdminLocalNotice;
          return;
        }
        matterAdminLocalNotice = null;
        matterAdminRestore.disabled = true;
        void postActionItem('/.sage/matter-admin', { action: 'batch', operation: 'restore', targets })
          .finally(() => { if (matterAdminRestore !== null) matterAdminRestore.disabled = false; });
      });
    }

    // 049 的动作：事项勾选与分组单选都在行内切换；四个具名命令各走一条精确体路由。
    if (matterGroupsRows !== null) {
      matterGroupsRows.addEventListener('click', (event) => {
        const toggle = event.target?.closest?.('[data-matter-group-toggle]') ?? null;
        if (toggle === null) return;
        const itemId = toggle.dataset.matterGroupToggle;
        if (typeof itemId !== 'string' || itemId === '') return;
        if (toggle.checked === true) matterGroupsSelected.add(itemId);
        else matterGroupsSelected.delete(itemId);
      });
    }

    function matterGroupsLocalNoticeOf(text) {
      matterGroupsLocalNotice = text;
      if (matterGroupsReadback !== null) matterGroupsReadback.textContent = text;
    }

    function pickedGroupId() {
      if (matterGroupsPicked === null) {
        matterGroupsLocalNoticeOf('先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。');
        return null;
      }
      return matterGroupsPicked;
    }

    if (matterGroupsList !== null) {
      matterGroupsList.addEventListener('click', (event) => {
        const pick = event.target?.closest?.('[data-matter-group-pick]') ?? null;
        if (pick === null) return;
        const groupId = pick.dataset.matterGroupPick;
        if (typeof groupId !== 'string' || groupId === '') return;
        matterGroupsPicked = pick.checked === true ? groupId : null;
        // 单选语义：行内即时互斥（下一次渲染也按单选回读态重渲）。
        for (const other of matterGroupsList.querySelectorAll('[data-matter-group-pick]')) {
          if (other !== pick) other.checked = false;
        }
      });
    }

    if (matterGroupsCreate !== null) {
      matterGroupsCreate.addEventListener('click', () => {
        const name = matterGroupsName !== null && typeof matterGroupsName.value === 'string' ? matterGroupsName.value.trim() : '';
        if (name === '') {
          matterGroupsLocalNoticeOf('先给分组起一个名字（建立是具名命令，不会隐式产生）。');
          return;
        }
        matterGroupsLocalNotice = null;
        const targets = [...matterGroupsSelected];
        matterGroupsCreate.disabled = true;
        void postActionItem('/.sage/matter-groups', targets.length === 0 ? { action: 'create', name } : { action: 'create', name, targets })
          .finally(() => { if (matterGroupsCreate !== null) matterGroupsCreate.disabled = false; });
      });
    }

    if (matterGroupsRename !== null) {
      matterGroupsRename.addEventListener('click', () => {
        const groupId = pickedGroupId();
        if (groupId === null) return;
        const name = matterGroupsRenameTitle !== null && typeof matterGroupsRenameTitle.value === 'string' ? matterGroupsRenameTitle.value.trim() : '';
        if (name === '') {
          matterGroupsLocalNoticeOf('先写好新的分组名称。');
          return;
        }
        matterGroupsLocalNotice = null;
        matterGroupsRename.disabled = true;
        void postActionItem('/.sage/matter-groups', { action: 'rename', groupId, name })
          .finally(() => { if (matterGroupsRename !== null) matterGroupsRename.disabled = false; });
      });
    }

    if (matterGroupsRemove !== null) {
      matterGroupsRemove.addEventListener('click', () => {
        const groupId = pickedGroupId();
        if (groupId === null) return;
        matterGroupsLocalNotice = null;
        matterGroupsRemove.disabled = true;
        void postActionItem('/.sage/matter-groups', { action: 'remove', groupId })
          .finally(() => { if (matterGroupsRemove !== null) matterGroupsRemove.disabled = false; });
      });
    }

    if (matterGroupsAdd !== null) {
      matterGroupsAdd.addEventListener('click', () => {
        const groupId = pickedGroupId();
        if (groupId === null) return;
        const targets = [...matterGroupsSelected];
        if (targets.length === 0) {
          matterGroupsLocalNoticeOf('先勾选要入组的事项（可多选：批量逐项返回结果）。');
          return;
        }
        matterGroupsLocalNotice = null;
        matterGroupsAdd.disabled = true;
        void postActionItem('/.sage/matter-groups', { action: 'assign', groupId, operation: 'add', targets })
          .finally(() => { if (matterGroupsAdd !== null) matterGroupsAdd.disabled = false; });
      });
    }

    if (matterGroupsRemoveMembers !== null) {
      matterGroupsRemoveMembers.addEventListener('click', () => {
        const groupId = pickedGroupId();
        if (groupId === null) return;
        const targets = [...matterGroupsSelected];
        if (targets.length === 0) {
          matterGroupsLocalNoticeOf('先勾选要移出的事项。');
          return;
        }
        matterGroupsLocalNotice = null;
        matterGroupsRemoveMembers.disabled = true;
        void postActionItem('/.sage/matter-groups', { action: 'assign', groupId, operation: 'remove', targets })
          .finally(() => { if (matterGroupsRemoveMembers !== null) matterGroupsRemoveMembers.disabled = false; });
      });
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

    if (planCreate !== null) {
      planCreate.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        const title = planTitle !== null && typeof planTitle.value === 'string' ? planTitle.value.trim() : '';
        const steps = planSteps !== null && typeof planSteps.value === 'string' ? planSteps.value.split('\\n').map((line) => line.trim()).filter((line) => line !== '') : [];
        if (matterRef === '') {
          planLocalNotice = '先在「事项 ↔ 工作区关联」里选好事项：方案属于某个事项。';
          if (planNote !== null) planNote.textContent = planLocalNotice;
          return;
        }
        if (title === '' || steps.length === 0) {
          planLocalNotice = '方案要有一个标题和至少一条步骤（每行一条）。';
          if (planNote !== null) planNote.textContent = planLocalNotice;
          return;
        }
        planLocalNotice = null;
        planCreate.disabled = true;
        void postPlan({ action: 'create', matterRef, title, steps }).finally(() => { if (planCreate !== null) planCreate.disabled = false; });
      });
    }

    if (planRows !== null) {
      planRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-plan-action="accept"]') ?? null;
        if (button !== null) {
          if (button.disabled === true) return;
          const row = button.closest('[data-plan-id]');
          const planId = row === null ? null : row.dataset.planId;
          if (typeof planId === 'string' && planId !== '') {
            button.disabled = true;
            void postPlan({ action: 'accept', planId });
          }
          return;
        }
        const row = event.target?.closest?.('[data-plan-id]') ?? null;
        if (row === null) return;
        const planId = row.dataset.planId;
        if (typeof planId !== 'string' || planId === '' || planId === currentPlanId) return;
        currentPlanId = planId;
        pendingPlanStep = null;
        planStepLocalNotice = null;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (planStepRows !== null) {
      planStepRows.addEventListener('click', async (event) => {
        const button = event.target?.closest?.('[data-plan-action="prepare-step"]') ?? null;
        if (button === null || button.disabled === true || currentPlanId === null) return;
        const stepNo = Number.parseInt(String(button.dataset.stepNo ?? ''), 10);
        if (!Number.isSafeInteger(stepNo) || stepNo < 1) return;
        planStepLocalNotice = null;
        button.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/plans', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'prepare-step', planId: currentPlanId, stepNo }),
          });
          const payload = await response.json();
          if (payload !== null && typeof payload === 'object' && payload.state === 'prepared' && payload.card !== null && typeof payload.card === 'object') {
            pendingPlanStep = { planId: currentPlanId, stepNo, card: payload.card };
          } else {
            const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
            planStepLocalNotice = code === 'step-premise-unknown' ? '这一步的前提未知：按阻断处理，不派发（不铸卡）。'
              : code === 'step-not-ready' ? '这一步未就绪：按阻断处理，不派发（不铸卡）。'
                : '准备执行确认卡被拒绝（' + String(code ?? '响应无法识别') + '）。';
          }
        } catch {
          planStepLocalNotice = '准备执行确认卡失败：这次请求没有完成。';
        }
        button.disabled = false;
        renderPlanStepCard();
        renderPlanStepRun(null);
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (planStepExecute !== null) {
      planStepExecute.addEventListener('click', async () => {
        const pending = pendingPlanStep;
        if (pending === null) return;
        const confirmationId = pending.card !== null && typeof pending.card === 'object' && typeof pending.card.confirmationId === 'string' ? pending.card.confirmationId : '';
        pendingPlanStep = null;
        renderPlanStepCard();
        if (confirmationId === '') return;
        planStepExecute.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/plans', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'execute-step', planId: pending.planId, stepNo: pending.stepNo, confirmationId }),
          });
          const payload = await response.json();
          const state = payload !== null && typeof payload === 'object' && typeof payload.state === 'string' ? payload.state : null;
          const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null;
          const block = payload !== null && typeof payload === 'object' && payload.plans !== null && typeof payload.plans === 'object' ? payload.plans : null;
          if (block !== null && block.state === 'read') {
            // 结果面以投影为唯一读数：响应随行携带同一份投影，先按其渲染；特定拒绝句由投影渲染。
            planStepLocalNotice = null;
            renderPlanStepRun(block.lastStepRun !== null && typeof block.lastStepRun === 'object' ? block.lastStepRun : null);
          } else if (state === 'settled' || state === null) {
            planStepLocalNotice = null;
          } else {
            planStepLocalNotice = code === 'plans-unavailable' ? '这一版还没有接上方案存储：没有派发，也不消耗确认。'
              : '步骤执行未完成（' + String(code ?? '响应无法识别') + '）。';
          }
        } catch {
          planStepLocalNotice = '步骤执行请求失败：这次请求没有完成。';
        }
        planStepExecute.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }

    if (planStepCancel !== null) {
      planStepCancel.addEventListener('click', () => {
        pendingPlanStep = null;
        planStepLocalNotice = null;
        renderPlanStepCard();
        renderPlanStepRun(null);
      });
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
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
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

    if (matterAdminRename !== null) {
      matterAdminRename.addEventListener('click', async () => {
        const targets = selectedAdminTargets();
        const title = matterAdminRenameTitle !== null && typeof matterAdminRenameTitle.value === 'string' ? matterAdminRenameTitle.value.trim() : '';
        if (targets.length !== 1) {
          matterAdminRenameLocalNotice = '重命名一次针对一个事项：请只勾选一项。';
          if (matterAdminRenameNote !== null) matterAdminRenameNote.textContent = matterAdminRenameLocalNotice;
          return;
        }
        if (title === '') {
          matterAdminRenameLocalNotice = '先写要改成的名称（1–200 字）。';
          if (matterAdminRenameNote !== null) matterAdminRenameNote.textContent = matterAdminRenameLocalNotice;
          return;
        }
        matterAdminRename.disabled = true;
        try {
          const response = await fetchWithinDeadline('/.sage/matter-admin', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'rename', matterRef: targets[0], title }),
          });
          const payload = await response.json();
          const code = payload !== null && typeof payload === 'object' && payload.state === 'refused' && typeof payload.code === 'string' ? payload.code : null;
          if (code !== null) {
            matterAdminRenameLocalNotice = matterAdminRefusalText(code);
            if (matterAdminRenameNote !== null) matterAdminRenameNote.textContent = matterAdminRenameLocalNotice;
          } else {
            // 成功时清掉本地提示：回读值由投影呈现。
            matterAdminRenameLocalNotice = null;
          }
        } catch {
          matterAdminRenameLocalNotice = '重命名请求失败：这次请求没有完成。';
          if (matterAdminRenameNote !== null) matterAdminRenameNote.textContent = matterAdminRenameLocalNotice;
        }
        matterAdminRename.disabled = false;
        queueMicrotask(() => { void refresh(); });
      });
    }

    // 002 的三个动作：发送=（新）草案、保存=用户自己写的字段与勾选、确认=建项（经同一流水线）。
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

    if (draftSend && draftInput) {
      draftSend.addEventListener('click', () => {
        const rawInput = typeof draftInput.value === 'string' ? draftInput.value.trim() : '';
        if (rawInput === '') {
          draftLocalNotice = '先写一句需求再发送。';
          if (draftNote !== null) draftNote.textContent = draftLocalNotice;
          return;
        }
        draftLocalNotice = null;
        draftSend.disabled = true;
        void postDraft('/.sage/draft/create', { rawInput }).finally(() => { draftSend.disabled = false; });
      });
    }

    if (draftSave) {
      draftSave.addEventListener('click', () => {
        if (currentDraftId === null) return;
        draftSave.disabled = true;
        void postDraft('/.sage/draft/update', {
          draftId: currentDraftId,
          fields: draftFieldValues(),
          clarification: draftClarification !== null && typeof draftClarification.value === 'string' ? draftClarification.value : '',
          selectedEntryIds: draftSelections(),
        }).finally(() => { if (draftSave !== null) draftSave.disabled = false; });
      });
    }

    if (draftReconcile) {
      draftReconcile.addEventListener('click', () => {
        if (currentDraftId === null) return;
        draftReconcile.disabled = true;
        void postDraft('/.sage/draft/reconcile', { draftId: currentDraftId }).finally(() => { if (draftReconcile !== null) draftReconcile.disabled = false; });
      });
    }

    if (draftCancelConfirm) {
      draftCancelConfirm.addEventListener('click', () => {
        if (currentDraftId === null) return;
        draftCancelConfirm.disabled = true;
        void postDraft('/.sage/draft/cancel', { draftId: currentDraftId }).finally(() => { if (draftCancelConfirm !== null) draftCancelConfirm.disabled = false; });
      });
    }

    // 025：确认建项不再直接派发——先向 main 要这张「执行前确认卡」；转换只在卡自带的
    // 「确认执行」点击后发生，并携带一次性凭据。确认≠效果已发生：结果仍按回执三态回来。
    function draftConfirmationNotice(code) {
      if (code === 'confirmation-stale') return '确认已失效：动作、前提或版本已变化——请重新确认（旧卡不能沿用）。';
      if (code === 'confirmation-consumed') return '这次确认已经用过了：一次确认只兑现一次派发，请重新确认。';
      if (code === 'confirmation-required') return '这次派发缺少有效的执行前确认：请先展开确认卡再确认执行。';
      return null;
    }

    async function requestDraftConfirmation() {
      if (currentDraftId === null || draftConfirm === null || draftConfirm.disabled) return;
      draftLocalNotice = null;
      draftConfirm.disabled = true;
      if (draftResult !== null) draftResult.textContent = '正在生成执行前确认卡……';
      let card = null;
      try {
        const response = await fetchWithinDeadline('/.sage/draft/prepare-confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draftId: currentDraftId }),
        });
        const payload = await response.json();
        if (payload !== null && typeof payload === 'object' && payload.state === 'prepared'
          && payload.card !== null && typeof payload.card === 'object') {
          card = payload.card;
        }
      } catch { /* 下面的本地提示兜底 */ }
      if (card === null) {
        draftLocalNotice = '执行前确认卡暂不可得：这一版还没有确认来源，建项暂不可派发。';
        if (draftNote !== null) draftNote.textContent = draftLocalNotice;
      } else {
        pendingDraftConfirmation = { draftId: currentDraftId, card };
      }
      if (draftResult !== null) draftResult.textContent = '';
      renderDraftConfirmation();
      queueMicrotask(() => { void refresh(); });
    }

    async function executeDraftConfirmation() {
      const pending = pendingDraftConfirmation;
      if (pending === null || currentDraftId === null || pending.draftId !== currentDraftId) return;
      const confirmationId = pending.card !== null && typeof pending.card === 'object' && typeof pending.card.confirmationId === 'string'
        ? pending.card.confirmationId : '';
      // 无论结果如何这张卡都不再悬着：一次确认只兑现一次派发（重复点击不会派发两次）。
      pendingDraftConfirmation = null;
      renderDraftConfirmation();
      if (confirmationId === '') return;
      draftLocalNotice = null;
      if (draftResult !== null) draftResult.textContent = '正在确认……';
      try {
        const response = await fetchWithinDeadline('/.sage/draft/convert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ draftId: currentDraftId, confirmationId }),
        });
        const payload = await response.json();
        const code = payload !== null && typeof payload === 'object' && payload.state === 'denied' && typeof payload.code === 'string'
          ? payload.code : null;
        const notice = code === null ? null : draftConfirmationNotice(code);
        if (notice !== null) {
          draftLocalNotice = notice;
          if (draftNote !== null) draftNote.textContent = notice;
        }
      } catch { /* state 轮询兜底 */ }
      if (draftResult !== null) draftResult.textContent = '';
      queueMicrotask(() => { void refresh(); });
    }

    if (draftConfirm) {
      draftConfirm.addEventListener('click', () => {
        void requestDraftConfirmation();
      });
    }

    if (draftConfirmExecute) {
      draftConfirmExecute.addEventListener('click', () => {
        void executeDraftConfirmation();
      });
    }

    if (draftConfirmCancel) {
      draftConfirmCancel.addEventListener('click', () => {
        // 取消只在本地：凭据从未离开页面，未用的记录也只会被它自己的动作消费。
        pendingDraftConfirmation = null;
        renderDraftConfirmation();
      });
    }

    if (draftHistory) {
      // A checkbox toggle updates the draft's selection on the next save; nothing else in the
      // page reacts to it, so the unselected entries simply stay local.
      draftHistory.addEventListener('click', () => {});
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

    const linkTarget = () => ({
      matterRef: linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '',
      workspaceRef: linkWorkspace !== null && typeof linkWorkspace.value === 'string' ? linkWorkspace.value : '',
    });

    if (linkAdd) {
      linkAdd.addEventListener('click', () => {
        const target = linkTarget();
        if (target.matterRef === '' || target.workspaceRef === '') {
          linkLocalNotice = '先选好事项与工作区：关联不会自动替你挑一个。';
          if (linkNote !== null) linkNote.textContent = linkLocalNotice;
          return;
        }
        linkLocalNotice = null;
        linkAdd.disabled = true;
        void postLink({ action: 'link', ...target }).finally(() => { linkAdd.disabled = false; });
      });
    }
    if (linkRemove) {
      linkRemove.addEventListener('click', () => {
        const target = linkTarget();
        if (target.matterRef === '' || target.workspaceRef === '') return;
        linkLocalNotice = null;
        linkRemove.disabled = true;
        void postLink({ action: 'unlink', ...target }).finally(() => { linkRemove.disabled = false; });
      });
    }
    if (linkDefault) {
      linkDefault.addEventListener('click', () => {
        const target = linkTarget();
        if (target.matterRef === '' || target.workspaceRef === '') return;
        linkLocalNotice = null;
        linkDefault.disabled = true;
        void postLink({ action: 'set-default', ...target }).finally(() => { linkDefault.disabled = false; });
      });
    }

    if (sessionSend) {
      sessionSend.addEventListener('click', () => {
        const text = sessionInput !== null && typeof sessionInput.value === 'string' ? sessionInput.value.trim() : '';
        // Ticket 014: a message may be attachments-only; the base accepts one non-whitespace text
        // part OR an attachment, so the entry guard follows the stored items, not the text alone.
        const state = lastStatePayload;
        const storedItems = state !== null && typeof state === 'object' && state.attachments !== null && typeof state.attachments === 'object' && Array.isArray(state.attachments.items)
          ? state.attachments.items.filter((item) => item !== null && typeof item === 'object' && item.stage === 'stored')
          : [];
        if (text === '' && storedItems.length === 0) {
          sessionLocalNotice = '先写一条输入再发送（或先上传附件）。';
          if (sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          return;
        }
        // The matter and its environment come from the page's own selects (the link card's matter
        // picker and the workspace picker), so a send never invents either.
        const context = currentSendContext();
        if (context === null) {
          sessionLocalNotice = '先在上面选好事项与工作区：发送不会自动替你挑一个。';
          if (sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          return;
        }
        sessionLocalNotice = null;
        sessionSend.disabled = true;
        const sendMode = sessionMode !== null && typeof sessionMode.value === 'string' && sessionMode.value === 'steer' ? 'steer' : 'queue';
        void (async () => {
          let outcome = null;
          try {
            const response = await fetchWithinDeadline('/.sage/session/send', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              // 008：方式只在实际选择 steer 时随请求携带（默认排队少一个键）；文案承诺只到步骤边界。
              body: JSON.stringify(sendMode === 'steer'
                ? { matterRef: context.matterRef, workspaceRoot: context.workspaceRoot, text, mode: 'steer' }
                : { matterRef: context.matterRef, workspaceRoot: context.workspaceRoot, text }),
            });
            outcome = await response.json();
          } catch { /* 轮询兜底 */ }
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          // 007：暂停态发送只登记——回执明说"已收到，尚未执行"，且这次发送没有产生任何派发。
          sessionLocalNotice = outcomeState === 'deferred' ? '已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。'
            : outcomeState === 'refused' && code === 'session-paused-attachments' ? '已暂停：带附件的发送暂不可用（待继续只保存文本）；先「继续」再发送。'
              : null;
          if (sessionLocalNotice !== null && sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          if (sessionSend !== null) sessionSend.disabled = false;
          queueMicrotask(() => { void refresh(); });
        })();
      });
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

    if (sessionStop) {
      sessionStop.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        if (matterRef === '') {
          sessionLocalNotice = '先选好事项再停止。';
          if (sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          return;
        }
        sessionLocalNotice = null;
        sessionStop.disabled = true;
        void postControl('/.sage/session/stop', { matterRef });
      });
    }
    if (sessionResume) {
      sessionResume.addEventListener('click', () => {
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        const workspaceRef = linkWorkspace !== null && typeof linkWorkspace.value === 'string' ? linkWorkspace.value : '';
        const state = lastStatePayload;
        const workspaces = state !== null && typeof state === 'object' && state.workspaces !== null && typeof state.workspaces === 'object' && Array.isArray(state.workspaces.entries)
          ? state.workspaces.entries
          : [];
        const chosen = workspaces.find((entry) => entry !== null && typeof entry === 'object' && entry.workspaceId === workspaceRef);
        if (matterRef === '' || chosen === undefined) {
          sessionLocalNotice = '先选好事项与工作区再继续。';
          if (sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          return;
        }
        sessionLocalNotice = null;
        sessionResume.disabled = true;
        void (async () => {
          let outcome = null;
          try {
            const response = await fetchWithinDeadline('/.sage/session/resume', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ matterRef, workspaceRoot: String(chosen.path ?? '') }),
            });
            outcome = await response.json();
          } catch { /* 轮询兜底 */ }
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          const count = outcome !== null && typeof outcome === 'object' && Array.isArray(outcome.dispatched) ? outcome.dispatched.length : 0;
          // 007：继续后的对账句 —— 被打断时明说"未含内容没有被送出"。
          sessionLocalNotice = outcomeState === 'resumed' ? (count === 0 ? '已继续：没有待继续项需要派发。' : '已继续：按顺序派发 ' + String(count) + ' 条待继续（受理≠执行；执行与否看会话行）。')
            : outcomeState === 'interrupted' ? '继续被新的暂停打断：已派发的按回执核对，其余仍留在待继续——未含内容没有被送出。'
              : outcomeState === 'refused' ? '继续失败（' + String(code ?? '未知') + '）：待继续项原样保留。'
                : null;
          if (sessionLocalNotice !== null && sessionNote !== null) sessionNote.textContent = sessionLocalNotice;
          if (sessionResume !== null) sessionResume.disabled = false;
          queueMicrotask(() => { void refresh(); });
        })();
      });
    }
    // 014：附件块。候选/上传中/已核验/已随消息发送各自成态；本地提示门防轮询覆盖。
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
    if (attachmentPick) {
      attachmentPick.addEventListener('click', () => {
        attachmentPick.disabled = true;
        void postAttachment('/.sage/attachments/pick', {}).then((outcome) => {
          const state = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : '';
          if (state === 'cancelled') {
            attachmentLocalNotice = '已取消选择：没有产生任何候选。';
          } else if (state === 'picked') {
            const items = Array.isArray(outcome.items) ? outcome.items.length : 0;
            const refused = Array.isArray(outcome.refused) ? outcome.refused : [];
            attachmentLocalNotice = '已产生 ' + String(items) + ' 个候选（尚未上传）。'
              + (refused.length > 0 ? ' 有 ' + String(refused.length) + ' 个文件未被接受：'
                + refused.map((entry) => String(entry && typeof entry === 'object' ? entry.name : '') + '（' + String(entry && typeof entry === 'object' ? entry.code : '') + '）').join('、') + '。' : '');
          } else if (state === 'refused') {
            attachmentLocalNotice = '选择失败：' + String(outcome.code ?? 'unknown') + '（没有产生候选）。';
          } else {
            attachmentLocalNotice = '选择结果未读取到（没有产生候选）。';
          }
          if (attachmentNote !== null) attachmentNote.textContent = attachmentLocalNotice;
        }).finally(() => { if (attachmentPick !== null) attachmentPick.disabled = false; });
      });
    }
    if (attachmentItems) {
      attachmentItems.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-attachment-action]') ?? null;
        if (button === null || button.disabled) return;
        const itemId = typeof button.dataset.attachmentId === 'string' ? button.dataset.attachmentId : '';
        const action = typeof button.dataset.attachmentAction === 'string' ? button.dataset.attachmentAction : '';
        if (itemId === '') return;
        if (action === 'upload') {
          const context = currentSendContext();
          if (context === null) {
            attachmentLocalNotice = '先在上面选好事项与工作区：上传不会自动替你挑一个。';
            if (attachmentNote !== null) attachmentNote.textContent = attachmentLocalNotice;
            return;
          }
          attachmentLocalNotice = null;
          button.disabled = true;
          void postAttachment('/.sage/attachments/upload', { itemId, matterRef: context.matterRef, workspaceRoot: context.workspaceRoot }).then((outcome) => {
            const state = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : '';
            if (state === 'refused') {
              attachmentLocalNotice = '上传没有完成：' + String(outcome.code ?? 'unknown') + '（没有变成已发送附件；可重试同一版本）。';
              if (attachmentNote !== null) attachmentNote.textContent = attachmentLocalNotice;
            }
          }).finally(() => { if (button !== null) button.disabled = false; });
          return;
        }
        if (action === 'cancel') {
          attachmentLocalNotice = null;
          button.disabled = true;
          void postAttachment('/.sage/attachments/cancel', { itemId }).finally(() => { if (button !== null) button.disabled = false; });
        }
      });
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

    if (pendingRows) {
      pendingRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-pending-action]') ?? null;
        if (button === null || button.disabled) return;
        const row = button.closest('[data-pending-id]');
        if (row === null) return;
        const itemId = row.dataset.pendingId;
        if (typeof itemId !== 'string' || itemId === '') return;
        if (button.dataset.pendingAction === 'remove') {
          button.disabled = true;
          void postControl('/.sage/session/pending', { action: 'remove', itemId });
          return;
        }
        const input = row.querySelector('[data-pending-input]');
        const text = input !== null && typeof input.value === 'string' ? input.value.trim() : '';
        if (text === '') return;
        button.disabled = true;
        void postControl('/.sage/session/pending', { action: 'edit', itemId, text });
      });
    }

    if (queueRows !== null) {
      queueRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-queue-action]') ?? null;
        if (button === null || button.disabled) return;
        const row = button.closest('[data-queue-id]');
        if (row === null) return;
        const itemId = row.dataset.queueId;
        if (typeof itemId !== 'string' || itemId === '') return;
        const action = button.dataset.queueAction === 'remove' ? 'remove' : 'edit';
        const input = row.querySelector('[data-queue-input]');
        const text = input !== null && typeof input.value === 'string' ? input.value.trim() : '';
        if (action === 'edit' && text === '') return;
        queueLocalNotice = null;
        button.disabled = true;
        void (async () => {
          let outcome = null;
          try {
            const response = await fetchWithinDeadline('/.sage/session/queue', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(action === 'edit' ? { action: 'edit', itemId, text } : { action: 'remove', itemId }),
            });
            outcome = await response.json();
          } catch { /* 轮询兜底 */ }
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          // 008（US-027）：被消费的项如实提示"已开始处理"，不静默丢弃、不重复提交。
          queueLocalNotice = outcomeState === 'ok'
            ? (action === 'edit' ? '队列项已按新文本更新（以权威快照为准，刷新后可见）。' : '队列项已移除登记（若已开始处理则改不动——以快照为准）。')
            : code === 'queue-item-not-found' ? '这一项已开始处理（不在队列里了）：如实提示，不静默丢弃、不重复提交——如需补充请重新发送。'
              : code === 'queue-no-session' ? '还没有会话：没有队列项可改。'
                : code === 'queue-edit-invalid' ? '修改内容为空或超长：没有提交。'
                  : '队列项未更新（' + String(code ?? '响应无法识别') + '）。';
          if (queueNote !== null) queueNote.textContent = queueLocalNotice;
          button.disabled = false;
          queueMicrotask(() => { void refresh(); });
        })();
      });
    }

    // 009：历史运行。读取只发 page 类动作（main 端保证只走纯历史接点）；列表后自动展开最近一次。
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
    async function readHistory(beforeSeq) {
      const outcome = await postHistory(beforeSeq === undefined ? { action: 'list' } : { action: 'list', beforeSeq });
      const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
      const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
      if (outcomeState === 'no-session') {
        historyLocalNotice = '还没有会话：没有历史运行可读（读取不会创建会话）。';
      } else if (outcomeState === 'refused') {
        historyLocalNotice = '历史读取失败（' + String(code ?? '未知') + '）：没读到就不装作读过。';
      } else {
        historyLocalNotice = null;
        // 默认只展开最近一次（US-097）：自动读一次最新运行详情，每个 matter+run 只触发一次。
        const first = outcome !== null && typeof outcome === 'object' && Array.isArray(outcome.runs) && outcome.runs.length > 0 ? outcome.runs[0] : null;
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        if (first !== null && typeof first === 'object' && typeof first.runSeq === 'number') {
          const key = matterRef + ':' + String(first.runSeq);
          if (autoDetailKey !== key) {
            autoDetailKey = key;
            await postHistory({ action: 'detail', runSeq: first.runSeq });
          }
        }
      }
      if (historyNote !== null && historyLocalNotice !== null) historyNote.textContent = historyLocalNotice;
      queueMicrotask(() => { void refresh(); });
    }
    if (historyRead !== null) {
      historyRead.addEventListener('click', () => {
        historyRead.disabled = true;
        void readHistory().finally(() => { if (historyRead !== null) historyRead.disabled = false; });
      });
    }
    if (historyMore !== null) {
      historyMore.addEventListener('click', () => {
        const beforeSeq = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionHistory !== null && typeof lastStatePayload.sessionHistory === 'object' && typeof lastStatePayload.sessionHistory.nextBeforeSeq === 'number'
          ? lastStatePayload.sessionHistory.nextBeforeSeq
          : undefined;
        if (beforeSeq === undefined) return;
        historyMore.disabled = true;
        void readHistory(beforeSeq).finally(() => { if (historyMore !== null) historyMore.disabled = false; });
      });
    }
    if (historyRows !== null) {
      historyRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-history-action="detail"]') ?? null;
        if (button === null || button.disabled) return;
        const runSeq = Number.parseInt(String(button.dataset.historyRun ?? ''), 10);
        if (!Number.isSafeInteger(runSeq) || runSeq < 0) return;
        button.disabled = true;
        void postHistory({ action: 'detail', runSeq }).finally(() => {
          button.disabled = false;
          queueMicrotask(() => { void refresh(); });
        });
      });
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
    if (selectionSkills !== null || selectionPlugins !== null) {
      const onSelectionClick = (event) => {
        const use = event.target?.closest?.('[data-selection-action="select"]') ?? null;
        if (use === null || use.disabled === true) return;
        const kind = String(use.dataset.selectionKind ?? '');
        const ref = String(use.dataset.selectionRef ?? '');
        if ((kind !== 'skill' && kind !== 'plugin') || ref === '') return;
        use.disabled = true;
        selectionLocalNotice = null;
        void (async () => {
          const outcome = await postSelections({ action: 'select', kind, ref });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState !== 'selected') {
            selectionLocalNotice = code === 'selection-skills-unread' ? '未核验：技能清单还没读到，不能选择（先重试读取）。'
              : code === 'selection-skill-not-listed' ? '该技能不在当前挂载清单里（不是"已失效"）：未选择。'
                : code === 'selection-skill-model-only' ? '该技能仅模型可调用（本入口不可选）：未选择。'
                  : code === 'selection-plugin-not-mounted' ? '该组件未挂载：未选择，也不对启用状态作结论。'
                    : '选择未生效（' + String(code ?? '未知') + '）：不应重复点击。';
          }
          use.disabled = false;
          await refresh();
          if (selectionNote !== null && selectionLocalNotice !== null) selectionNote.textContent = selectionLocalNotice;
        })();
      };
      if (selectionSkills !== null) selectionSkills.addEventListener('click', onSelectionClick);
      if (selectionPlugins !== null) selectionPlugins.addEventListener('click', onSelectionClick);
    }
    if (selectionChips !== null) {
      selectionChips.addEventListener('click', (event) => {
        const clear = event.target?.closest?.('[data-selection-clear]') ?? null;
        if (clear === null || clear.disabled === true) return;
        const kind = String(clear.dataset.selectionKind ?? '');
        const ref = String(clear.dataset.selectionClear ?? '');
        if ((kind !== 'skill' && kind !== 'plugin') || ref === '') return;
        clear.disabled = true;
        selectionLocalNotice = null;
        void (async () => {
          await postSelections({ action: 'clear', kind, ref });
          clear.disabled = false;
          await refresh();
        })();
      });
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

    // 043：终端面板——打开=本地开关＋一条有界读页（只读观察）；关闭=纯本地（零请求）。
    async function postTerminalRead(body) {
      let outcome = null;
      try {
        const response = await fetchWithinDeadline('/.sage/session/terminal-read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        outcome = await response.json();
      } catch { /* 轮询兜底 */ }
      return outcome;
    }
    if (terminalRows !== null) {
      terminalRows.addEventListener('click', (event) => {
        const toggle = event.target?.closest?.('[data-terminal-open]') ?? null;
        if (toggle === null || toggle.disabled === true) return;
        const terminalId = String(toggle.dataset.terminalOpen ?? '');
        if (terminalId === '') return;
        terminalLocalNotice = null;
        if (terminalOpenedId === terminalId) {
          // 关闭是纯本地开关：零请求，也不影响执行（没有任何写路径可触达）。
          terminalOpenedId = null;
          if (terminalOutput !== null) { terminalOutput.hidden = true; terminalOutput.textContent = ''; }
          if (terminalOutputNote !== null) terminalOutputNote.textContent = '已关闭输出面板（纯本地；运行不受影响）。';
          void refresh();
          return;
        }
        terminalOpenedId = terminalId;
        toggle.disabled = true;
        void (async () => {
          const outcome = await postTerminalRead({ terminalId });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState === 'read') {
            if (terminalOutput !== null) {
              terminalOutput.hidden = false;
              terminalOutput.textContent = typeof outcome.text === 'string' ? outcome.text : '';
            }
            if (terminalOutputNote !== null) {
              terminalOutputNote.textContent = '只读运行观察（第 ' + String(outcome.lineBegin) + '–' + String(outcome.lineEnd) + ' 行 / 共 ' + String(outcome.totalLines) + ' 行'
                + (outcome.truncated === true ? '；已被上限截断' : '') + '）——不进对话历史、不作交付产物，也不接收操作输入。';
            }
          } else {
            terminalOpenedId = null;
            if (terminalOutput !== null) { terminalOutput.hidden = true; terminalOutput.textContent = ''; }
            if (terminalOutputNote !== null) {
              terminalOutputNote.textContent = code === 'terminal-not-listed' ? '该终端不在当前清单内（不是“已失效”）：未打开输出。'
                : code === 'terminal-no-session' ? '还没有会话：无法读取（读取不会创建会话）。'
                  : '输出不可读（' + String(code ?? '未知') + '）：未打开。';
            }
          }
          toggle.disabled = false;
          await refresh();
        })();
      });
    }

    // 042：核对只重新读取（零写；结果未知不重试、不重复提交）。
    if (modelQueueRows !== null) {
      modelQueueRows.addEventListener('click', (event) => {
        const verify = event.target?.closest?.('[data-model-queue-verify]') ?? null;
        if (verify === null || verify.disabled === true) return;
        verify.disabled = true;
        modelQueueLocalNotice = '已重新读取该排队状态（核对=只读，不会重复提交任何请求）。';
        void (async () => {
          await refresh();
          verify.disabled = false;
          if (modelQueueNote !== null && modelQueueLocalNotice !== null) modelQueueNote.textContent = modelQueueLocalNotice;
        })();
      });
    }

    // 041：授权等待。批准/拒绝/撤回各恰一条具名写；核对只重新读取（结果未知不给重试）。
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
    if (approvalCards !== null) {
      const onApprovalClick = (event) => {
        const answerButton = event.target?.closest?.('[data-approval-answer]') ?? null;
        const withdrawButton = event.target?.closest?.('[data-approval-withdraw]') ?? null;
        const button = answerButton ?? withdrawButton;
        if (button === null || button.disabled === true) return;
        const requestId = String(answerButton !== null ? (answerButton.dataset.approvalRequestId ?? '') : (button.dataset.approvalWithdraw ?? ''));
        if (requestId === '') return;
        const matterRef = linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '';
        button.disabled = true;
        approvalLocalNotice = null;
        void (async () => {
          const outcome = answerButton !== null
            ? await postApproval('/.sage/session/approval-answer', { matterRef, requestId, outcome: String(answerButton.dataset.approvalAnswer ?? '') })
            : await postApproval('/.sage/session/approval-withdraw', { matterRef, requestId });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          const receipt = outcome !== null && typeof outcome === 'object' && outcome.receipt !== null && typeof outcome.receipt === 'object' ? outcome.receipt : null;
          if (outcomeState === 'recorded' && receipt !== null) {
            const receiptState = typeof receipt.state === 'string' ? receipt.state : '';
            const outcomeWord = typeof receipt.outcome === 'string' ? receipt.outcome : '';
            if (receiptState === 'accepted' && outcomeWord === 'allowed-once') {
              approvalLocalNotice = '批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。';
            } else if (receiptState === 'accepted' && outcomeWord === 'rejected') {
              approvalLocalNotice = '拒绝已提交——依赖动作不会派发。';
            } else if (receiptState === 'accepted' && outcomeWord === 'withdrawn') {
              approvalLocalNotice = '撤回已提交——等待不会兑现为执行条件（这不是失败，也不是批准）。';
            } else {
              approvalLocalNotice = '结果未知：已记录待核对，不自动重试；未确认前不显示为已批准。';
            }
          } else if (outcomeState === 'refused') {
            approvalLocalNotice = code === 'approval-not-pending' ? '该等待已不进行中：未提交。'
              : code === 'approval-paused' ? '会话已暂停：未提交（继续后可答）。'
                : code === 'approval-not-withdrawable' ? '该等待不可撤回（请求方未提供取消能力）：未提交。'
                  : '未提交（' + String(code ?? '未知') + '）。';
          } else {
            approvalLocalNotice = '请求未送达：结果未知（不重试；可核对当前等待后再试）。';
          }
          button.disabled = false;
          await refresh();
          if (approvalNote !== null && approvalLocalNotice !== null) approvalNote.textContent = approvalLocalNotice;
        })();
      };
      approvalCards.addEventListener('click', onApprovalClick);
    }
    if (approvalReceipts !== null) {
      approvalReceipts.addEventListener('click', (event) => {
        const verify = event.target?.closest?.('[data-approval-verify]') ?? null;
        if (verify === null || verify.disabled === true) return;
        verify.disabled = true;
        approvalLocalNotice = '已重新读取该等待的状态（核对=只读，不重试同一提交）。';
        void (async () => {
          await refresh();
          verify.disabled = false;
          if (approvalNote !== null && approvalLocalNotice !== null) approvalNote.textContent = approvalLocalNotice;
        })();
      });
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
    if (planModeBar !== null || planModeGoal !== null || planModePlan !== null) {
      const onPlanModeClick = (event) => {
        const button = event.target?.closest?.('[data-plan-mode]') ?? null;
        if (button === null || button.disabled === true) return;
        const mode = String(button.dataset.planMode ?? '');
        if (mode !== 'goal' && mode !== 'plan') return;
        button.disabled = true;
        planModeLocalNotice = null;
        void (async () => {
          const outcome = await postPlanMode(mode === 'plan');
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const family = outcome !== null && typeof outcome === 'object' && typeof outcome.family === 'string' ? outcome.family : null;
          const outcomeWord = outcome !== null && typeof outcome === 'object' && typeof outcome.outcome === 'string' ? outcome.outcome : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          const viewActive = outcome !== null && typeof outcome === 'object' && outcome.view !== null && typeof outcome.view === 'object' && typeof outcome.view.active === 'boolean' ? outcome.view.active : null;
          if (outcomeState === 'settled' && family === 'applied') {
            planModeLocalNotice = viewActive === true
              ? '已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。'
              : '已切换：已退出计划模式——退出不等于方案已执行。';
          } else if (outcomeState === 'settled' && family === 'pending') {
            planModeLocalNotice = '切换已登记：将在下一步生效；当前实际模式不变（显示仍为当前模式）。';
          } else if (outcomeState === 'settled') {
            planModeLocalNotice = outcomeWord === 'noop' ? '未改变：已经是该模式。' : '未改变：相反的待生效选择已取消（实际模式未变）。';
          } else if (outcomeState === 'refused') {
            planModeLocalNotice = code === 'plan-mode-no-session' ? '还没有会话：无法切换（读取不会创建会话）。'
              : '切换未生效（' + String(code ?? '未知') + '）：不重复提交。';
          } else {
            planModeLocalNotice = '切换请求未送达：结果未知（不重试；可先核对当前模式）。';
          }
          button.disabled = false;
          await refresh();
          if (planModeNote !== null && planModeLocalNotice !== null) planModeNote.textContent = planModeLocalNotice;
        })();
      };
      if (planModeBar !== null) planModeBar.addEventListener('click', onPlanModeClick);
    }

    // 040：模板选择＝本地填入草案输入（零请求；不建站、不写配置、无远端效果）。
    if (siteTemplateRows !== null) {
      const onSiteTemplateClick = (event) => {
        const use = event.target?.closest?.('[data-site-template-use]') ?? null;
        if (use === null || use.disabled === true) return;
        const templateId = String(use.dataset.siteTemplateUse ?? '');
        if (templateId === '') return;
        const catalog = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.siteTemplates !== null && typeof lastStatePayload.siteTemplates === 'object'
          ? lastStatePayload.siteTemplates
          : null;
        const entries = catalog !== null && catalog.state === 'read' && Array.isArray(catalog.entries) ? catalog.entries : [];
        const entry = entries.find((candidate) => candidate !== null && typeof candidate === 'object' && candidate.templateId === templateId);
        if (entry === undefined || typeof entry.prompt !== 'string' || entry.prompt === '') return;
        if (draftInput !== null) {
          const existing = typeof draftInput.value === 'string' ? draftInput.value : '';
                    draftInput.value = existing.trim() === '' ? entry.prompt : existing + '\\n\\n' + entry.prompt;
        }
        siteTemplateLocalNotice = '模板「' + String(entry.name) + '」（来源：' + String(entry.source) + ' · 版本：' + String(entry.version) + '）已填入草案输入（可编辑）——选模板不等于已建站或已发布，也不写任何配置。';
        if (siteTemplateNote !== null) siteTemplateNote.textContent = siteTemplateLocalNotice;
      };
      siteTemplateRows.addEventListener('click', onSiteTemplateClick);
    }

    // 037：回复操作与后续建议。复制/引用/建议只动本地（零写调用）；重试仅确定失败且走同一发送入口。
    if (replyActions !== null) {
      replyActions.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-reply-action]') ?? null;
        if (button !== null && button.disabled !== true) {
          const action = String(button.dataset.replyAction ?? '');
          const current = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionChannel !== null && typeof lastStatePayload.sessionChannel === 'object' && lastStatePayload.sessionChannel.reply !== null && typeof lastStatePayload.sessionChannel.reply === 'object'
            ? lastStatePayload.sessionChannel.reply
            : null;
          const text = current !== null && typeof current.text === 'string' ? current.text : '';
          if (action === 'copy') {
            // 复制＝已核实动作：能写剪贴板才写；不能写如实说，不伪造成功（零桥调用）。
            void (async () => {
              let clipped = false;
              try {
                if (typeof navigator !== 'undefined' && navigator !== null && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
                  await navigator.clipboard.writeText(text);
                  clipped = true;
                }
              } catch { clipped = false; }
              replyLocalNotice = clipped ? '已复制回复文本（本机剪贴板；未走任何后端）。'
                : '本机剪贴板不可用：复制未执行（不伪造成功）。';
              if (replyNote !== null) replyNote.textContent = replyLocalNotice;
            })();
            return;
          }
          if (action === 'quote') {
            const excerpt = text.length > 200 ? text.slice(0, 200) + '…' : text;
            if (sessionInput !== null) sessionInput.value = '> ' + excerpt + '\\n';
            replyLocalNotice = '引用已填入输入区（未发送）：可编辑后再显式发送。';
            if (replyNote !== null) replyNote.textContent = replyLocalNotice;
            return;
          }
          if (action === 'retry') {
            // 重试沿用同一发送入口；上一轮输入取最近一条用户行文本。
            const transcriptRows = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionChannel !== null && typeof lastStatePayload.sessionChannel === 'object' && Array.isArray(lastStatePayload.sessionChannel.transcript)
              ? lastStatePayload.sessionChannel.transcript
              : [];
            let lastUserText = '';
            for (const row of transcriptRows) {
              if (row !== null && typeof row === 'object' && row.role === 'user' && typeof row.text === 'string' && row.text !== '') lastUserText = row.text;
            }
            if (lastUserText === '') {
              if (replyNote !== null) replyNote.textContent = '没有可重试的上一轮输入（最近读到的会话里没有用户文本）。';
              return;
            }
            button.disabled = true;
            replyLocalNotice = null;
            void (async () => {
              let outcome = null;
              try {
                const response = await fetchWithinDeadline('/.sage/session/send', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    matterRef: linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '',
                    workspaceRoot: linkWorkspace !== null && typeof linkWorkspace.value === 'string' ? linkWorkspace.value : '',
                    text: lastUserText,
                  }),
                });
                outcome = await response.json();
              } catch { /* 轮询兜底 */ }
              button.disabled = false;
              const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
              const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
              if (outcomeState === 'accepted') {
                replyLocalNotice = '重试已受理（与普通发送同一入口）：受理不等于已开始执行，只看日志里有没有未结束的一轮。';
              } else if (outcomeState === 'deferred') {
                replyLocalNotice = '会话已暂停：重试只登记为待继续（不唤醒执行）。';
              } else {
                replyLocalNotice = '重试未确认送达（' + String(code ?? '未知') + '）：只给核对入口，不自动重试。';
              }
              await refresh();
              if (replyNote !== null && replyLocalNotice !== null) replyNote.textContent = replyLocalNotice;
            })();
            return;
          }
          return;
        }
        const audit = event.target?.closest?.('[data-reply-audit]') ?? null;
        if (audit === null || audit.disabled === true) return;
        // 核对＝只重新读取（零写调用）；未知态的唯一入口。
        audit.disabled = true;
        void refresh().finally(() => {
          audit.disabled = false;
          replyLocalNotice = '已重新读取会话（核对）：未触发任何重发。';
          if (replyNote !== null && replyLocalNotice !== null) replyNote.textContent = replyLocalNotice;
        });
      });
    }
    if (suggestionChips !== null) {
      suggestionChips.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-suggestion-text]') ?? null;
        if (button === null) return;
        const text = typeof button.dataset.suggestionText === 'string' ? button.dataset.suggestionText : '';
        if (text === '' || sessionInput === null) return;
        // 建议点击只填输入区：零请求、不自动发送（本地反馈经轮询守护，不被冲掉）。
        sessionInput.value = text;
        suggestionLocalNotice = '建议已填入输入区（未发送）：可编辑后再显式发送。';
        if (suggestionNote !== null) suggestionNote.textContent = suggestionLocalNotice;
      });
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
    if (sessionTranscript !== null) {
      sessionTranscript.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-edit-message]') ?? null;
        if (button === null) return;
        editTargetRef = String(button.dataset.editMessage ?? '');
        if (editInput !== null) editInput.value = typeof button.dataset.editText === 'string' ? button.dataset.editText : '';
        editLocalNotice = null;
        // 选消息只填本地编辑器：零桥调用（保存才产生版本）；目标行即时更新不依赖轮询。
        if (editTarget !== null) {
          editTarget.textContent = '消息 ' + String(editTargetRef) + '（原消息不变）';
          editTarget.dataset.editSelected = String(editTargetRef);
        }
        if (editNote !== null) editNote.textContent = '正在编辑这条消息：保存后产生新版本（原消息保持原样，不被历史改写）。';
      });
    }
    if (editSave !== null) {
      editSave.addEventListener('click', () => {
        if (editTargetRef === null) {
          if (editNote !== null) editNote.textContent = '先从下方会话记录里选一条已发消息。';
          return;
        }
        const text = editInput !== null && typeof editInput.value === 'string' ? editInput.value : '';
        editSave.disabled = true;
        editLocalNotice = null;
        void (async () => {
          const outcome = await postEdits({ action: 'save', messageRef: editTargetRef, text });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState !== 'saved') {
            editLocalNotice = code === 'edit-text-invalid' ? '新版本内容为空或过长（上限 16384 字）。'
              : code === 'edit-message-not-found' ? '这条消息不在最近读到的会话记录里：先刷新会话记录再试。'
                : '保存失败（' + String(code ?? '未知') + '）：未产生新版本。';
          }
          editSave.disabled = false;
          await refresh();
          if (editNote !== null && editLocalNotice !== null) editNote.textContent = editLocalNotice;
        })();
      });
    }
    if (editRows !== null) {
      editRows.addEventListener('click', (event) => {
        const resendButton = event.target?.closest?.('[data-edit-resend]') ?? null;
        if (resendButton !== null && resendButton.disabled !== true) {
          const editId = String(resendButton.dataset.editResend ?? '');
          resendButton.disabled = true;
          editLocalNotice = null;
          void (async () => {
            const outcome = await postEdits({
              action: 'resend',
              editId,
              workspaceRoot: linkWorkspace !== null && typeof linkWorkspace.value === 'string' ? linkWorkspace.value : '',
            });
            const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
            const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
            const version = outcome !== null && typeof outcome === 'object' && outcome.version !== null && typeof outcome.version === 'object' ? outcome.version : null;
            if (outcomeState === 'recorded') {
              editLocalNotice = version !== null && version.submission === 'unknown'
                ? '重发结果未知：只给核对同一操作（不自动重试、不放回可重发队列）。'
                : '重发已接收（等待生效确认）：与普通发送同一入口。';
            } else {
              editLocalNotice = code === 'edit-verify-required' ? '结果未知：先点「核对同一操作」——不给重试、不自动重发。'
                : code === 'edit-inflight' ? '上一次重发还在路上：未并行发起。'
                  : code === 'edit-paused' ? '会话已暂停：重发没有派发（恢复后再次显式重发）。'
                    : code === 'edit-workspace-missing' ? '先关联工作区再重发（重发走同一发送入口）。'
                      : '重发失败（' + String(code ?? '未知') + '）：未确认送达，请核对。';
            }
            resendButton.disabled = false;
            await refresh();
            if (editNote !== null && editLocalNotice !== null) editNote.textContent = editLocalNotice;
          })();
          return;
        }
        const verifyButton = event.target?.closest?.('[data-edit-verify]') ?? null;
        if (verifyButton === null || verifyButton.disabled === true) return;
        const editId = String(verifyButton.dataset.editVerify ?? '');
        verifyButton.disabled = true;
        editLocalNotice = null;
        void (async () => {
          const outcome = await postEdits({ action: 'verify', editId });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          const version = outcome !== null && typeof outcome === 'object' && outcome.version !== null && typeof outcome.version === 'object' ? outcome.version : null;
          if (outcomeState === 'checked') {
            editLocalNotice = version !== null && version.submission === 'effective' ? '已生效：该版本已落史。'
              : code === 'edit-version-not-visible' ? '已接收但尚未见该版本落史（保持等待确认，不猜测）。'
                : version !== null && version.submission === 'not-delivered' ? '核对确认未送达：可再次显式重发（不自动）。'
                  : '核对完成（' + String(code ?? '未见落史') + '）：保持现状。';
          } else {
            editLocalNotice = '核对失败（' + String(code ?? '未知') + '）：保持现状，不自动重试。';
          }
          verifyButton.disabled = false;
          await refresh();
          if (editNote !== null && editLocalNotice !== null) editNote.textContent = editLocalNotice;
        })();
      });
    }

    // 035：锚点读取/预览/定位。预览零请求；定位恰一条纯历史读；hover 无监听、不发命令。
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
    if (anchorRead !== null) {
      anchorRead.addEventListener('click', () => {
        anchorRead.disabled = true;
        void (async () => {
          const outcome = await postAnchors({ action: 'read' });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState !== 'read') {
            anchorLocalNotice = outcomeState === 'no-session' ? '还没有会话：没有锚点可读（读取不会创建会话）。'
              : '锚点读取失败（' + String(code ?? '未知') + '）：未核验，不以空列表冒充。';
          } else {
            anchorLocalNotice = null;
          }
          anchorRead.disabled = false;
          await refresh();
          if (anchorNote !== null && anchorLocalNotice !== null) anchorNote.textContent = anchorLocalNotice;
        })();
      });
    }
    if (anchorRows !== null) {
      anchorRows.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-anchor-preview]') ?? null;
        if (button === null) return;
        const runSeq = Number.parseInt(String(button.dataset.anchorPreview ?? ''), 10);
        if (!Number.isSafeInteger(runSeq) || runSeq < 0) return;
        anchorSelected = runSeq;
        const list = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionAnchors !== null && typeof lastStatePayload.sessionAnchors === 'object' && Array.isArray(lastStatePayload.sessionAnchors.anchors)
          ? lastStatePayload.sessionAnchors.anchors
          : [];
        const anchor = list.find((entry) => entry !== null && typeof entry === 'object' && entry.runSeq === runSeq) ?? null;
        if (anchor === null) return;
        if (anchorPreview !== null) anchorPreview.hidden = false;
        if (anchorPreviewText !== null) {
          anchorPreviewText.textContent = '运行 @' + String(runSeq) + (typeof anchor.turn === 'number' ? '·第 ' + String(anchor.turn) + ' 轮' : '')
            + '：' + (typeof anchor.promptPreview === 'string' && anchor.promptPreview !== '' ? anchor.promptPreview : '（该轮没有用户文本预览）');
        }
        // 预览是本地展示：零桥调用。
        if (anchorNote !== null) anchorNote.textContent = '锚点短预览（运行 @' + String(runSeq) + '）：有界短预览，未载入整段正文；点「定位到此轮消息」再显式定位。';
      });
    }
    if (anchorLocate !== null) {
      anchorLocate.addEventListener('click', () => {
        if (anchorSelected === null) return;
        const runSeq = anchorSelected;
        anchorLocate.disabled = true;
        anchorLocalNotice = null;
        void (async () => {
          const outcome = await postAnchors({ action: 'locate', runSeq });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState === 'located') {
            const preview = outcome !== null && typeof outcome === 'object' && typeof outcome.promptPreview === 'string' && outcome.promptPreview !== '' ? outcome.promptPreview : '（该轮没有用户文本预览）';
            if (anchorPreviewText !== null) anchorPreviewText.textContent = '已定位：运行 @' + String(runSeq) + '——' + preview;
            anchorLocalNotice = '已定位到运行 @' + String(runSeq) + ' 的该轮消息（短预览；只走了纯历史读取）。';
          } else if (outcomeState === 'no-session') {
            anchorLocalNotice = '还没有会话：无法定位（定位不会创建会话）。';
          } else {
            anchorLocalNotice = '运行 @' + String(runSeq) + ' 不可读（' + String(code ?? '未知') + '）：保持缺失（不显示空白成功）——现场保留，不回落为空白。';
          }
          anchorLocate.disabled = false;
          await refresh();
          if (anchorNote !== null && anchorLocalNotice !== null) anchorNote.textContent = anchorLocalNotice;
        })();
      });
    }
    if (anchorPreviewClose !== null) {
      anchorPreviewClose.addEventListener('click', () => {
        anchorSelected = null;
        if (anchorPreview !== null) anchorPreview.hidden = true;
      });
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
    if (clarificationCards !== null) {
      clarificationCards.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-clarification-submit]') ?? null;
        if (button === null || button.disabled) return;
        const requestId = String(button.dataset.clarificationSubmit ?? '');
        const pendingList = lastStatePayload !== null && typeof lastStatePayload === 'object' && lastStatePayload.sessionClarifications !== null && typeof lastStatePayload.sessionClarifications === 'object' && Array.isArray(lastStatePayload.sessionClarifications.pending)
          ? lastStatePayload.sessionClarifications.pending
          : [];
        const card = pendingList.find((entry) => entry !== null && typeof entry === 'object' && entry.requestId === requestId) ?? null;
        if (card === null || !Array.isArray(card.questions)) return;
        const row = button.closest('[data-clarification-request]');
        const answers = [];
        for (const question of card.questions) {
          const questionId = String(question.questionId ?? '');
          const selected = [];
          if (row !== null) {
            for (const input of row.querySelectorAll('[data-clarification-option="' + questionId + '"]')) {
              if (input.checked === true) selected.push(String(input.value));
            }
          }
          const customInput = row === null ? null : row.querySelector('[data-clarification-custom="' + questionId + '"]');
          const custom = customInput !== null && typeof customInput.value === 'string' ? customInput.value.trim() : '';
          answers.push({ questionId, selected, ...(custom === '' ? {} : { custom }) });
        }
        button.disabled = true;
        clarificationLocalNotice = null;
        void (async () => {
          const outcome = await postClarificationAnswer({
            matterRef: linkMatter !== null && typeof linkMatter.value === 'string' ? linkMatter.value : '',
            requestId,
            answers,
          });
          const outcomeState = outcome !== null && typeof outcome === 'object' && typeof outcome.state === 'string' ? outcome.state : null;
          const code = outcome !== null && typeof outcome === 'object' && typeof outcome.code === 'string' ? outcome.code : null;
          if (outcomeState !== 'recorded') {
            clarificationLocalNotice = code === 'clarification-paused' ? '会话已暂停：停止可能已中止该提问——回答不会送达；继续会话后再回答。'
              : code === 'clarification-not-pending' ? '该提问已不在等待中（可能已中止或已被处理）：未提交，不给重试。'
                : code === 'clarification-answer-invalid' ? '回答不完整或不在候选项内：每个问题至少选一项或填自定义（两者同权）。'
                  : '回答提交失败（' + String(code ?? '未知') + '）：未确认送达，请核对。';
          }
          button.disabled = false;
          await refresh();
          if (clarificationNote !== null && clarificationLocalNotice !== null) clarificationNote.textContent = clarificationLocalNotice;
        })();
      });
    }
    if (clarificationReceipts !== null) {
      clarificationReceipts.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-clarification-verify]') ?? null;
        if (button === null || button.disabled) return;
        button.disabled = true;
        void refresh().finally(() => { button.disabled = false; });
      });
    }

    // ADR-0261 P2: the trace drawer state machine (open/close, Escape/Tab containment, media
    // breakpoint, focus restoration) now lives in the React matter region component.
    // Batch 16: the React support cards call their explicit entries back through this down-bridge;
    // the request/refusal/text handling stays here (single home of the wire semantics).
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
