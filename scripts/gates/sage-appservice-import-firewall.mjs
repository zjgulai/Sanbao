/** Static import firewall for the WT-02D.0.1 Application Service kernel. */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Specifier extraction covers every import form the kernel may legally use:
 * `import ... from "x"` (and re-export `from`), side-effect `import "x"`,
 * dynamic `import("x")`, and `require("x")`. Quotes are normalized (['"]) so a
 * double-quoted specifier cannot bypass the legacy single-quoted patterns.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/gu,
  /(?:^|[;\s])import\s*['"]([^'"]+)['"]/gu,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
]

/** Classify one import specifier; null means allowed. Fail closed on ambiguity. */
function classifyForbiddenSpecifier(spec) {
  if (spec === 'electron') return 'electron'
  if (spec.startsWith('@deepseek-ai/')) return '@deepseek-ai/*（cordis 系运行时）'
  if (spec.includes('packages/') || spec.includes('vendor/') || spec.includes('node_modules/')) return '仓库旁路来源'
  const rel = spec.replace(/^(?:\.\.\/)+/u, '').replace(/^\.\//u, '')
  if (/^(?:renderer|product\/renderer|product\/component-renderer)(?:[/.][^/]*)*$/u.test(rel)) return 'renderer 实现路径'
  return null
}

export function collectSageAppServiceFiles(repoRoot) {
  const dir = join(repoRoot, 'apps/sage-shell/src/appservice')
  const out = []
  const walk = (d) => {
    let entries
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && /\.ts$/u.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

export function checkSageAppServiceImportFirewall({ files }) {
  const violations = []
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, violations: ['apps/sage-shell/src/appservice 无 .ts 文件（空射程判红，P-02）'] }
  }
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    for (const re of SPECIFIER_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const reason = classifyForbiddenSpecifier(m[1])
        if (reason !== null) violations.push(`${relative(process.cwd(), f)}: 命中禁入 import「${m[1]}」（${reason}）`)
      }
    }
  }
  return { ok: violations.length === 0, violations }
}
