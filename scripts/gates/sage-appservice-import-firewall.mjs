/** Static import firewall for the WT-02D.0.1 Application Service kernel. */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const FORBIDDEN = [
  /from\s+'electron'/u,
  /require\(\s*['"]electron['"]\s*\)/u,
  /from\s+'[^']*\.\.\/renderer(?:\/[^']*)?'/u,
  /from\s+'[^']*\.\.\/(?:component-renderer|renderer)[^']*'\.js'/u,
  /from\s+'@deepseek-ai\//u,
  /from\s+'packages\//u,
  /from\s+'[^']*vendor\//u,
  /from\s+'[^']*node_modules\//u,
]

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
    for (const re of FORBIDDEN) {
      const m = text.match(re)
      if (m) violations.push(`${relative(process.cwd(), f)}: 命中禁入 import「${m[0]}」`)
    }
  }
  return { ok: violations.length === 0, violations }
}
