/**
 * jev-egress-boundary：D2 出网边界的**机制面**门禁（ADR-0138）。
 *
 * ## 为什么需要它
 *
 * D2 把 Jev 的出网上限钉成「仓库内被 git 跟踪的文本」，但 ADR-0138 后果 1 当时登记的是
 * 「仍是纪律，没有门禁——要真守住需要一条判据扫『来源是否落在 git 跟踪集内』，而来源是
 * 运行期数据流，静态扫不出来」。2026-09-20 复核：这句话只对了一半。闸门
 * （`scripts/jev/egress-boundary.mjs`）已经接进两个装载函数，**但守住闸门本身**的那件
 * 仪器仍然不存在——谁把守卫从装载器里摘掉、或让发网模块自己读文件绕过守卫，
 * 不会有任何读数变红（P-04「写了但从没跑到」同族）。
 *
 * ## 本判据怎么判
 *
 * 纯离线探针集，全部打在**真实装载函数**上（不是桩）：在临时 git 仓库里造出
 * 「被跟踪 / 未跟踪 / 仓外」三类来源，逐个问装载器收不收——
 *
 * 1. 默认语料路径必须落在跟踪集内（T3 拍板的仓内 corpus，不是「碰巧能读」）
 * 2. 未跟踪 corpus 必须被 `loadCorpus` 拒载，且判词点名 D2
 * 3. 仓外 corpus 必须被 `loadCorpus` 拒载（attrib 转录那类来源的直系判例）
 * 4. 未跟踪样本集必须被 `loadSamples` 拒载（样本的 `state` 是第二个出网口）
 * 5. 被跟踪的 corpus 与样本集必须照常装载（**闸门不许误杀**——误杀会把整改逼成摘闸门）
 * 6. 发网模块 `client.mjs` 不得导入 `node:fs` / `node:child_process`（传输层只能收文本）
 *
 * 空探针表判红（P-02：空射程不是合格）。第三方 API 不在射程内（ADR-0138 D8）。
 *
 * ## 契约
 *
 * `checkJevEgressBoundary()` 返回 `{passed, status, violations, note, facts}` 兼容面；
 * `toCanonicalJevEgressResult` 映射成总 gate 的 canonical 读数（每个探针 = 一个对象，
 * 违约 = failed）。CLI 退出码：0 通过 / 1 违约。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_CORPUS_PATH, loadCorpus } from '../jev/corpus-review.mjs'
import { loadSamples } from '../jev/scorecard.mjs'
import { assertEgressSourceTracked } from '../jev/egress-boundary.mjs'

const JEV_DIR = dirname(fileURLToPath(import.meta.url))
/** 唯一发网的模块；结构探针读它的源码判「有没有文件读取面」。 */
export const CLIENT_SOURCE_PATH = join(JEV_DIR, '..', 'jev', 'client.mjs')

const CORPUS_TAIL = 'packages/capabilities/dsh-overseas-skills/manifest/skill-evidence-corpus.json'

/**
 * 临时夹具：三类来源各一份，全部落在 os.tmpdir() 下，调用方负责 `cleanup()`。
 * 被跟踪的那份要 `git add` 才算「跟踪集内」——闸门判的正是索引/HEAD 这一层。
 */
export function makeEgressFixture() {
  const root = mkdtempSync(join(tmpdir(), 'jev-egress-gate-'))
  const corpusText = JSON.stringify({
    _meta: { what: 'gate fixture' },
    skills: { a: { description: '甲' }, b: { description: '乙' } },
  })
  const samplesText = JSON.stringify({
    samples: [{ id: 'R-1', kind: 'recall', criterion: 'q2-stop-obligation', expectFire: true, source: 'gate fixture', state: 'x' }],
  })

  const trackedDir = join(root, 'tracked')
  mkdirSync(trackedDir)
  execFileSync('git', ['init', '-q', trackedDir])
  writeFileSync(join(trackedDir, 'corpus.json'), corpusText)
  writeFileSync(join(trackedDir, 'samples.json'), samplesText)
  execFileSync('git', ['-C', trackedDir, 'add', '--', 'corpus.json', 'samples.json'])

  const untrackedDir = join(root, 'untracked')
  mkdirSync(untrackedDir)
  execFileSync('git', ['init', '-q', untrackedDir])
  writeFileSync(join(untrackedDir, 'corpus.json'), corpusText)
  writeFileSync(join(untrackedDir, 'samples.json'), samplesText)

  const outsideDir = join(root, 'outside')
  mkdirSync(outsideDir)
  writeFileSync(join(outsideDir, 'corpus.json'), corpusText)

  return {
    root,
    tracked: { corpus: join(trackedDir, 'corpus.json'), samples: join(trackedDir, 'samples.json') },
    untracked: { corpus: join(untrackedDir, 'corpus.json'), samples: join(untrackedDir, 'samples.json') },
    outside: { corpus: join(outsideDir, 'corpus.json') },
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

/**
 * 一组探针：`run()` 返回 null（合格）或一句违约。
 * 依赖全部可注入，自测才杀得动「恒真闸门」「过严闸门」「拒绝但不点名 D2」三种突变。
 * @param {{loadCorpus: Function, loadSamples: Function, assertTracked: Function, clientSourcePath: string, fixture: object}} deps
 */
export function buildEgressProbes({ loadCorpus: loadCorpusImpl, loadSamples: loadSamplesImpl, assertTracked, clientSourcePath, fixture }) {
  const mustRejectWithD2 = (label, thunk) => {
    try {
      thunk()
    } catch (error) {
      const message = String(error?.message ?? error)
      return /ADR-0138 D2/.test(message) ? null : `${label}拒了，但判词没点名 D2：${message}`
    }
    return `${label}被放行——未跟踪/仓外来源不得进入 outbound state`
  }

  return [
    {
      name: '默认语料路径必须落在跟踪集内',
      run() {
        const { relPath } = assertTracked(DEFAULT_CORPUS_PATH)
        return relPath.endsWith(CORPUS_TAIL) ? null : `默认语料解析成 ${relPath}，不是仓内 corpus`
      },
    },
    {
      name: '未跟踪 corpus 必须被 loadCorpus 拒载',
      run: () => mustRejectWithD2('loadCorpus(未跟踪 corpus)', () => loadCorpusImpl(fixture.untracked.corpus)),
    },
    {
      name: '仓外 corpus 必须被 loadCorpus 拒载',
      run: () => mustRejectWithD2('loadCorpus(仓外 corpus)', () => loadCorpusImpl(fixture.outside.corpus)),
    },
    {
      name: '未跟踪样本集必须被 loadSamples 拒载',
      run: () => mustRejectWithD2('loadSamples(未跟踪样本集)', () => loadSamplesImpl(fixture.untracked.samples)),
    },
    {
      name: '被跟踪的 corpus 与样本集必须照常装载（闸门不许误杀）',
      run() {
        const corpus = loadCorpusImpl(fixture.tracked.corpus)
        const samples = loadSamplesImpl(fixture.tracked.samples)
        if (corpus.names.length !== 2) return `跟踪夹具 corpus 读成 ${corpus.names.length} 条（应为 2）`
        if (samples.length !== 1) return `跟踪夹具样本集读成 ${samples.length} 条（应为 1）`
        return null
      },
    },
    {
      name: '发网模块不得自己读文件（传输层只能收文本）',
      run() {
        const source = readFileSync(clientSourcePath, 'utf8')
        if (/from 'node:fs'|from 'node:child_process'|readFileSync/.test(source)) {
          return 'client.mjs 出现文件读取面——出网文本只能由装载器喂进来，发网模块不许自己取'
        }
        return null
      },
    },
  ]
}

/** 纯判据：逐个跑探针收违约；空射程判红（P-02）。 */
export function judgeJevEgressBoundary({ probes }) {
  if (!Array.isArray(probes) || probes.length === 0) {
    return { violations: ['没有任何探针——空射程不是合格（P-02）'], checked: 0 }
  }
  const violations = []
  for (const probe of probes) {
    let verdict
    try {
      verdict = probe.run()
    } catch (error) {
      verdict = `探针抛错：${error?.message ?? error}`
    }
    if (typeof verdict === 'string' && verdict !== '') violations.push(`${probe.name}：${verdict}`)
  }
  return { violations, checked: probes.length }
}

/**
 * 实况判据：真实装载函数 + 真实夹具。
 * @returns {{passed: boolean, status: 'pass'|'fail', violations: string[], note: string, facts: object}}
 */
export function checkJevEgressBoundary() {
  const fixture = makeEgressFixture()
  try {
    const judged = judgeJevEgressBoundary({
      probes: buildEgressProbes({
        loadCorpus,
        loadSamples,
        assertTracked: assertEgressSourceTracked,
        clientSourcePath: CLIENT_SOURCE_PATH,
        fixture,
      }),
    })
    const passed = judged.violations.length === 0
    return {
      passed,
      status: passed ? 'pass' : 'fail',
      violations: judged.violations,
      note: passed
        ? `${judged.checked} 项探针全过：未跟踪/仓外来源被两个装载器拒载、跟踪来源照常装载、默认语料在跟踪集内、发网模块无文件读取面（ADR-0138 D2）`
        : `出网边界 ${judged.violations.length}/${judged.checked} 项违约——D2 已被破，先修装载器或发网模块`,
      facts: { probes: judged.checked, failed: judged.violations.length },
    }
  } finally {
    fixture.cleanup()
  }
}

/** 映射为 QG-001 canonical schema（每个探针 = 一个对象）。 */
export function toCanonicalJevEgressResult(result) {
  const failed = result.status === 'fail'
  const objects = result.facts?.probes ?? 0
  const failedObjects = result.facts?.failed ?? (failed ? 1 : 0)
  return {
    status: failed ? 'fail' : 'pass',
    expected: objects || 1,
    discovered: objects,
    checked: Math.max(0, objects - failedObjects),
    skipped: 0,
    failed: failed ? failedObjects || 1 : 0,
    typedSkips: [],
    reason: failed ? `出网边界违约：${result.violations.length} 项` : '出网边界探针全过（ADR-0138 D2）',
    ...(typeof result.note === 'string' ? { note: result.note } : {}),
    violations: result.violations,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = checkJevEgressBoundary()
  for (const violation of result.violations) console.log(`✗ ${violation}`)
  console.log(result.note ?? '')
  if (result.passed) console.log('✓ jev-egress-boundary 通过')
  process.exit(result.passed ? 0 : 1)
}
