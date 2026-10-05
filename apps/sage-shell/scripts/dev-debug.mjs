/** Build, materialize and launch the default Sage desktop in an isolated development root. */
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

console.log(`[dev-debug] dev 根：${devRoot}`)
console.log(`[dev-debug] main inspector：http://127.0.0.1:${inspectPort}（chrome://inspect）`)
console.log(`[dev-debug] renderer CDP：http://127.0.0.1:${cdpPort}/json/list`)
console.log(`[dev-debug] 会话日志：${logPath}`)
console.log('[dev-debug] 主界面：Sanbao 桌面（Sage 默认主窗口）')
console.log('[dev-debug] 投影：真实服务响应（不注入 fixture）')
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
const electronEnv = {
  ...process.env,
  SAGE_ROOT: devRoot,
  SAGE_DEVTOOLS: '1',
  ELECTRON_ENABLE_LOGGING: '1',
}
delete electronEnv.ELECTRON_RUN_AS_NODE
delete electronEnv.SAGE_FIXTURE_PROJECTION
delete electronEnv.SAGE_FIXTURE_STAGE
delete electronEnv.SAGE_SANBAO_SURFACE
delete electronEnv.SAGE_SANBAO_SURFACE_ROOT
const child = spawn(electron, electronArgs, {
  cwd: shellRoot,
  env: electronEnv,
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
