/**
 * 对象库卫生校验项（SEC-RT-011 / ADR-0121）。
 *
 * ## 为什么需要它
 *
 * 2026-09-18 实测：`.git` 3.9 GB 里有一个 **2.57 GiB 的 pack，内仅 1 个对象**——
 * `packaging/backup/pre-2.0.10-migration/dsh-home-snapshot.tar`，未压缩
 * **6,800,745,472 字节**的 `~/.dsh` 全量快照。逐位比对确认它包含
 * `.dsh/.credentials.yaml`、`.dsh/.credentials.yaml.bak-*`、`.dsh/ext-bridge-token`，
 * 且 **与磁盘上当时正在用的那份逐字节相同**（sha256 `77d27c62…`）——
 * 也就是**活凭证**躺在对象库里，违反 `~/.dsh/AGENTS.md` 的第一条红线。
 *
 * 它只从 4 条 `refs/codex/turn-diffs/checkpoints/**` 可达。那 4 条 ref 指向的是
 * **裸 tree 而不是 commit**（codex 对 git index 做 `git write-tree` 的快照），
 * 所以 `git log --find-object` 什么都找不到，`git status` 也不会提示任何异常。
 *
 * 这条缺陷的形态是本仓库最熟悉的那一类：**知道没有变成拦住**。
 * `.gitignore` 没有覆盖 `packaging/backup/`，没有任何判据看对象的**体积**与
 * **垃圾包**——于是一次 `git add` 就把 6.8 GB 的凭据快照永久写进了对象库，
 * 而全部门禁保持绿色。
 *
 * ## 判据
 *
 * 1. **扫描面必须非空**。枚举不到任何对象就判红：「一个都没扫」与「都扫过且干净」
 *    必须分开（P-15），否则本项是一条永远不会说「不」的判据（P-02）。
 * 2. **单对象体积上限**（默认 50 MiB）。超限即判红，并把 sha / 体积 /
 *    **是否被任何 ref 可达**一起打出来——可达性决定处置方式（可达的要先改引用，
 *    不可达的直接 `git gc` 就能回收）。
 *    阈值取 50 MiB 的理由：仓库里合法的最大资产是
 *    `packaging/vendor/python-standalone/cpython-3.14.7+…tar.gz`（26.6 MB，被 main
 *    与全部 tag 可达，`reloc-aeis.sh` 按名引用），它必须放行；
 *    而 6.8 GB 的 tar 与 183 MB 的 Mach-O 必须拦下。
 * 3. **对象库总量上限**（默认 1 GiB，= loose `size` + `size-pack` + 垃圾体积）。
 *    单对象阈值可以被「拆成很多块」绕过，总量阈值是第二张网。
 * 4. **垃圾包必须为 0**（`git count-objects -v` 的 `garbage`）。`tmp_pack_*` 是中途
 *    被打断的 repack 残骸，对它做 `git gc` 会**因为 2 周的 pruneExpire 而删不掉**——
 *    2026-09-18 实测两个共 716.6 MiB 的 `tmp_pack_*` 在仓库里躺了一天。
 *    垃圾不判红就会被当成「对象库本来就大」。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **对象的内容**。本项只看类型与体积，不打开任何对象、不判断里面有没有凭据。
 *    理由是读内容要有「什么算凭据」的判据，而那个判据本身就是一份会腐烂的清单；
 *    体积是一个**不需要词汇表**的代理量——6.8 GB 的凭据快照与 6.8 GB 的正当资产
 *    在本项里同罪，这不完美，但它是机器能稳定判的那一半。
 * 2. **历史里的对象**。`git cat-file --batch-all-objects` 枚举的是**当前对象库**，
 *    已经被 gc 掉的历史不在射程内。要查「曾经进过什么」得重写历史，那是另一件事。
 * 3. **远端**。本机对象库干净不等于远端干净；本项不联网。
 * 4. **`.gitignore` 的白名单条目**。那是 `gitignore-whitelist` 的射程，本项不重复。
 */
import { execFileSync } from 'node:child_process'

/** 判据阈值。改这里必须同时给出「为什么那个合法资产仍然放行」的读数。 */
export const DEFAULT_LIMITS = {
  /** 单个对象未压缩体积上限（字节）。 */
  maxObjectBytes: 50 * 1024 * 1024,
  /** 对象库总量上限（字节）：loose + pack + 垃圾。 */
  maxTotalBytes: 1024 * 1024 * 1024,
}

const MIB = 1024 * 1024

/**
 * 把 `git count-objects -v` 的输出解析成对象。
 *
 * **单位**：`size` / `size-pack` / `size-garbage` 在 `-v` 下是 **KiB**，不是字节；
 * 本函数统一换算成**字节**再返回。2026-09-18 本项首版把这三个值当字节用，读数印成
 * 「总量 165.6 KiB」（真值 168.5 MiB），并让总量上限在事实上放大 1024 倍——
 * 也就是单对象阈值之外的那张网形同不存在。带单位的写法（`-vH`）不在这里读。
 *
 * 认不出的行直接丢弃——本项不靠它做唯一判据，单对象阈值还守着一层。
 *
 * @param {string} text `git count-objects -v` 的 stdout
 * @returns {{count: number, size: number, inPack: number, packs: number, sizePack: number, garbage: number, sizeGarbage: number}} 体积字段单位为字节
 */
export function parseCountObjects(text) {
  const out = {
    count: 0,
    size: 0,
    inPack: 0,
    packs: 0,
    sizePack: 0,
    garbage: 0,
    sizeGarbage: 0,
  }
  /** 字段名 → 目标键 + 到字节的倍数。 */
  const FIELDS = {
    count: { key: 'count', scale: 1 },
    size: { key: 'size', scale: 1024 },
    'in-pack': { key: 'inPack', scale: 1 },
    packs: { key: 'packs', scale: 1 },
    'size-pack': { key: 'sizePack', scale: 1024 },
    garbage: { key: 'garbage', scale: 1 },
    'size-garbage': { key: 'sizeGarbage', scale: 1024 },
  }
  for (const line of String(text ?? '').split('\n')) {
    const m = /^([a-z-]+):\s*(\S+)/.exec(line.trim())
    if (!m) continue
    const field = FIELDS[m[1]]
    if (field === undefined) continue
    const raw = m[2].replace(/[^0-9.]/g, '')
    // 带单位的值（MiB/GiB）按 0 处理：把「2.63 GiB」读成 2 字节比读不出来更坏。
    out[field.key] = /^[0-9]+$/.test(raw) ? Number(raw) * field.scale : 0
  }
  return out
}

/**
 * 解析 `git cat-file --batch-all-objects --batch-check` 的输出。
 *
 * @param {string} text stdout，每行 `<type> <size> <sha>`
 * @returns {Array<{type: string, size: number, sha: string}>}
 */
export function parseAllObjects(text) {
  const out = []
  for (const line of String(text ?? '').split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length !== 3) continue
    const size = Number(parts[1])
    if (!Number.isFinite(size)) continue
    out.push({ type: parts[0], size, sha: parts[2] })
  }
  return out
}

/** 人类可读的体积。 */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return String(n)
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`
  if (n >= MIB) return `${(n / MIB).toFixed(2)} MiB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${n} B`
}

/**
 * 采集一次对象库读数。任何一步失败都**显式降级为 null / 空**，
 * 由 `checkObjectStoreHygiene` 判红——不把「取不到」静默当成「干净」。
 *
 * @param {{repoRoot: string}} options
 * @returns {{counted: object|null, objects: Array<object>, reachable: Set<string>|null, errors: string[]}}
 */
export function scanObjectStore({ repoRoot }) {
  const errors = []
  const git = (args) =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * MIB,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  let counted = null
  try {
    counted = parseCountObjects(git(['count-objects', '-v']))
  } catch (error) {
    errors.push(`git count-objects -v 取不到：${error.message}`)
  }

  let objects = []
  try {
    objects = parseAllObjects(
      git(['cat-file', '--batch-all-objects', '--batch-check=%(objecttype) %(objectsize) %(objectname)']),
    )
  } catch (error) {
    errors.push(`git cat-file --batch-all-objects 取不到：${error.message}`)
  }

  let reachable = null
  try {
    reachable = new Set(
      git(['rev-list', '--objects', '--all'])
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.slice(0, 40)),
    )
  } catch (error) {
    // 可达性是**辅助读数**，判不了不阻塞；但必须在读数里说出来，不能假装测过。
    errors.push(`git rev-list --objects --all 取不到：${error.message}`)
  }

  return { counted, objects, reachable, errors }
}

/**
 * 跑一次对象库卫生校验。纯函数：所有输入由调用方给出，便于反向自测。
 *
 * @param {{
 *   counted: object|null,
 *   objects: Array<{type: string, size: number, sha: string}>,
 *   reachable?: Set<string>|null,
 *   limits?: {maxObjectBytes?: number, maxTotalBytes?: number},
 *   errors?: string[],
 * }} input
 * @returns {{passed: boolean, violations: string[], note: string, scanned: number, offenders: Array<object>}}
 */
export function checkObjectStoreHygiene({ counted, objects, reachable = null, limits = {}, errors = [] }) {
  const maxObjectBytes = limits.maxObjectBytes ?? DEFAULT_LIMITS.maxObjectBytes
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_LIMITS.maxTotalBytes
  const violations = [...errors]
  const list = Array.isArray(objects) ? objects : []

  if (list.length === 0) {
    violations.push(
      '扫描面为空：对象库里一个对象都没枚举到——「一个都没扫」与「都扫过且干净」必须分开（P-15）',
    )
    return {
      passed: false,
      violations,
      note: '扫描 0 个对象（取不到射程，本项本次未核对任何东西）',
      scanned: 0,
      offenders: [],
    }
  }

  const offenders = list
    .filter((o) => o.size > maxObjectBytes)
    .sort((a, b) => b.size - a.size)

  const reachTag = (sha) => {
    if (reachable === null) return '可达性未测'
    return reachable.has(sha) ? '被 ref 可达' : '不可达（gc 可回收）'
  }

  for (const o of offenders) {
    violations.push(
      `对象库里有超过 ${formatBytes(maxObjectBytes)} 的对象：${o.type} ${o.sha}`
        + ` = ${formatBytes(o.size)}（${reachTag(o.sha)}）`
        + '——大二进制不该进对象库；若它含凭据，先确认盘外有无逐位相同的副本再处置'
        + '（SEC-RT-011 / ADR-0121）',
    )
  }

  if (counted !== null) {
    const total = (counted.size ?? 0) + (counted.sizePack ?? 0) + (counted.sizeGarbage ?? 0)
    if (total > maxTotalBytes) {
      violations.push(
        `对象库总量 ${formatBytes(total)} 超过上限 ${formatBytes(maxTotalBytes)}`
          + `（loose ${formatBytes(counted.size ?? 0)} + pack ${formatBytes(counted.sizePack ?? 0)}`
          + ` + 垃圾 ${formatBytes(counted.sizeGarbage ?? 0)}）——单对象阈值可以被拆块绕过，这条是第二张网`,
      )
    }
    if ((counted.garbage ?? 0) > 0) {
      violations.push(
        `对象库有 ${counted.garbage} 个垃圾包（${formatBytes(counted.sizeGarbage ?? 0)}）：`
          + '`tmp_pack_*` 是中途被打断的 repack 残骸，`git gc` 因 2 周的 pruneExpire 删不掉它，'
          + '必须显式删除（2026-09-18 实测两个共 716.6 MiB 躺了一天）',
      )
    }
  } else {
    violations.push('git count-objects -v 取不到——总量与垃圾两项本次未核对（不是「都干净」）')
  }

  const note =
    `扫描 ${list.length} 个对象；单对象上限 ${formatBytes(maxObjectBytes)}，超限 ${offenders.length} 个`
    + (counted === null
      ? '；总量/垃圾未测'
      : `；总量 ${formatBytes((counted.size ?? 0) + (counted.sizePack ?? 0) + (counted.sizeGarbage ?? 0))}`
        + `，垃圾包 ${counted.garbage ?? 0} 个`)
    + (reachable === null ? '；可达性未测' : `；ref 可达对象 ${reachable.size} 个`)

  return { passed: violations.length === 0, violations, note, scanned: list.length, offenders }
}
