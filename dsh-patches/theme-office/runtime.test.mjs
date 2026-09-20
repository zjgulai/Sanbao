import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { createHostBridge, createViewerBridge } from './runtime.mjs';

function hostFixture() {
  let id = 'warm-pink', changed, observerActive = true;
  const context = createContext({ URL, Set, Map, location: { origin: 'http://127.0.0.1:8000' },
    document: { body: { getAttribute: () => id } },
    MutationObserver: class { constructor(fn) { changed = fn; } observe() {} disconnect() { observerActive = false; } },
  });
  return { bridge: runInContext(`(${createHostBridge.toString()})()`, context),
    change(value) { id = value; if (observerActive) changed(); } };
}

test('host rejects remote or unrelated local viewers and sends only enum to exact owned origin', () => {
  const { bridge, change } = hostFixture();
  const stop = bridge.start();
  for (const url of ['https://example.com/?file=x', 'http://127.0.0.1.evil.test:80/?file=x',
    'http://127.0.0.1:9080/admin?file=x', 'http://127.0.0.1:9080/?file=',
    'http://user:pass@127.0.0.1:9080/?file=x', 'file:///tmp/a', 'http://127.0.0.1:9080/?file=x&file=y']) {
    const props = bridge.frameProps(url);
    assert.equal(props.src, url); assert.equal(props.ref, undefined); assert.equal(props.onLoad, undefined);
  }
  const sent = [], props = bridge.frameProps('http://127.0.0.1:9080/?file=test');
  assert.equal(new URL(props.src).searchParams.get('luteTheme'), 'warm-pink');
  const frame = { src: props.src, contentWindow: { postMessage: (data, origin) => sent.push(JSON.parse(JSON.stringify({ data, origin }))) } };
  props.ref(frame); props.onLoad({ currentTarget: frame });
  assert.deepEqual(sent, [{ data: { type: 'lute:office-theme', themeId: 'warm-pink' }, origin: 'http://127.0.0.1:9080' }]);
  change('unknown'); assert.equal(sent.length, 1);
  change('dark'); assert.equal(sent.at(-1).data.themeId, 'dark');
  frame.src = 'http://127.0.0.1:9081/?file=test'; change('light'); assert.equal(sent.length, 2);
  frame.src = props.src; props.ref(null); change('light'); assert.equal(sent.length, 2);
  props.ref(frame); stop(); props.onLoad({ currentTarget: frame }); assert.equal(sent.length, 2);
});

function viewerFixture(search, referrer, nested = true) {
  const listeners = new Map(), attrs = {}, parent = {};
  const window = { parent, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  if (!nested) window.parent = window;
  const context = createContext({ URL, URLSearchParams, Set, Object, Array, window,
    location: { search, origin: 'http://127.0.0.1:9080' },
    document: { referrer, body: { setAttribute: (name, value) => attrs[name] = value }, documentElement: { setAttribute() {} } },
  });
  const bridge = runInContext(`(${createViewerBridge.toString()})()`, context);
  return { bridge, attrs, listeners, message(data, source = parent, origin = 'http://127.0.0.1:8000') {
    listeners.get('message')?.({ source, origin, data });
  } };
}

test('receiver rejects wrong source/origin/fields and removes its message listener on dispose', () => {
  const f = viewerFixture('?luteTheme=warm-pink', 'http://127.0.0.1:8000/');
  const changes = [], dispose = f.bridge.attach((id, notify) => changes.push([id, notify]));
  f.message({ type: 'lute:office-theme', themeId: 'dark' }, {});
  f.message({ type: 'lute:office-theme', themeId: 'dark' }, undefined, 'http://127.0.0.1:8001');
  for (const data of [null, 'dark', { type: 'lute:office-theme', themeId: 'unknown' },
    { type: 'lute:office-theme', themeId: 'dark', code: 'bad' }, { themeId: 'dark' }]) f.message(data);
  assert.deepEqual(changes, [['warm-pink', false]]);
  f.message({ type: 'lute:office-theme', themeId: 'dark' });
  assert.deepEqual(changes.at(-1), ['dark', true]);
  const query = new URLSearchParams('file=a'); f.bridge.retainQuery(query);
  assert.equal(query.get('file'), 'a'); assert.equal(query.get('luteHostOrigin'), 'http://127.0.0.1:8000');
  dispose(); assert.equal(f.listeners.size, 0);
  f.message({ type: 'lute:office-theme', themeId: 'light' }); assert.equal(f.attrs['data-sanbao-theme'], 'dark');
});

test('query cannot claim a remote host, ambiguous origin, or standalone live channel', () => {
  for (const [search, referrer, nested] of [
    ['?luteTheme=dark', '', true],
    ['?luteTheme=dark&luteHostOrigin=https://evil.test', '', true],
    ['?luteTheme=dark&luteHostOrigin=http://127.0.0.1:8000/path', '', true],
    ['?luteTheme=dark&luteHostOrigin=http://127.0.0.1:8000&luteHostOrigin=http://127.0.0.1:8001', '', true],
    ['?luteTheme=dark&luteHostOrigin=http://127.0.0.1:8000', 'https://evil.test/', true],
    ['?luteTheme=dark&luteHostOrigin=http://127.0.0.1:8000', '', false],
  ]) {
    const f = viewerFixture(search, referrer, nested);
    assert.equal(f.bridge.scheme(), 'light'); assert.equal(f.listeners.size, 0);
  }
  const reload = viewerFixture('?luteTheme=dark&luteHostOrigin=http://127.0.0.1:8000', 'http://127.0.0.1:9080/?file=a');
  assert.equal(reload.bridge.scheme(), 'dark');
  reload.message({ type: 'lute:office-theme', themeId: 'warm-pink' });
  assert.equal(reload.attrs['data-sanbao-theme'], 'warm-pink'); assert.equal(reload.bridge.scheme(), 'light');
});
