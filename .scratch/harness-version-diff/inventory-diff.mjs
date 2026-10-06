// 输出 0.1.5-rc.2 (fb2c4b9e) → 0.2.0-rc.2 (FETCH_HEAD) 的包清单/版本 diff
// 用法: node /.scratch/harness-version-diff/inventory-diff.mjs <harnessRepoDir> <revOld> <revNew> <outDir>
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [repo, revOld, revNew, outDir] = process.argv.slice(2)
if (!repo || !revOld || !revNew || !outDir) {
  console.error('usage: inventory-diff.mjs <repo> <revOld> <revNew> <outDir>')
  process.exit(2)
}

function listPackageFiles(rev) {
  const out = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '--name-only', rev], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\n')
    .filter((p) => p.endsWith('/package.json') || p === 'package.json')
    .filter((p) => !p.includes('node_modules/'))
}

function batchShow(rev, paths) {
  const input = paths.map((p) => `${rev}:${p}`).join('\n') + '\n'
  const out = execFileSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input,
    maxBuffer: 512 * 1024 * 1024,
  })
  // 解析 cat-file --batch 流: header 行 "<sha> blob <size>\n" 后跟内容与换行
  const result = new Map()
  let offset = 0
  let i = 0
  while (i < paths.length && offset < out.length) {
    const nl = out.indexOf(0x0a, offset)
    if (nl === -1) break
    const header = out.slice(offset, nl).toString('utf8')
    const m = /^([0-9a-f]{40}) blob (\d+)$/.exec(header)
    if (!m) {
      // missing
      const idx = header.indexOf(' ')
      offset = nl + 1
      i += 1
      result.set(paths[i - 1], null)
      continue
    }
    const size = Number(m[2])
    const body = out.slice(nl + 1, nl + 1 + size).toString('utf8')
    result.set(paths[i], body)
    offset = nl + 1 + size + 1
    i += 1
  }
  return result
}

function extract(rev) {
  const paths = listPackageFiles(rev)
  const map = batchShow(rev, paths)
  const entries = new Map()
  for (const p of paths) {
    const text = map.get(p)
    if (text == null) continue
    try {
      const j = JSON.parse(text)
      if (typeof j.name !== 'string') continue
      entries.set(p, {
        name: j.name,
        version: typeof j.version === 'string' ? j.version : null,
        private: j.private === true,
        deps: Object.keys({ ...(j.dependencies ?? {}) }).length,
      })
    } catch {
      entries.set(p, { name: '<<unparsed>>', version: null, private: null, deps: 0 })
    }
  }
  return entries
}

const oldE = extract(revOld)
const newE = extract(revNew)

const oldByName = new Map()
for (const [p, e] of oldE) oldByName.set(p, e)
const newByName = new Map()
for (const [p, e] of newE) newByName.set(p, e)

const lines = []
lines.push('# 包清单 diff（路径键）')
lines.push(`old: ${revOld} (${oldE.size} 个 package.json)`)
lines.push(`new: ${revNew} (${newE.size} 个 package.json)`)

const added = []
const removed = []
const versionChanged = []
for (const [p, e] of newE) {
  if (!oldE.has(p)) added.push(p)
  else {
    const o = oldE.get(p)
    if (o.version !== e.version || o.name !== e.name) {
      versionChanged.push(`${p}\t${o.name}@${o.version}\t→\t${e.name}@${e.version}`)
    }
  }
}
for (const p of oldE.keys()) if (!newE.has(p)) removed.push(p)

lines.push('', `## 新增路径 (${added.length})`)
for (const p of added) lines.push(`${p}\t${newE.get(p).name}@${newE.get(p).version}`)
lines.push('', `## 移除路径 (${removed.length})`)
for (const p of removed) lines.push(`${p}\t${oldE.get(p).name}@${oldE.get(p).version}`)
lines.push('', `## 版本/改名变化 (${versionChanged.length})`)
lines.push(...versionChanged)

// 仅 @deepseek-ai 命名空间汇总
const nsOld = new Map()
for (const [, e] of oldE) if (e.name.startsWith('@deepseek-ai/')) nsOld.set(e.name, e.version)
const nsNew = new Map()
for (const [, e] of newE) if (e.name.startsWith('@deepseek-ai/')) nsNew.set(e.name, e.version)
const nsAdded = [...nsNew.keys()].filter((n) => !nsOld.has(n)).sort()
const nsRemoved = [...nsOld.keys()].filter((n) => !nsNew.has(n)).sort()
const nsVer = [...nsNew.entries()]
  .filter(([n, v]) => nsOld.has(n) && nsOld.get(n) !== v)
  .map(([n, v]) => `${n}\t${nsOld.get(n)}\t→\t${v}`)
  .sort()

lines.push('', `## @deepseek-ai/* 全量: old ${nsOld.size} 个 → new ${nsNew.size} 个`)
lines.push('', `### 新增 (${nsAdded.length})`)
lines.push(...nsAdded)
lines.push('', `### 移除 (${nsRemoved.length})`)
lines.push(...nsRemoved)
lines.push('', `### 版本变化 (${nsVer.length})`)
lines.push(...nsVer)
// 版本分布统计
const verDist = new Map()
for (const [, v] of nsNew) verDist.set(v, (verDist.get(v) ?? 0) + 1)
lines.push('', '### new 侧版本分布')
for (const [v, c] of [...verDist.entries()].sort((a, b) => b[1] - a[1])) lines.push(`${v}\t${c}`)

writeFileSync(`${outDir}/inventory-diff.txt`, lines.join('\n'))
console.log(`written: ${outDir}/inventory-diff.txt`)
console.log(lines.slice(0, 8).join('\n'))
console.log(`added=${added.length} removed=${removed.length} verChanged=${versionChanged.length} nsAdded=${nsAdded.length} nsRemoved=${nsRemoved.length} nsVerChanged=${nsVer.length}`)
