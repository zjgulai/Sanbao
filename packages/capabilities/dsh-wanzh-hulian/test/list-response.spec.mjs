import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mutationRoot } from '../../../../scripts/lib/mutation-fixture.mjs'

const previousHome = process.env.HOME
const HOME = mutationRoot('wanzh-list-home-')
process.env.HOME = HOME
const { apply } = await import('../lib/index.js')
const STATE_FILE = join(HOME, '.dsh', 'integrations', 'getnote', 'config.json')
const CONNECTIONS_FILE = join(HOME, '.dsh', 'integrations', 'wanzh-hulian', 'connections.json')
const MCP_FILE = join(HOME, '.dsh', 'integrations', 'wanzh-hulian', 'mcp-servers.json')
const CLI_FILE = join(HOME, '.getnote', 'config.json')
const LIST_PATH = '/api/dsh-wanzh-hulian/list'
const GETNOTE_TOOLS = [
  'getnote_topics', 'getnote_recall', 'getnote_recall_kb', 'getnote_save',
  'getnote_list', 'getnote_get', 'getnote_quota', 'getnote_update_note',
  'getnote_add_tags', 'getnote_delete_tag', 'getnote_topic_notes',
  'getnote_move_to_topic', 'getnote_remove_from_topic', 'getnote_create_topic',
  'getnote_topic_directories', 'getnote_create_directory', 'getnote_update_directory',
  'getnote_delete_directory', 'getnote_delete_note',
]
const GETNOTE = {
  id: 'getnote-brain', board: 'knowledge', kind: 'builtin', title: 'Test knowledge',
  subtitle: 'Local fixture', enabled: false, extras: ['model-invoke'],
  authFields: [{ ref: 'getnote_api_key', secret: true }, { ref: 'getnote_client_id', secret: true }],
  probe: { kind: 'getnote' }, capabilities: ['Recall'], note: 'Fixture note',
  command: { slug: 'custom', allSearch: '/custom search', allSave: '/custom save' },
  oauthCmd: 'fixture auth login', platformUrl: 'https://example.invalid/platform',
  docUrl: 'https://example.invalid/docs', logo: 'fixture-logo',
  tools: ['stale_unregistered_tool'], state: { stale: true }, custom: { keep: 7 },
}

function diskBytes() {
  const bytes = new Map()
  for (const path of readdirSync(HOME, { recursive: true, encoding: 'utf8' }).sort()) {
    const file = join(HOME, path)
    bytes.set(path, statSync(file).isDirectory() ? null : readFileSync(file))
  }
  return bytes
}

function writeConnections(connections) {
  writeFileSync(CONNECTIONS_FILE, JSON.stringify({ schemaVersion: 1, connections }, null, 2) + '\n')
}

function boot(t, credentials) {
  const routes = new Map()
  const tools = []
  const effects = []
  apply({
    credentials,
    get: () => undefined,
    effect(fn, name) {
      effects.push(name)
      if (name !== 'dsh-wanzh-hulian: routes') return () => {}
      const dispose = fn()
      t.after(dispose)
      return dispose
    },
    tools: { register(def) { tools.push(def.name) } },
    webServer: {
      register(spec) {
        routes.set(spec.path, spec.handler)
        return () => routes.delete(spec.path)
      },
    },
  })
  assert.equal(effects.filter((name) => name === 'dsh-wanzh-hulian: routes').length, 1)
  const handler = routes.get(LIST_PATH)
  assert.equal(typeof handler, 'function')
  return { handler, tools }
}

async function call(handler, { method = 'GET', remoteAddress = '127.0.0.1', host = '127.0.0.1:43120' } = {}) {
  const response = { statusCode: 0, headers: {}, text: '' }
  await handler({ method, url: LIST_PATH, socket: { remoteAddress }, headers: { host } }, {
    writeHead(statusCode, headers) {
      response.statusCode = statusCode
      response.headers = headers
    },
    end(chunk) {
      response.text = String(chunk)
    },
  })
  return { ...response, body: JSON.parse(response.text) }
}

test.beforeEach(() => {
  rmSync(join(HOME, '.dsh'), { recursive: true, force: true })
  rmSync(join(HOME, '.getnote'), { recursive: true, force: true })
  mkdirSync(join(HOME, '.dsh', 'integrations', 'getnote'), { recursive: true })
  mkdirSync(join(HOME, '.dsh', 'integrations', 'wanzh-hulian'), { recursive: true })
  mkdirSync(join(HOME, '.getnote'), { recursive: true })
  mock.method(globalThis, 'fetch', () => assert.fail('/list must not use the network'))
})

test.afterEach(() => mock.restoreAll())

test.after(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  rmSync(HOME, { recursive: true, force: true })
})

test('/list projects exact connection state, runtime board IDs and registered tools without exposing credentials or writing files', async (t) => {
  writeFileSync(STATE_FILE, '{ "enabled": true, "modelInvoke": true, "defaultTopicId": "topic-42", "unknown": 9 }\n')
  writeConnections([GETNOTE, {
    id: 'runtime-api', board: 'api', title: 'Runtime API', tools: ['custom_tool'],
    authFields: [
      { ref: 'missing', secret: true }, { ref: 'throwing', secret: true },
      { ref: 'empty', secret: true }, { ref: 'numeric', secret: true }, { ref: 'present', secret: true },
    ],
    custom: { keep: true },
  }])
  writeFileSync(MCP_FILE, '{ "servers": [] }\n')
  const before = diskBytes()
  const calls = []
  const { handler, tools } = boot(t, {
    async resolve(ref) {
      calls.push(ref)
      if (ref === 'getnote_api_key') return { value: 'secret-form-api' }
      if (ref === 'getnote_client_id') return { value: 'secret-form-client' }
      if (ref === 'throwing') throw new Error('secret-credential-error')
      if (ref === 'empty') return { value: '' }
      if (ref === 'numeric') return { value: 12345 }
      if (ref === 'present') return { value: 'secret-runtime-value' }
      return undefined
    },
  })
  const response = await call(handler)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.headers, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  })
  assert.deepEqual(tools.filter((name) => name.startsWith('getnote_')), GETNOTE_TOOLS)
  assert.deepEqual(response.body, {
    ok: true,
    boards: [
      { key: 'mcp', title: 'MCP 连接', icon: '\u{1f50c}', desc: '接入 MCP Server（stdio / HTTP），工具桥接为 mcp__<server>__<tool>。', ready: true, connections: [] },
      { key: 'api', title: 'API 连接', icon: '\u{1f9e9}', desc: '以 API Key 接入外部开放接口，凭证落 credentials 服务（模型不可见）。', ready: true, connections: ['runtime-api'] },
      { key: 'enterprise', title: '企业应用', icon: '\u{1f3e2}', desc: '连接企业应用与商业平台（Shopify 商店等）。', ready: true, connections: [] },
      { key: 'knowledge', title: '知识库', icon: '\u{1f4da}', desc: '连接个人/企业知识库，让 AI 帮你记住并找回内容。', ready: true, connections: ['getnote-brain'] },
    ],
    connections: [
      {
        id: 'getnote-brain', board: 'knowledge', kind: 'builtin', title: 'Test knowledge',
        subtitle: 'Local fixture', enabled: false, extras: ['model-invoke'],
        authFields: [{ ref: 'getnote_api_key', secret: true }, { ref: 'getnote_client_id', secret: true }],
        probe: { kind: 'getnote' }, capabilities: ['Recall'], note: 'Fixture note',
        command: { slug: 'custom', allSearch: '/custom search', allSave: '/custom save' },
        oauthCmd: 'fixture auth login', platformUrl: 'https://example.invalid/platform',
        docUrl: 'https://example.invalid/docs', logo: 'fixture-logo',
        tools: GETNOTE_TOOLS, custom: { keep: 7 },
        state: {
          enabled: false, modelInvoke: true, defaultTopicId: 'topic-42', cliAuthed: false,
          credSource: 'form', apiKeyConfigured: true, clientIdConfigured: true,
        },
      },
      {
        id: 'runtime-api', board: 'api', title: 'Runtime API', tools: ['custom_tool'],
        authFields: [
          { ref: 'missing', secret: true }, { ref: 'throwing', secret: true },
          { ref: 'empty', secret: true }, { ref: 'numeric', secret: true }, { ref: 'present', secret: true },
        ],
        custom: { keep: true },
        state: {
          enabled: true, defaultTopicId: null, cliAuthed: false, credSource: 'form',
          missingConfigured: false, throwingConfigured: false, emptyConfigured: false,
          numericConfigured: false, presentConfigured: true,
        },
      },
    ],
    health: { ok: true, issues: [] },
  })
  assert.deepEqual(calls, ['getnote_api_key', 'getnote_client_id', 'missing', 'throwing', 'empty', 'numeric', 'present'])
  assert.doesNotMatch(response.text, /secret-form-api|secret-form-client|secret-runtime-value|secret-credential-error/)
  assert.deepEqual(diskBytes(), before)
})

for (const scenario of [
  { name: 'missing credential service', formApiKey: '', cli: null, apiKeyConfigured: false, clientIdConfigured: false, cliAuthed: false, credSource: 'none' },
  { name: 'partial form credentials', formApiKey: 'secret-partial-api', cli: null, apiKeyConfigured: true, clientIdConfigured: false, cliAuthed: false, credSource: 'none' },
  { name: 'CLI fallback', formApiKey: '', cli: { api_key: ' secret-cli-api ', client_id: ' secret-cli-client ' }, apiKeyConfigured: true, clientIdConfigured: true, cliAuthed: true, credSource: 'cli' },
]) {
  test(`/list preserves configured flags and source with ${scenario.name}`, async (t) => {
    writeConnections([GETNOTE, { id: 'runtime-missing', board: 'api', enabled: false, authFields: [{ ref: 'missing' }, { ref: 'also_missing' }] }])
    if (scenario.cli) writeFileSync(CLI_FILE, JSON.stringify(scenario.cli) + '\n')
    const before = diskBytes()
    const credentials = scenario.formApiKey ? {
      async resolve(ref) { return ref === 'getnote_api_key' ? { value: scenario.formApiKey } : undefined },
    } : undefined
    const { handler } = boot(t, credentials)
    const response = await call(handler)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body.connections.map((connection) => connection.state), [
      {
        enabled: false, modelInvoke: false, defaultTopicId: null,
        cliAuthed: scenario.cliAuthed, credSource: scenario.credSource,
        apiKeyConfigured: scenario.apiKeyConfigured, clientIdConfigured: scenario.clientIdConfigured,
      },
      {
        enabled: false, defaultTopicId: null, cliAuthed: false, credSource: 'none',
        missingConfigured: false, also_missingConfigured: false,
      },
    ])
    assert.deepEqual(response.body.health, { ok: true, issues: [] })
    assert.doesNotMatch(response.text, /secret-partial-api|secret-cli-api|secret-cli-client/)
    assert.deepEqual(diskBytes(), before)
  })
}

test('/list rereads runtime connections and preserves their order without reapplying the plugin', async (t) => {
  writeConnections([{ id: 'first', board: 'api' }])
  const { handler } = boot(t, undefined)
  const beforeFirst = diskBytes()
  const first = await call(handler)
  assert.equal(first.statusCode, 200)
  assert.deepEqual(first.body.boards.map((board) => [board.key, board.connections]), [
    ['mcp', []], ['api', ['first']], ['enterprise', []], ['knowledge', []],
  ])
  assert.deepEqual(diskBytes(), beforeFirst)

  writeConnections([
    { id: 'new-second', board: 'api' }, { id: 'first', board: 'api', enabled: false },
    { id: 'new-mcp', board: 'mcp' }, { id: 'new-enterprise', board: 'enterprise' },
    { id: 'unlisted-board', board: 'other' },
  ])
  const beforeSecond = diskBytes()
  const second = await call(handler)
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.body.connections.map((connection) => connection.id), [
    'new-second', 'first', 'new-mcp', 'new-enterprise', 'unlisted-board',
  ])
  assert.deepEqual(second.body.boards.map((board) => [board.key, board.connections]), [
    ['mcp', ['new-mcp']], ['api', ['new-second', 'first']],
    ['enterprise', ['new-enterprise']], ['knowledge', []],
  ])
  assert.deepEqual(second.body.connections[1].state, {
    enabled: false, defaultTopicId: null, cliAuthed: false, credSource: 'none',
  })
  assert.deepEqual(diskBytes(), beforeSecond)
})

test('/list reports corrupt state, connections and MCP health in order without rewriting evidence', async (t) => {
  writeFileSync(STATE_FILE, '{"enabled":')
  writeFileSync(CONNECTIONS_FILE, '[')
  writeFileSync(MCP_FILE, '{"servers": [')
  const before = diskBytes()
  const { handler } = boot(t, undefined)
  const response = await call(handler)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.ok, true)
  assert.deepEqual(response.body.health, {
    ok: false,
    issues: [
      { ok: false, code: 'state_corrupt', file: '~/.dsh/integrations/getnote/config.json', reason: 'Unexpected end of JSON input', excerpt: '{"enabled":' },
      { ok: false, code: 'connections_corrupt', file: '~/.dsh/integrations/wanzh-hulian/connections.json', reason: 'Unexpected end of JSON input', excerpt: '[' },
      { ok: false, code: 'mcp_corrupt', file: '~/.dsh/integrations/wanzh-hulian/mcp-servers.json', reason: 'Unexpected end of JSON input', excerpt: '{"servers": [' },
    ],
  })
  assert.ok(response.body.connections.length > 0)
  for (const connection of response.body.connections) {
    assert.equal(connection.enabled, false)
    assert.equal(connection.state.enabled, false)
  }
  assert.deepEqual(response.body.connections.find((connection) => connection.id === 'getnote-brain').state, {
    enabled: false, modelInvoke: false, defaultTopicId: null, cliAuthed: false,
    credSource: 'none', apiKeyConfigured: false, clientIdConfigured: false,
  })
  assert.deepEqual(diskBytes(), before)
})

for (const scenario of [
  { name: 'nonloopback socket', request: { remoteAddress: '192.0.2.1' }, status: 401, error: 'unauthorized' },
  { name: 'nonloopback Host', request: { host: 'example.invalid' }, status: 401, error: 'unauthorized' },
  { name: 'wrong method', request: { method: 'POST' }, status: 405, error: 'method not allowed' },
  { name: 'nonloopback before method', request: { method: 'POST', remoteAddress: '192.0.2.1' }, status: 401, error: 'unauthorized' },
]) {
  test(`/list rejects ${scenario.name} before resolving credentials`, async (t) => {
    writeFileSync(STATE_FILE, '{"enabled":')
    const before = diskBytes()
    const calls = []
    const { handler } = boot(t, { async resolve(ref) { calls.push(ref); return undefined } })
    const response = await call(handler, scenario.request)
    assert.equal(response.statusCode, scenario.status)
    assert.deepEqual(response.body, { error: scenario.error })
    assert.deepEqual(calls, [])
    assert.deepEqual(diskBytes(), before)
  })
}
