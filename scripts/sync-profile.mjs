#!/usr/bin/env node
/**
 * 同步 profile 副本与仓库源（架构红线 4：一律 tmp+mv 原子替换）。
 *
 * 用法：
 *   node scripts/sync-profile.mjs --check                 # 只报告漂移，不写盘（默认）
 *   node scripts/sync-profile.mjs --apply                 # 同步全部内容不同的文件
 *   node scripts/sync-profile.mjs --apply --only-metadata # 只同步 package.json（构建产物由各自构建脚本产出）
 *   node scripts/sync-profile.mjs --check  --loadpoint    # 只查**装载点**的运行时产物
 *   node scripts/sync-profile.mjs --apply  --loadpoint    # 把装载点的运行时产物补齐——让改动真正生效的那一步
 *   node scripts/sync-profile.mjs --check --profile <目录> # 指定其他 profile
 *
 * 两个目标目录**不是一回事**，混用会得到「同步过了但功能还是旧的」：
 *   - `--loadpoint`：`<profile>/node_modules/<dep>`，DSH 的**真实装载点**（profile 的
 *     package.json 就是包解析锚点，见 lib/profile-*.js 的 resolveOverlayPackage）。
 *     应用执行的正是这里的字节。
 *   - 默认（`<profile>/vendor/`）：内嵌 profile 拷贝物化出来的另一份副本，**不是装载点**。
 *     它只在元数据意义上被门禁看着，别拿它当「改动已生效」的证据。
 *
 * 语义：只替换副本中已存在的文件；副本独有文件（构建产物、备份）一律不追加、不删除。
 * 退出码：0 = 已一致或同步成功；1 = 存在漂移（--check 模式）；2 = 用法错误。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySync, cleanTemps, loadPointFiles, planSync } from './gates/sync-profile.mjs'
import { discoverPackages } from './gates/package-layout.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 仓库内受管插件目录相对路径。归组后包位于 packages/<组>/<包>，
 * 一律通过 discoverPackages 定位，杜绝位置硬编码（曾因硬编码扫不到任何包而谎报一致）。
 * @returns {Array<{relPath: string, dirName: string}>} 仓库根相对路径
 */
function managedPackages() {
  return discoverPackages(repoRoot).map((entry) => ({ relPath: entry.relPath, dirName: entry.dirName }))
}

/** 递归收集相对文件路径，跳过 node_modules 与构建产物目录。 */
function listFiles(root, rel = '', out = []) {
  const dir = join(root, rel)
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) listFiles(root, child, out)
    else out.push(child)
  }
  return out
}

/** 读取 profile 的已安装依赖表；不可读时按空表处理（视为未安装）。 */
function installedDependencies(profile) {
  const manifest = join(profile, 'package.json')
  if (!existsSync(manifest)) return {}
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).dependencies ?? {}
  } catch {
    return {}
  }
}

/**
 * 构造**默认（vendor/）**目标清单：条目与仓库逐文件对应，副本独有文件不追加。
 * @param {string} vendorDir profile 的 vendor 目录
 * @returns {Array<{name: string, sourceDir: string, targetDir: string, files: string[]}>}
 */
function vendorPairs(vendorDir) {
  const pairs = []
  for (const { relPath, dirName } of managedPackages()) {
    // 路径必须是**归组后**的 relPath（`packages/<组>/<包>`），与 vendor 的实际布局
    // `vendor/packages/<组>/<包>` 对齐。曾经这里写的是 `join(vendorDir, dirName)`：
    // 25 个受管包**一个都命中不了**，pairs 恒为空，于是 `--apply --only-metadata`
    // 每次都打印 `ok ... 对比 0 个包` 却从未比较过任何字节——而归组重构之后一直是这个
    // 状态（P-02 仪器假绿）。装载点那条路径早就有「0 个包 != 都一致」的护栏，vendor
    // 这条没有，所以它绿得毫无射程。下面的零命中护栏补上另一半。
    const target = join(vendorDir, relPath)
    if (!existsSync(target)) continue
    const sourceDir = join(repoRoot, relPath)
    pairs.push({ name: dirName, sourceDir, targetDir: target, files: listFiles(sourceDir) })
  }
  return pairs
}

/**
 * 构造**装载点**目标清单：只取每个包的运行时入口（`lib/<name>.js`）。
 *
 * 作用域限定为仓库受管的包——另一个项目的 `file:` 依赖不该由本仓库的脚本改写。
 * @param {string} profile profile 目录
 * @returns {Array<{name: string, sourceDir: string, targetDir: string, files: string[]}>}
 */
function loadPointPairs(profile) {
  const modulesDir = join(profile, 'node_modules')
  if (!existsSync(modulesDir)) return []
  // 包名 → 仓库相对目录。`file:` 里的路径**不能**用来推导仓库源目录：
  // 它的基准是 profile，而本脚本从任何 cwd 跑都可能，2026-09-13 实测从仓库根跑时
  // `existsSync('./vendor/packages/...')` 恒为假，于是**每个包**都在下一行被跳过、
  // pairs 恒为空、`ok 装载点与仓库源一致` 恒输出——一次都没跟仓库比过（P-02 仪器假绿）。
  // 从 profile 目录跑更隐蔽：那时路径能解析，但 sourceDir 指向的是 **profile 自己的
  // vendor 副本**，比的是「副本 ↔ 副本」，两份都旧也互相相等。
  const managed = new Map(managedPackages().map((entry) => [entry.dirName, entry.relPath]))
  const pairs = []
  for (const [name, spec] of Object.entries(installedDependencies(profile))) {
    if (!spec.startsWith('file:')) continue
    const relPath = managed.get(spec.slice('file:'.length).split('/').pop())
    if (relPath === undefined) continue
    const sourceDir = join(repoRoot, relPath)
    const manifest = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf8'))
    pairs.push({
      name,
      sourceDir,
      targetDir: join(modulesDir, name),
      files: loadPointFiles(sourceDir, manifest.files ?? []),
    })
  }
  return pairs
}

function parseArgs(argv) {
  let mode = 'check'
  let onlyMetadata = false
  let loadpoint = false
  let profile = join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') mode = 'check'
    else if (argv[i] === '--apply') mode = 'apply'
    else if (argv[i] === '--only-metadata') onlyMetadata = true
    else if (argv[i] === '--loadpoint') loadpoint = true
    else if (argv[i] === '--profile') {
      profile = argv[i + 1]
      i += 1
    } else return { error: `未知参数：${argv[i]}` }
  }
  if (loadpoint && onlyMetadata) return { error: '--only-metadata 是 vendor 副本的概念，不能与 --loadpoint 同用' }
  return { mode, onlyMetadata, loadpoint, profile }
}

function main() {
  const { mode, onlyMetadata, loadpoint, profile, error } = parseArgs(process.argv.slice(2))
  if (error) {
    process.stderr.write(`${error}\n`)
    process.exitCode = 2
    return
  }

  let pairs
  if (loadpoint) {
    const modulesDir = join(profile, 'node_modules')
    if (!existsSync(modulesDir)) {
      process.stdout.write(`skip 未找到装载点目录：${modulesDir}\n`)
      return
    }
    pairs = loadPointPairs(profile)
  } else {
    const vendorDir = join(profile, 'vendor')
    if (!existsSync(vendorDir)) {
      process.stdout.write(`skip 未找到 profile 副本目录：${vendorDir}\n`)
      return
    }
    pairs = vendorPairs(vendorDir)
  }

  const scope = loadpoint ? '装载点' : 'vendor 副本'
  let driftCount = 0
  for (const { name, sourceDir, targetDir, files } of pairs) {
    if (!existsSync(targetDir)) continue

    const { diverged, absentInTarget } = planSync(sourceDir, targetDir, files)
    // 装载点缺文件必须**能补齐**（2026-09-15 实测：`lib/host-util.js` 缺失时
    // `--apply --loadpoint` 只打印 note、不加文件，remediation 空转，应用进恢复模式）。
    // vendor 分支维持「不追加」：那是物化副本，不是装载点。
    let selected = onlyMetadata
      ? diverged.filter((file) => file === 'package.json')
      : loadpoint ? [...absentInTarget, ...diverged] : diverged

    if (loadpoint) {
      // 检查 package.json 的 LOADPOINT_MANIFEST_FIELDS 是否发生漂移
      const readField = (dir) => {
        try {
          return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        } catch {
          return null
        }
      }
      const from = readField(sourceDir)
      const to = readField(targetDir)
      if (from !== null && to !== null) {
        const drift = ['main', 'exports', 'dsh'].filter(
          (field) => JSON.stringify(from[field] ?? null) !== JSON.stringify(to[field] ?? null),
        )
        if (drift.length > 0 && !selected.includes('package.json')) {
          selected = [...selected, 'package.json']
        }
      }
    }
    if (selected.length === 0) {
      if (absentInTarget.length > 0 && !loadpoint) {
        process.stdout.write(`note ${name}: ${scope}未包含 ${absentInTarget.length} 个仓库文件（不追加，副本可能含运行所需产物）\n`)
      }
      continue
    }

    driftCount += 1
    process.stdout.write(
      `drift ${name}: ${selected.slice(0, 5).map((f) => `~${f}`).join(' ')}${selected.length > 5 ? ` … (+${selected.length - 5})` : ''}\n`,
    )

    if (mode === 'apply') {
      applySync(sourceDir, targetDir, selected)
      cleanTemps(targetDir, selected)
      process.stdout.write(`sync  ${name}: 已按 tmp+mv 原子替换/补齐 ${selected.length} 个文件\n`)
    }
  }

  // 「一个包都没比」必须与「逐字节都一致」在读数上长得不一样——旧实现里两者同形，
  // 于是本工具在 2026-09-13 那天报的 `ok` 是空射程的 `ok`（P-02）。
  // 2026-09-15：这条护栏原先只挂在装载点分支上，vendor 分支**没有**，于是归组重构
  // 把 vendor 路径写错之后，`--only-metadata` 连续多日打印 `ok ... 对比 0 个包`
  // 而从未比过任何字节。护栏必须覆盖两条路径，否则它保护的只是自己那条。
  if (pairs.length === 0) {
    const managedCount = managedPackages().length
    if (managedCount > 0) {
      process.stdout.write(
        `warn 仓库受管 ${managedCount} 个包，但${scope}里**一个都没对上**——`
          + '本次**未与仓库比较任何字节**，不是「都一致」\n',
      )
      process.exitCode = 1
      return
    }
  }

  if (driftCount === 0) {
    process.stdout.write(`ok ${scope}与仓库源一致（对比 ${pairs.length} 个包）\n`)
    process.exitCode = 0
    return
  }
  if (mode === 'check') {
    process.stdout.write(`fail ${driftCount} 个包在${scope}存在漂移（运行 --apply${loadpoint ? ' --loadpoint' : ''} 同步）\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`ok 已同步 ${driftCount} 个包（${scope}）\n`)
    process.exitCode = 0
  }
}

main()
