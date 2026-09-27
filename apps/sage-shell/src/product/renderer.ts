/** Static, self-owned Sage renderer. It has no upstream UI, slot, or runtime dependency. */

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
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #10110f; color: #f4f1e8; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: radial-gradient(circle at 18% 14%, #2d4136 0, transparent 34rem), #10110f; }
    main { width: min(38rem, calc(100vw - 3rem)); padding: 2.5rem; border: 1px solid #455144; border-radius: 1.5rem; background: rgb(20 24 20 / 88%); box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 32%); }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4rem; color: #bdcdbd; font-size: .875rem; }
    .wordmark { color: #f4f1e8; font-size: 1.25rem; font-weight: 650; letter-spacing: .06em; }
    .eyebrow { margin: 0 0 .75rem; color: #9fb69e; font-size: .875rem; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(2rem, 7vw, 3.5rem); letter-spacing: -.04em; }
    #state-message { max-width: 32rem; margin: 1rem 0 0; color: #c8d0c5; font-size: 1rem; line-height: 1.65; }
    button { margin-top: 2rem; padding: .75rem 1rem; border: 1px solid #a8c4a4; border-radius: .75rem; background: #b9d5b4; color: #172117; cursor: pointer; font: inherit; font-weight: 650; }
    button[hidden] { display: none; }
    button:disabled { cursor: wait; opacity: .65; }
    footer { margin-top: 4rem; color: #849183; font-size: .8125rem; }
  </style>
</head>
<body>
  <main>
    <header><span class="wordmark">Sage</span><span>桌面端</span></header>
    <section aria-labelledby="state-title">
      <p class="eyebrow">能力状态</p>
      <h1 id="state-title">正在检查</h1>
      <p id="state-message" role="status" aria-live="polite">正在读取 Sage 的受控状态。</p>
      <button id="retry" type="button" hidden>重新检查</button>
    </section>
    <footer>此页面只显示受控的运行时状态。</footer>
  </main>
  <script>
    const statePath = ${statePath};
    const actionsPath = ${actionsPath};
    const requestTimeoutMs = ${SAGE_REQUEST_TIMEOUT_MS};
    const title = document.querySelector('#state-title');
    const message = document.querySelector('#state-message');
    const retry = document.querySelector('#retry');
    const labels = { ready: '已就绪', unavailable: '暂不可用', recovering: '正在恢复' };

    function fallback() {
      return { status: 'unavailable', message: 'Sage 暂时无法读取受控状态，可稍后重新检查。', retryable: true };
    }

    function render(state) {
      const safe = state && typeof state === 'object' && labels[state.status] ? state : fallback();
      title.textContent = labels[safe.status];
      message.textContent = typeof safe.message === 'string' ? safe.message : fallback().message;
      retry.hidden = safe.retryable !== true;
      retry.disabled = safe.status === 'recovering';
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
        render(await response.json());
      } catch {
        render(fallback());
      }
    }

    retry.addEventListener('click', async () => {
      retry.disabled = true;
      try {
        const response = await fetchWithinDeadline(actionsPath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'retry' }),
        });
        if (!response.ok) throw new Error('retry request failed');
        render(await response.json());
      } catch {
        render(fallback());
      }
      queueMicrotask(() => { void refresh(); });
    });

    void refresh();
  </script>
</body>
</html>`
}
