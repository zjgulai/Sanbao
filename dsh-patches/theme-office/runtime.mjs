// Serialized into Office's own client factory; no cross-plugin global API.
export function createHostBridge() {
  const themes = new Set(['light', 'dark', 'warm-pink']);
  const frames = new Map();
  let active = false;
  const theme = () => document.body?.getAttribute('data-sanbao-theme');
  function localViewer(value) {
    let url;
    try { url = new URL(value); } catch { return null; }
    // Matches the inspected gateway producer, not arbitrary loopback pages.
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
        url.username || url.password || url.pathname !== '/' ||
        url.searchParams.getAll('file').length !== 1 || !url.searchParams.get('file')) return null;
    return url;
  }
  function send(frame) {
    const owned = frames.get(frame), id = theme();
    if (!active || !owned || !themes.has(id) || frame.src !== owned.href) return;
    frame.contentWindow?.postMessage({ type: 'lute:office-theme', themeId: id }, owned.origin);
  }
  return {
    frameProps(value) {
      const url = localViewer(value);
      if (!url) return { src: value };
      url.searchParams.set('luteHostOrigin', location.origin);
      url.searchParams.delete('luteTheme');
      if (themes.has(theme())) url.searchParams.set('luteTheme', theme());
      let current;
      return {
        src: url.href,
        ref(node) {
          if (current) frames.delete(current);
          current = node;
          if (node) frames.set(node, { href: url.href, origin: url.origin });
        },
        onLoad(event) { send(event.currentTarget); },
      };
    },
    start() {
      active = true;
      const broadcast = () => frames.forEach((_, frame) => send(frame));
      const observer = new MutationObserver(broadcast);
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-sanbao-theme'] });
      broadcast();
      return () => { active = false; observer.disconnect(); frames.clear(); };
    },
  };
}

// Messages carry only a fixed enum; neither styling nor executable data crosses the frame.
export function createViewerBridge() {
  const themes = new Set(['light', 'dark', 'warm-pink']);
  function allowedOrigin(value, originOnly = false) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || (originOnly && value !== url.origin)) return null;
    return url.origin;
  }
  const params = new URLSearchParams(location.search);
  const controlled = params.getAll('luteHostOrigin');
  const declared = controlled.length === 1 ? allowedOrigin(controlled[0], true) : null;
  const referrer = document.referrer ? allowedOrigin(document.referrer) : null;
  let hostOrigin = null;
  if (window.parent !== window) {
    // On reload the browser reports this viewer as referrer. The host-owned URL
    // preserves the exact allowed loopback origin; an arbitrary remote origin is never accepted.
    if (declared && (!document.referrer || referrer === declared || referrer === location.origin)) hostOrigin = declared;
    else if (!controlled.length && referrer && referrer !== location.origin) hostOrigin = referrer;
  }
  const query = params.getAll('luteTheme');
  let id = hostOrigin && query.length === 1 && themes.has(query[0]) ? query[0] : 'light';
  let update = null;
  let disposed = false;
  function paint() {
    document.documentElement.setAttribute('data-sanbao-theme', id);
    document.body.setAttribute('data-sanbao-theme', id);
  }
  function receive(event) {
    if (disposed || !hostOrigin || event.source !== window.parent || event.origin !== hostOrigin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        Object.keys(data).length !== 2 || data.type !== 'lute:office-theme' || !themes.has(data.themeId)) return;
    if (id === data.themeId) return;
    id = data.themeId;
    paint();
    update?.(id, true);
  }
  if (hostOrigin) window.addEventListener('message', receive);
  paint();
  return {
    scheme: () => id === 'dark' ? 'dark' : 'light',
    retainQuery(search) {
      if (hostOrigin) { search.set('luteHostOrigin', hostOrigin); search.set('luteTheme', id); }
    },
    attach(callback) {
      update = callback;
      callback(id, false);
      return () => { disposed = true; update = null; window.removeEventListener('message', receive); };
    },
  };
}
