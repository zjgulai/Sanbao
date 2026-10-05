/**
 * dev-debug.mjs —— Sage 本地开发与调试环境（方案 A 第一步）。
 *
 * 一条命令：构建（tsc + renderer bundle）→ materialize 到隔离 dev 根 → 以调试姿态启动 Electron。
 *
 * 设计要点（决策见 ADR-0263 / Note 2026-10-05-local-dev-debug-environment）：
 * - **根隔离**：默认使用 `~/Library/Application Support/Sage Dev`（与生产 `Sage` 根分离，
 *   path 守卫天然拒绝 ~/.dsh）；首次使用写入 `.sage-dev-root` 标记，`--reset` 只认这个标记。
 * - **调试姿态**：main 进程 Node inspector（默认 9229）＋ renderer CDP（默认 9222）＋
 *   `SAGE_DEVTOOLS=1` 自动打开 detached DevTools；全部可 env/flag 覆盖。
 * - **投影**：默认 `SAGE_FIXTURE_PROJECTION=1`（可见 UI）；`--unavailable` 切到诚实 unavailable 路径。
 * - **日志**：stdout/stderr 全量 tee 到 `<dev 根>/logs/dev-session.log`，终端同时可见。
 *
 * 用法：
 *   node scripts/dev-debug.mjs                 # 构建 + materialize + 启动（fixture、devtools 开）
 *   node scripts/dev-debug.mjs --no-build      # 跳过 tsc/build-renderer（纯重启循环）
 *   node scripts/dev-debug.mjs --unavailable   # 不注入 fixture 投影
 *   node scripts/dev-debug.mjs --root <dir>    # 覆盖 dev 根（或 SAGE_DEV_ROOT）
 *   node scripts/dev-debug.mjs --reset         # 删除 dev 根（须带标记）后重建再启动
 *   node scripts/dev-debug.mjs --print         # 只打印解析后的根/端口/日志路径并退出
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, createWriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const devRoot = value('--root', process.env.SAGE_DEV_ROOT ?? join(homedir(), 'Library', 'Application Support', 'Sage Dev'))
const marker = join(devRoot, '.sage-dev-root')
const inspectPort = value('--inspect-port', process.env.SAGE_DEV_INSPECT_PORT ?? '9229')
const cdpPort = value('--cdp-port', process.env.SAGE_DEV_CDP_PORT ?? '9222')
const logPath = join(devRoot, 'logs', 'dev-session.log')
const fixture = !flag('--unavailable')

console.log(`[dev-debug] dev 根：${devRoot}`)
console.log(`[dev-debug] main inspector：http://127.0.0.1:${inspectPort}（chrome://inspect）`)
console.log(`[dev-debug] renderer CDP：http://127.0.0.1:${cdpPort}/json/list`)
console.log(`[dev-debug] 会话日志：${logPath}`)
console.log(`[dev-debug] 投影：${fixture ? 'SAGE_FIXTURE_PROJECTION=1（fixture UI）' : '生产形态（unavailable-first）'}`)
if (flag('--print')) process.exit(0)

if (flag('--reset')) {
  if (existsSync(marker)) {
    rmSync(devRoot, { recursive: true, force: true })
    console.log('[dev-debug] 已按标记重置 dev 根')
  } else if (existsSync(devRoot)) {
    console.error(`[dev-debug] 拒绝重置：${devRoot} 存在但缺少 .sage-dev-root 标记（不是本工具创建）`)
    process.exit(2)
  }
}
mkdirSync(join(devRoot, 'logs'), { recursive: true })
writeFileSync(marker, `Sage 本地开发调试根（dev-debug.mjs 管理）\n创建于 ${new Date().toISOString()}\n`)

function run(label, command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: shellRoot, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${label} 退出码 ${String(code)}`)))
  })
}

try {
  if (!flag('--no-build')) {
    await run('tsc', join(shellRoot, 'node_modules', '.bin', 'tsc'), [], {})
    await run('build-renderer', process.execPath, [join(shellRoot, 'scripts', 'build-renderer.mjs')], {})
  }
  if (!flag('--no-materialize')) {
    await run('materialize', process.execPath, [join(shellRoot, 'scripts', 'materialize.mjs')], { SAGE_ROOT: devRoot })
  }
} catch (error) {
  console.error(`[dev-debug] 前置失败：${error.message}`)
  process.exit(1)
}

const log = createWriteStream(logPath, { flags: 'w' })
const tee = (chunk) => { process.stdout.write(chunk); log.write(chunk) }
const teeErr = (chunk) => { process.stderr.write(chunk); log.write(chunk) }

const electron = join(shellRoot, 'node_modules', '.bin', 'electron')
const electronArgs = [
  `--inspect=${inspectPort}`,
  `--remote-debugging-port=${cdpPort}`,
  '.',
]
const child = spawn(electron, electronArgs, {
  cwd: shellRoot,
  env: {
    ...process.env,
    SAGE_ROOT: devRoot,
    SAGE_DEVTOOLS: '1',
    ELECTRON_ENABLE_LOGGING: '1',
    ...(fixture ? { SAGE_FIXTURE_PROJECTION: '1' } : {}),
  },
  stdio: ['inherit', 'pipe', 'pipe'],
})
child.stdout.on('data', tee)
child.stderr.on('data', teeErr)
const forward = (signal) => { try { child.kill(signal) } catch {} }
process.on('SIGINT', () => forward('SIGINT'))
process.on('SIGTERM', () => forward('SIGTERM'))
child.on('close', (code) => {
  log.end()
  console.log(`[dev-debug] Electron 退出码 ${String(code)}；会话日志：${logPath}`)
  process.exit(code ?? 0)
})
