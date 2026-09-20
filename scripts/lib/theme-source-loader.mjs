import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Compile a trusted, local pure-module graph in memory; never execute package build/config hooks. */
export async function loadPureModules(entries, compilerPackage) {
  const requireCompiler = createRequire(compilerPackage)
  const requireTsdown = createRequire(requireCompiler.resolve('tsdown'))
  const { rolldown } = await import(pathToFileURL(requireTsdown.resolve('rolldown')).href)
  const entry = '\0acceptance-pure-modules'
  const bundle = await rolldown({
    input: entry,
    platform: 'neutral',
    treeshake: false,
    resolve: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
    onwarn(warning) { throw new Error(warning.message) },
    plugins: [{
      name: 'acceptance-local-graph',
      resolveId(source) {
        if (source === entry) return entry
        if (!source.startsWith('.') && !isAbsolute(source)) {
          throw new Error(`Pure-module graph requires a non-local runtime import: ${source}`)
        }
      },
      load(id) {
        if (id === entry) return Object.entries(entries).map(([name, file]) => {
          assert.match(name, /^[A-Za-z_$][\w$]*$/)
          assert.ok(isAbsolute(file), `Expected absolute source path: ${file}`)
          return `export * as ${name} from ${JSON.stringify(file)};`
        }).join('\n')
      },
    }],
  })
  try {
    const { output } = await bundle.generate({ format: 'cjs', codeSplitting: false })
    assert.equal(output.length, 1, 'Pure-module graph must produce one in-memory chunk')
    const chunk = output[0]
    assert.equal(chunk.type, 'chunk')
    assert.equal(chunk.imports.length, 0, 'Pure-module graph must not leave external imports')
    const module = { exports: {} }
    new Function('module', 'exports', 'require', chunk.code)(module, module.exports, (specifier) => {
      throw new Error(`Unbundled runtime import: ${specifier}`)
    })
    return { ...module.exports, sourceFiles: Object.keys(chunk.modules).filter(isAbsolute) }
  } finally {
    await bundle.close()
  }
}

/** Load settings, the real alias/typography generator and both shared-token source faces. */
export async function loadThemeSources(repoRoot) {
  const pkg = join(repoRoot, 'packages/platform/dsh-theme-local')
  const source = await loadPureModules({
    settings: join(pkg, 'src/theme-settings.ts'),
    tokens: join(pkg, 'src/client/theme-tokens.ts'),
    localShared: join(pkg, 'src/client/sanbao-tokens.ts'),
    shared: join(repoRoot, 'shared/client/sanbao-tokens.ts'),
  }, join(pkg, 'package.json'))
  assert.deepEqual([...source.settings.THEME_IDS].sort(), ['dark', 'light', 'warm-pink'], 'Theme identity scope changed')
  assert.deepEqual(source.settings.THEME_IDS, source.shared.THEME_IDS, 'Settings/shared identities diverged')
  assert.equal(source.localShared.SANBAO_TOKEN_CSS, source.shared.SANBAO_TOKEN_CSS, 'Shared token CSS copy drifted')
  assert.ok(source.shared.SANBAO_TOKEN_CSS.includes('data-sanbao-theme'), 'Shared CSS has no identity selectors')
  const identities = source.settings.THEME_IDS.map((id) => {
    const settings = { ...source.settings.DEFAULT_THEME_STUDIO_SETTINGS, themeId: id }
    const scheme = source.settings.themeColorScheme(id)
    assert.ok(scheme === 'light' || scheme === 'dark', `Invalid scheme for ${id}`)
    const overrides = source.tokens.buildThemeTokenOverrides(settings)
    assert.ok(Object.keys(overrides).length > 0, `Empty overrides for ${id}`)
    for (const [token, pair] of Object.entries(overrides)) {
      for (const mode of ['light', 'dark']) {
        assert.ok(typeof pair?.[mode] === 'string' && pair[mode].trim(), `Missing ${id}/${mode}/${token}`)
      }
    }
    return { id, scheme, overrides }
  })
  return { ...source, identities }
}
