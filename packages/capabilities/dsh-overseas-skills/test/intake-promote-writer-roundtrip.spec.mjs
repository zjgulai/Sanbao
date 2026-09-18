import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { mutationRoot } from '../../../../scripts/lib/mutation-fixture.mjs'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'

/**
 * `promote-intake-batch.mjs` 的**写盘前自检**必须能跑得起来（P-03 的回归钉）。
 *
 * ## 为什么要有这一项
 *
 * 这个工具在写盘前要求「零改动往返必须逐字节相同」，防的是「一次加四十条，顺手把几百行
 * 格式改了」——那种 diff 里真实改动会被噪音埋掉。判据本身是对的。
 *
 * 但它当时**对任何输入都失败**：`WRITERS` 里 `manifest/fullstack-skills.json` 与
 * `manifest/taxonomy-v3.json` 的 writer 少写一个尾随换行，而这两份文件都是
 * `JSON.stringify(o, null, 2) + "\n"` 的形态。于是自检挡住的是它自己，工具自那两份文件
 * 成形起就没成功跑过一次——**因为没有调用方，没人发现**。
 *
 * 这类缺陷的形状值得单独钉住：**一个没有调用方的工具，它的自检坏了也不会有人知道**；
 * 而它下一次被用到时，表现为「这条流程走不通」，维修的人会先怀疑是数据脏了。
 *
 * ## 用例怎么构造
 *
 * 把工具与四份落点**逐字节拷进临时树**（用的是仓库里的真文件，不是这里另写一份夹具——
 * 另写一份就等于给「文件的排版形态」造第二个家）。然后：
 *
 * - A：拿一份合成的新片段跑 `--dry` → 必须 `exit 0`，即自检通过；
 * - B（M1 突变）：把 `fullstack-skills.json` 的尾随换行去掉 → 自检必须**判红**（`exit 2`）。
 *   这一条证明 A 不是恒真：判据真的在读字节；
 * - C：真跑一次（不带 `--dry`），加一条 `catalog: "generic"` 的条目 → 三个与它无关的落点
 *   必须**逐字节不变**（writer 的轮转被真的执行了一遍，不只是被比对了一遍）。
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const PKG = join(HERE, '..')
const TOOL = join(PKG, 'scripts', 'promote-intake-batch.mjs')

/** 四份落点（相对包根）。前三个与 `catalog: "generic"` 的条目无关，必须零改动。 */
const LOCALIZE = join('staging', 'intake-localize.json')
const MAPPING = join('scripts', 'fullstack-mapping.json')
const SKILLS_FS = join('manifest', 'fullstack-skills.json')
const TAXONOMY = join('manifest', 'taxonomy-v3.json')
const UNTOUCHED = [MAPPING, SKILLS_FS, TAXONOMY]

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

/** 合成片段：名字取得足够怪，保证在任何一份真落点里都不会撞车。 */
function fragment(name = 'zz-promote-writer-roundtrip') {
  return JSON.stringify([{
    src: name,
    name,
    source: 'selftest',
    title: '自测夹具',
    summaryZh: '写盘前自检的回归夹具，只出现在临时树里。',
    triggers: ['自测'],
    catalog: 'generic',
    license: 'MIT',
  }], null, 2)
}

/**
 * 把工具与四份真落点拷进临时树；`mangle` 用于 M1 突变。
 *
 * @param {{ stripTrailingNewlineOf?: string | null }} [opts] `null`（默认）表示不做这处突变
 */
function makeTree({ stripTrailingNewlineOf = null } = {}) {
  const root = mutationRoot('promote-')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'manifest'), { recursive: true })
  mkdirSync(join(root, 'staging'), { recursive: true })
  copyFileSync(TOOL, join(root, 'scripts', 'promote-intake-batch.mjs'))
  for (const rel of [LOCALIZE, MAPPING, SKILLS_FS, TAXONOMY]) {
    copyFileSync(join(PKG, rel), join(root, rel))
  }
  if (stripTrailingNewlineOf) {
    const p = join(root, stripTrailingNewlineOf)
    writeFileSync(p, readFileSync(p, 'utf8').replace(/\n$/, ''), 'utf8')
  }
  return root
}

function run(root, { dry = true } = {}) {
  const frag = join(root, 'fragment.json')
  writeFileSync(frag, fragment(), 'utf8')
  const args = [join(root, 'scripts', 'promote-intake-batch.mjs'), '--fragments', frag]
  if (dry) args.push('--dry')
  const { command, env } = nodeCommand()
  return spawnSync(command, args, { encoding: 'utf8', env })
}

/** 前提：仓库里这四份落点都得在，否则本项没有射程（不入库的东西不该拖红别人）。 */
const fixturesPresent = [LOCALIZE, MAPPING, SKILLS_FS, TAXONOMY].every((rel) => {
  try { readFileSync(join(PKG, rel)); return true } catch { return false }
})

test('PW1 写盘前自检能通过：拿真落点跑 --dry 必须 exit 0', { skip: fixturesPresent ? false : '四份落点不在本机（staging/ 不入库）' }, () => {
  const r = run(makeTree())
  assert.equal(r.status, 0, `自检必须能跑起来；实际 exit=${r.status}\n${r.stdout}\n${r.stderr}`)
  assert.doesNotMatch(r.stdout + r.stderr, /排版自检失败/, '自检不通过时它挡住的是它自己——先修 writer')
  assert.match(r.stdout, /未写盘/, '--dry 必须说清它没写盘')
})

test('PW2 M1 突变：落点少一个尾随换行时，自检必须判红而不是照写', { skip: fixturesPresent ? false : '四份落点不在本机' }, () => {
  const r = run(makeTree({ stripTrailingNewlineOf: SKILLS_FS }))
  assert.equal(r.status, 2, '自检必须能说「不」；恒过的自检等于没有自检')
  // 判据打在 stdout（`say()` 就是 console.log）——两个流都看，免得把「没打印」当成「没判红」。
  assert.match(r.stdout + r.stderr, /排版自检失败/, '必须点名是排版自检，而不是别的原因')
  assert.match(r.stdout + r.stderr, /fullstack-skills/, '必须点名是哪一份落点的 writer 复现不了原文')
})

test('PW3 真跑一次：与片段无关的三个落点必须逐字节不变', { skip: fixturesPresent ? false : '四份落点不在本机' }, () => {
  const root = makeTree()
  const before = Object.fromEntries(UNTOUCHED.map((rel) => [rel, sha(join(root, rel))]))
  const localizeBefore = JSON.parse(readFileSync(join(root, LOCALIZE), 'utf8')).skills.length
  const r = run(root, { dry: false })
  assert.equal(r.status, 0, `写盘失败的原文：\n${r.stdout}\n${r.stderr}`)
  for (const rel of UNTOUCHED) {
    assert.equal(sha(join(root, rel)), before[rel], `${rel} 被重写成了别的字节——writer 与文件形态不符（格式噪音正是这条自检要挡的）`)
  }
  const after = JSON.parse(readFileSync(join(root, LOCALIZE), 'utf8')).skills
  assert.equal(after.length, localizeBefore + 1, '条目必须真的进了派生源，否则本用例在为一次空转背书')
  assert.ok(after.some((s) => s.name === 'zz-promote-writer-roundtrip'), '新条目必须按 name 落进 localize')
  assert.ok(readdirSync(join(root, 'staging')).includes('intake-localize.json'))
})
