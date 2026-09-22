/**
 * 服务消费面判据（DA-22 / 2026-09-22）。
 *
 * ## 为什么需要它
 *
 * 图谱读数：跨包 imports = 0，29 个受管包在代码层完全解耦，包间协作全部走
 * cordis 服务注入（`ctx.get(name)`）。这条真实的耦合干线此前没有任何静态守卫——
 * 新增一个消费点，没有任何判据会注意到它（P-04「写了但从没跑到」的结构面：
 * 消费写了但没进任何射程）。
 *
 * ## 判据（对账契约）
 *
 * 1. 登记处（service-consumption.json）必须可读、可解析、非空——空登记处让本项
 *    恒绿（P-02），与 jev.residuals 同一条取向。
 * 2. 扫描射程：packages/ 与 apps/ 的 .ts/.js/.mjs 源码，排除 lib/、node_modules/、
 *    dist/、test 目录、test/spec 后缀文件、snapshot 快照（构建产物与测试不进消费面）。
 * 3. 逐文件对账，四个方向都判红：
 *    · 文件消费了字面量服务而登记处没有该文件 → 未登记文件；
 *    · 文件消费了登记条目里没有的服务名 → 未登记服务；
 *    · 登记条目里的服务名文件已不再消费 → 陈旧条目（登记必须反映现实）;
 *    · 登记了已不消费任何服务的文件（或文件已删） → 陈旧条目。
 * 4. 动态消费（`ctx.get(<非字面量>)`）：名字运行时才定，静态不可枚举——该文件必须
 *    在登记处标 `dynamic: true`；未标而实际存在动态消费 → 判红。动态文件的字面量
 *    消费同样逐个对账。
 * 5. 注释行（//、*、/* 开头）不计——扫描器不解析 AST，用行级注释跳过做近似；
 *    这是已知边界，写在 note 里不藏着。
 *
 * 本判据不判断「该不该消费这个服务」（那是 ADR-0038 / DA-23 的人裁决面），
 * 只保证消费面**可见**且**不漂移于登记处**。
 *
 * @module
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 登记处路径（仓库根相对）。 */
export const REGISTRY_REL_PATH = 'scripts/gates/service-consumption.json'

/** 字面量服务名：ctx.get('name') / ctx.get("name")（可带第二参数；名字允许连字符，如 brand-new-fake-service）。 */
const LITERAL_RE = /ctx\.get\(\s*["']([A-Za-z_$][\w$-]*)["']/
/** 动态消费：ctx.get( 后面跟的不是引号开头（含第二参数形态的误判容忍——见 isDynamicCall）。 */
const CALL_RE = /ctx\.get\(\s*([^)]*)\)/g

/**
 * 扫一段源码文本的字面量服务名与动态消费计数。
 * @param {string} text
 * @returns {{ services: string[], dynamicCount: number }}
 */
export function scanServiceConsumption(text) {
  const services = new Set()
  let dynamicCount = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    const literal = LITERAL_RE.exec(line)
    if (literal) services.add(literal[1])
    for (const match of line.matchAll(CALL_RE)) {
      const arg = match[1].trim()
      // 引号开头 = 字面量（已计）；其余（标识符、表达式）计一次动态
      if (!arg.startsWith('"') && !arg.startsWith("'")) dynamicCount += 1
    }
  }
  return { services: [...services].sort(), dynamicCount }
}

/**
 * 对账登记处与扫描结果。
 * @param {{registryText: string|null|undefined, files: Array<{path: string, text: string}>}} input
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function checkServiceConsumption({ registryText, files }) {
  if (typeof registryText !== 'string') {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: 读不出——「读不到登记处」不等于「没有消费面」，判红而不是当作空登记`],
      note: '登记处读不到，本项未核对任何消费点',
    }
  }
  let parsed
  try {
    parsed = JSON.parse(registryText)
  } catch (error) {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: 解析失败（${error.message}）`],
      note: '登记处损坏，本项未核对任何消费点',
    }
  }
  const entries = Array.isArray(parsed?.consumptions) ? parsed.consumptions : null
  if (entries === null) {
    return { passed: false, violations: [`${REGISTRY_REL_PATH}: 缺 consumptions 数组`], note: '登记处形状非法' }
  }
  if (entries.length === 0) {
    return {
      passed: false,
      violations: [`${REGISTRY_REL_PATH}: consumptions 为空——空登记处让本项恒绿（P-02）`],
      note: '登记 0 个消费文件',
    }
  }

  const registered = new Map(entries.map((e) => [e.file, e]))
  const violations = []
  const scannedFiles = []

  for (const { path, text } of files) {
    const { services, dynamicCount } = scanServiceConsumption(text)
    if (services.length === 0 && dynamicCount === 0) continue
    scannedFiles.push(path)
    const entry = registered.get(path)
    if (!entry) {
      violations.push(`${path}: 消费 ${JSON.stringify(services)}${dynamicCount ? '（含动态）' : ''} 但登记处没有该文件——新消费点必须随提交登记`)
      continue
    }
    const regServices = Array.isArray(entry.services) ? entry.services : []
    for (const svc of services) {
      if (!regServices.includes(svc)) violations.push(`${path}: 消费服务 "${svc}" 未登记`)
    }
    for (const svc of regServices) {
      if (!services.includes(svc)) violations.push(`${path}: 登记的服务 "${svc}" 已不再被消费（陈旧条目）`)
    }
    if (dynamicCount > 0 && entry.dynamic !== true) {
      violations.push(`${path}: 存在 ctx.get(<非字面量>) 动态消费（${dynamicCount} 处）但登记处未标 dynamic: true`)
    }
    registered.delete(path)
  }

  for (const [file] of registered) {
    violations.push(`${file}: 登记的文件已不消费任何服务（或已删除）——陈旧条目`)
  }

  const fileCount = scannedFiles.length
  const serviceCount = entries.reduce((n, e) => n + (Array.isArray(e.services) ? e.services.length : 0), 0)
  const dynamicFiles = entries.filter((e) => e.dynamic === true).length
  const note = `对账 ${fileCount} 个消费文件 / ${serviceCount} 条字面量服务 / ${dynamicFiles} 个动态消费文件`
    + `；扫描近似：跳过行级注释，不解析 AST（已知边界）`
  return { passed: violations.length === 0, violations, note }
}

/**
 * 收集扫描射程内的文件（git 跟踪的 packages/ 与 apps/ 源码）。
 * @param {string} repoRoot
 * @returns {Array<{path: string, text: string}>}
 */
export function collectConsumptionFiles(repoRoot) {
  const listed = execSync('git ls-files packages apps', { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|js|mjs)$/.test(f))
    .filter((f) => !/(^|\/)(lib|node_modules|dist|test|tests)\//.test(f))
    .filter((f) => !/\.(test|spec)\./.test(f))
    .filter((f) => !/\.snapshot/.test(f))
  return listed.map((path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') }))
}
