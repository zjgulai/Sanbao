/** Static, self-owned Sage renderer. It has no upstream UI, slot, or runtime dependency. */

import { renderSageWorkspace } from './component-renderer.js'
import { SAGE_ACTIONS_PATH, SAGE_REQUEST_TIMEOUT_MS, SAGE_STATE_PATH } from './contracts.js'

/** Render the complete first Sage product surface without a client-side framework dependency. */
export function renderSageDocument(): string {
  const statePath = JSON.stringify(SAGE_STATE_PATH)
  const actionsPath = JSON.stringify(SAGE_ACTIONS_PATH)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sage</title>
  <style>
    :root {
      color-scheme: dark;
      --sage-ink: #f2f4ef;
      --sage-muted: #9ba8a2;
      --sage-faint: #6e7b76;
      --sage-line: rgb(160 185 173 / 18%);
      --sage-line-strong: rgb(160 185 173 / 34%);
      --sage-surface: #111a18;
      --sage-surface-raised: #17231f;
      --sage-surface-soft: #1c2b26;
      --sage-accent: #9bd6b8;
      --sage-accent-strong: #c2efd5;
      --sage-warning: #e7c78d;
      --sage-danger: #ee9c8d;
      --sage-sidebar: #0d1513;
      --sage-shadow: 0 1.5rem 4rem rgb(0 0 0 / 28%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--sage-surface);
      color: var(--sage-ink);
    }
    * { box-sizing: border-box; }
    html { min-width: 320px; background: var(--sage-surface); }
    body { min-height: 100vh; margin: 0; background: radial-gradient(circle at 72% 4%, #29483b 0, transparent 34rem), var(--sage-surface); }
    button { font: inherit; }
    button:focus-visible { outline: 2px solid var(--sage-accent); outline-offset: 3px; }
    [hidden] { display: none !important; }
    .sage-app { min-height: 100vh; display: grid; grid-template-columns: 15rem minmax(0, 1fr); }
    .sage-sidebar { display: flex; flex-direction: column; min-height: 100vh; padding: 1.5rem 1rem; border-right: 1px solid var(--sage-line); background: rgb(8 15 13 / 78%); }
    .sage-brand { display: flex; align-items: center; gap: .7rem; padding: .25rem .75rem 2.5rem; color: var(--sage-ink); font-size: 1.15rem; font-weight: 680; letter-spacing: .06em; }
    .sage-mark { width: 1.35rem; height: 1.35rem; display: grid; place-items: center; border: 1px solid var(--sage-accent); border-radius: 50%; transform: rotate(-25deg); }
    .sage-mark span { width: .42rem; height: .42rem; border-radius: 50%; background: var(--sage-accent); }
    .sage-nav-label, .sage-card-label, .sage-kicker, .sage-eyebrow { color: var(--sage-faint); font-size: .68rem; letter-spacing: .13em; text-transform: uppercase; }
    .sage-nav-label { margin: 0 .75rem .55rem; }
    .sage-nav { display: grid; gap: .25rem; }
    .sage-nav-item { display: flex; align-items: center; gap: .7rem; width: 100%; padding: .72rem .75rem; border: 1px solid transparent; border-radius: .7rem; background: transparent; color: var(--sage-muted); cursor: pointer; text-align: left; }
    .sage-nav-item:hover { background: rgb(155 214 184 / 7%); color: var(--sage-ink); }
    .sage-nav-item.is-active { border-color: var(--sage-line); background: var(--sage-surface-soft); color: var(--sage-accent-strong); }
    .sage-nav-icon { width: 1.2rem; color: var(--sage-accent); text-align: center; }
    .sage-sidebar-foot { display: flex; align-items: center; gap: .55rem; margin-top: auto; padding: 1rem .75rem .25rem; border-top: 1px solid var(--sage-line); color: var(--sage-muted); font-size: .75rem; line-height: 1.35; }
    .sage-status-dot { width: .55rem; height: .55rem; flex: 0 0 auto; border-radius: 50%; background: var(--sage-warning); box-shadow: 0 0 .8rem rgb(231 199 141 / 38%); }
    .sage-status-dot.is-ready { background: var(--sage-accent); box-shadow: 0 0 .8rem rgb(155 214 184 / 46%); }
    .sage-status-dot.is-unavailable { background: var(--sage-danger); box-shadow: 0 0 .8rem rgb(238 156 141 / 38%); }
    .sage-main { min-width: 0; padding: 1.5rem clamp(1.25rem, 4vw, 4rem) 2rem; }
    .sage-topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; min-height: 4rem; }
    .sage-kicker { margin: .25rem 0 .35rem; color: var(--sage-accent); }
    .sage-breadcrumb { margin: 0; color: var(--sage-muted); font-size: .82rem; }
    .sage-topbar-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
    .sage-fixture-pill, .sage-runtime-pill { display: inline-flex; align-items: center; min-height: 1.85rem; padding: .25rem .65rem; border: 1px solid var(--sage-line); border-radius: 99rem; color: var(--sage-muted); font-size: .7rem; }
    .sage-runtime-pill { border-color: var(--sage-line-strong); color: var(--sage-accent-strong); }
    .sage-panel { display: none; padding-top: 2.25rem; }
    .sage-panel.is-visible { display: block; animation: sage-panel-in .24s ease-out both; }
    .sage-hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(18rem, .8fr); gap: clamp(1.5rem, 5vw, 5rem); align-items: center; padding: clamp(1rem, 3vw, 3rem) 0 3rem; }
    .sage-eyebrow { margin: 0 0 1rem; color: var(--sage-accent); }
    .sage-hero h1, .sage-section-heading h1 { margin: 0; color: var(--sage-ink); font-size: clamp(2rem, 5vw, 4.2rem); font-weight: 510; letter-spacing: -.06em; line-height: 1.05; }
    .sage-hero h1 em { color: var(--sage-accent-strong); font-style: normal; }
    .sage-lead { max-width: 39rem; margin: 1.35rem 0 0; color: var(--sage-muted); font-size: 1rem; line-height: 1.75; }
    .sage-hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; margin-top: 1.7rem; }
    .sage-primary-button, .sage-secondary-button { border-radius: .65rem; cursor: pointer; font-weight: 650; }
    .sage-primary-button { padding: .75rem 1rem; border: 1px solid var(--sage-accent); background: var(--sage-accent); color: #102019; }
    .sage-secondary-button { padding: .58rem .85rem; border: 1px solid var(--sage-line-strong); background: transparent; color: var(--sage-accent-strong); }
    .sage-primary-button:hover, .sage-secondary-button:hover { filter: brightness(1.08); }
    .sage-muted-copy, .sage-card-note { color: var(--sage-faint); font-size: .78rem; }
    .sage-network-card { position: relative; min-height: 22rem; padding: 1rem; overflow: hidden; border: 1px solid var(--sage-line); border-radius: 1.3rem; background: linear-gradient(145deg, rgb(42 76 61 / 42%), rgb(14 25 21 / 68%)); box-shadow: var(--sage-shadow); }
    .sage-network-head { display: flex; justify-content: space-between; color: var(--sage-faint); font-size: .65rem; letter-spacing: .12em; }
    .sage-network-signal { width: .48rem; height: .48rem; border-radius: 50%; background: var(--sage-accent); box-shadow: 0 0 .8rem var(--sage-accent); }
    .sage-network-orbit { position: absolute; display: grid; place-items: center; width: 4.4rem; height: 4.4rem; border: 1px solid rgb(155 214 184 / 36%); border-radius: 50%; color: var(--sage-muted); font-size: .7rem; }
    .orbit-one { top: 27%; left: 12%; }
    .orbit-two { top: 47%; right: 9%; }
    .orbit-three { bottom: 13%; left: 29%; }
    .sage-network-card::before, .sage-network-card::after { position: absolute; content: ""; border: 1px dashed rgb(155 214 184 / 24%); border-radius: 50%; }
    .sage-network-card::before { inset: 25% 12%; }
    .sage-network-card::after { inset: 12% 27%; }
    .sage-network-core { position: absolute; top: 50%; left: 50%; display: grid; place-items: center; width: 8.4rem; height: 8.4rem; transform: translate(-50%, -50%); border: 1px solid var(--sage-accent); border-radius: 50%; background: rgb(14 30 24 / 88%); box-shadow: 0 0 2.5rem rgb(155 214 184 / 20%); text-align: center; }
    .sage-network-core strong { color: var(--sage-accent-strong); font-size: 1.15rem; line-height: 1.2; }
    .sage-network-core small { color: var(--sage-muted); font-size: .62rem; }
    .sage-network-caption { position: absolute; right: 1rem; bottom: 1rem; left: 1rem; color: var(--sage-muted); font-size: .72rem; text-align: center; }
    .sage-grid { display: grid; gap: 1rem; }
    .sage-grid-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sage-card { min-width: 0; padding: 1.35rem; border: 1px solid var(--sage-line); border-radius: 1rem; background: rgb(19 31 26 / 74%); }
    .sage-card-head { display: flex; justify-content: space-between; gap: 1rem; }
    .sage-card-index { color: var(--sage-faint); font-size: .7rem; }
    .sage-card-icon { margin-top: 1.6rem; color: var(--sage-accent); font-size: 1.35rem; }
    .sage-card h2 { margin: .7rem 0 .55rem; color: var(--sage-ink); font-size: 1.15rem; font-weight: 580; letter-spacing: -.02em; }
    .sage-card p { margin: 0; color: var(--sage-muted); font-size: .86rem; line-height: 1.7; }
    .sage-runtime-card p#state-message { min-height: 2.9rem; }
    .sage-runtime-card .sage-secondary-button { margin-top: 1rem; }
    .sage-card-note { margin-top: 1.3rem !important; font-size: .72rem !important; }
    .sage-matter-status, .sage-state-row { display: flex; align-items: center; gap: .55rem; color: var(--sage-warning); font-size: .75rem; }
    .sage-matter-card h2 { margin-top: 1.15rem; }
    .sage-matter-meta { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: 1.25rem; color: var(--sage-faint); font-size: .68rem; }
    .sage-matter-meta span { padding: .26rem .5rem; border: 1px solid var(--sage-line); border-radius: 99rem; }
    .sage-link-button { display: inline-flex; gap: .45rem; margin-top: 1.35rem; padding: 0; border: 0; background: transparent; color: var(--sage-accent-strong); cursor: pointer; font-size: .78rem; }
    .sage-evidence-strip { margin-top: 1rem; padding: 1rem 1.35rem; border: 1px solid var(--sage-line); border-radius: 1rem; background: rgb(11 20 17 / 58%); }
    .sage-evidence-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .sage-evidence-heading strong { color: var(--sage-muted); font-size: .78rem; font-weight: 500; }
    .sage-trace-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; margin: 1rem 0 0; padding: 0; list-style: none; }
    .sage-trace-list li { display: grid; gap: .25rem; padding: .7rem; border-top: 1px solid var(--sage-line); color: var(--sage-faint); }
    .sage-trace-list li.is-current { border-color: var(--sage-accent); color: var(--sage-accent-strong); }
    .sage-trace-list span, .sage-trace-list small { font-size: .65rem; }
    .sage-trace-list b { font-size: .78rem; font-weight: 550; }
    .sage-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
    .sage-section-heading h1 { font-size: clamp(2rem, 5vw, 3.35rem); }
    .sage-matter-layout, .sage-governance-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(15rem, .75fr); gap: 1rem; }
    .sage-matter-main h2 { margin-top: 1.25rem; font-size: clamp(1.4rem, 3vw, 2.2rem); }
    .sage-state-row { justify-content: space-between; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--sage-line); color: var(--sage-muted); }
    .sage-state-row strong { color: var(--sage-accent-strong); font-size: .8rem; font-weight: 550; }
    .sage-state-row strong.is-blocked, .sage-state-tag.is-blocked { color: var(--sage-warning); }
    .sage-side-note { align-self: start; }
    .sage-side-note .sage-secondary-button { margin-top: 1.25rem; }
    .sage-action-preview-section { margin-top: 1rem; padding: 1.35rem; border: 1px solid var(--sage-line); border-radius: 1rem; background: rgb(11 20 17 / 58%); }
    .sage-action-preview-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .sage-action-preview-heading h2 { margin: .55rem 0 0; color: var(--sage-ink); font-size: 1.25rem; font-weight: 560; }
    .sage-preview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-top: 1rem; }
    .sage-action-preview-card { min-width: 0; padding: 1rem; border: 1px solid var(--sage-line); border-radius: .8rem; background: rgb(19 31 26 / 74%); }
    .sage-action-preview-head { display: grid; gap: .45rem; }
    .sage-action-preview-head strong { color: var(--sage-ink); font-size: .9rem; font-weight: 580; }
    .sage-action-preview-state { display: inline-flex; margin-top: .9rem; padding: .25rem .5rem; border: 1px solid rgb(155 214 184 / 28%); border-radius: 99rem; color: var(--sage-accent-strong); font-size: .7rem; }
    .sage-action-preview-state.is-blocked { border-color: rgb(231 199 141 / 38%); color: var(--sage-warning); }
    .sage-preview-meta { display: grid; gap: .25rem; margin: .85rem 0 0; color: var(--sage-faint); font-size: .68rem; line-height: 1.4; }
    .sage-preview-meta code, .sage-preview-denial code { overflow-wrap: anywhere; color: var(--sage-muted); font: inherit; }
    .sage-preview-denial { margin: .85rem 0 0; padding-top: .75rem; border-top: 1px solid var(--sage-line); color: var(--sage-faint); font-size: .68rem; line-height: 1.45; }
    .sage-preview-foot { display: flex; justify-content: space-between; align-items: end; gap: .5rem; margin-top: 1rem; color: var(--sage-faint); font-size: .65rem; line-height: 1.35; }
    .sage-preview-not-submitted { color: var(--sage-accent); text-align: right; }
    .sage-capability-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
    .sage-capability-glyph { color: var(--sage-accent); font-size: .76rem; letter-spacing: .1em; }
    .sage-state-tag { display: inline-block; margin-top: 1.2rem; color: var(--sage-accent-strong); font-size: .7rem; }
    .sage-governance-card h2 { margin-top: 1.25rem; }
    .sage-footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 2rem; color: var(--sage-faint); font-size: .68rem; }
    @keyframes sage-panel-in { from { opacity: 0; transform: translateY(.3rem); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 900px) {
      .sage-app { grid-template-columns: 5.2rem minmax(0, 1fr); }
      .sage-sidebar { padding-inline: .55rem; }
      .sage-brand { justify-content: center; padding-inline: 0; }
      .sage-brand > span:last-child, .sage-nav-label, .sage-nav-item > span:last-child, .sage-sidebar-foot > span:last-child { display: none; }
      .sage-nav-item { justify-content: center; padding-inline: .4rem; }
      .sage-sidebar-foot { justify-content: center; padding-inline: 0; }
      .sage-hero { grid-template-columns: 1fr; }
      .sage-network-card { min-height: 18rem; }
    }
    @media (max-width: 680px) {
      .sage-main { padding-inline: 1rem; }
      .sage-topbar { display: block; }
      .sage-topbar-meta { justify-content: flex-start; margin-top: .8rem; }
      .sage-grid-overview, .sage-matter-layout, .sage-governance-grid, .sage-capability-grid { grid-template-columns: 1fr; }
      .sage-preview-grid { grid-template-columns: 1fr; }
      .sage-trace-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .sage-footer { display: block; line-height: 1.7; }
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
    const title = document.querySelector('#state-title');
    const message = document.querySelector('#state-message');
    const retry = document.querySelector('#retry');
    const login = document.querySelector('#login');
    const logoutBtn = document.querySelector('#logout');
    const authName = document.querySelector('#auth-name');
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

    function setView(view) {
      const nextView = panels.some((panel) => panel.dataset.panel === view) ? view : 'overview';
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

    function renderAuth(auth) {
      if (!auth || typeof auth !== 'object') return;
      if (login) login.hidden = auth.status !== 'signed-out';
      if (logoutBtn) logoutBtn.hidden = auth.status !== 'signed-in';
      if (authName) {
        authName.textContent = auth.status === 'signed-in' && typeof auth.displayName === 'string' ? auth.displayName
          : auth.status === 'pending' ? '正在登录…' : '';
      }
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
        // Off 状态的 Host P0-2 返回扁平 SageViewState；on 状态的 appservice 返回 { service, runtime }。
        const payload = await response.json();
        const state = payload !== null && typeof payload === 'object' && payload.runtime !== undefined ? payload.runtime : payload;
        renderAuth(payload !== null && typeof payload === 'object' && payload.service !== undefined ? payload.service.auth : undefined);
        render(state);
      } catch {
        render(fallback());
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
        const response = await fetchWithinDeadline(actionsPath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'retry' }),
        });
        if (!response.ok) throw new Error('retry request failed');
        const payload = await response.json();
        // 0.2 command-denied shape carries {code, retryable, stage, correlation}; legacy P0-2 shape is flat {status,...}.
        // stage and correlation travel into the message so the renderer can audit service denials.
        const state = payload !== null && typeof payload === 'object' && payload.code !== undefined
          ? {
              status: 'recovering',
              message: 'Sage 正在重新检查能力运行时服务。'
                + (typeof payload.stage === 'string' && typeof payload.correlation === 'string'
                  ? '（' + payload.stage + ' · ' + payload.correlation + '）'
                  : ''),
              retryable: payload.retryable !== false,
            }
          : payload;
        render(state);
      } catch {
        render(fallback());
      }
      queueMicrotask(() => { void refresh(); });
    });

    if (login) {
      login.addEventListener('click', async () => {
        login.disabled = true;
        try { await fetchWithinDeadline(loginPath, { cache: 'no-store' }); } catch { /* state 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        try {
          await fetchWithinDeadline(logoutPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        } catch { /* refresh 兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    }

    setView('overview');
    void refresh();
  </script>
</body>
</html>`
}
