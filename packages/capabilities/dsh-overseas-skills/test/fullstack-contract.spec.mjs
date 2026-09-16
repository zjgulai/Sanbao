import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  auditApprovedWhitelist,
  auditFullstackCatalog,
  compareRuntimeWhitelist,
  toCanonicalCatalogResult,
  toCanonicalWhitelistResult,
  whitelistSetSha256,
} from '../scripts/fullstack-contract.mjs'
import { NODES } from '../scripts/build-fullstack-catalog.mjs'

const packageRoot = path.join(import.meta.dirname, '..')

function documents() {
  const mapping = {
    categories: [],
    skills: [
      {
        src: 'engineering/alpha-skill',
        name: 'alpha-skill',
        title: '甲技能',
        cat: 'M00',
        summaryZh: '用于验证存量 mapping 行的共同结构契约。',
      },
    ],
  }
  const extra = {
    skills: [
      {
        repo: 'fixture',
        name: 'beta-skill',
        installAs: 'beta-skill',
        dir: 'skills/beta-skill',
        cat: 'M01',
        titleZh: '乙技能',
        summaryZh: '用于验证 extra 行与 mapping 走同一份结构契约。',
      },
    ],
  }
  const manifest = {
    categories: NODES.map(({ key, title }) => ({ key, title })),
    skills: [
      {
        name: 'alpha-skill', title: '甲技能', category: 'm00',
        categoryTitle: 'M00 全局上下文与流程控制', toolBacked: false,
        summaryZh: '用于验证存量 mapping 行的共同结构契约。', toolGap: '', icon: '',
      },
      {
        name: 'beta-skill', title: '乙技能', category: 'm01',
        categoryTitle: 'M01 项目初始化与治理', toolBacked: false,
        summaryZh: '用于验证 extra 行与 mapping 走同一份结构契约。', toolGap: '', icon: '',
      },
    ],
  }
  return { mapping, extra, manifest }
}

/**
 * @param {string} name
 * @param {string} title
 * @param {boolean | string} [disable]
 */
function skillText(name, title, disable = false) {
  return `---\nname: "${name}"\ntitle: "${title}"\ndescription: "这是足够长且可复核的 fixture description"\ndisable-model-invocation: ${disable}\nuser-invocable: true\n---\nEnglish body is valid; language policy is not this contract.\n`
}

function withSkills(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fullstack-contract-'))
  try {
    for (const { name, title, disable } of [
      { name: 'alpha-skill', title: '甲技能', disable: false },
      { name: 'beta-skill', title: '乙技能', disable: true },
    ]) {
      const dir = path.join(root, name)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'SKILL.md'), skillText(name, title, disable))
    }
    return run(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function approved() {
  const skillIds = ['alpha-skill', 'beta-skill']
  return {
    schemaVersion: 1,
    presetId: 'agent-fullstack',
    approval: {
      owner: 'lute',
      decisionRef: 'docs/adr/ADR-0091.md',
      approvedAt: '2026-09-16',
      reason: 'fixture 中明确批准这两项，用于证明集合全等而不是只比较数量。',
      scope: 'preset-composition-only',
      orderSignificant: false,
      setSha256: whitelistSetSha256(skillIds),
    },
    skillIds,
  }
}

test('当前版本化 catalog 静态闭合为 mapping 70 + extra 68 = 138', () => {
  const audit = auditFullstackCatalog({ packageRoot, checkInstalled: false })
  const result = toCanonicalCatalogResult(audit)
  assert.equal(audit.originCounts.mapping, 70)
  assert.equal(audit.originCounts.extra, 68)
  assert.equal(result.status, 'pass')
  assert.equal(result.expected, 138)
  assert.equal(result.checked, 138)
  assert.equal(audit.itemResults.length, 138)
  assert.ok(audit.itemResults.every((item) => item.status === 'pass'))
})

test('mapping 与 extra 的合法 fixture 走同一契约，model flag 可分别为 false/true', () => withSkills((skillsDir) => {
  const audit = auditFullstackCatalog({ ...documents(), skillsDir })
  assert.deepEqual(audit.problems, [])
  assert.deepEqual(toCanonicalCatalogResult(audit), {
    status: 'pass', expected: 2, discovered: 2, checked: 2, skipped: 0, failed: 0,
    typedSkips: [], reason: 'fullstack catalog 逐项契约闭合',
    note: 'catalog 2/2（mapping 1 + extra 1）', violations: [],
  })
}))

test('extra-only 安装条目缺失必须点名，不能继续报 mapping 70/70', () => withSkills((skillsDir) => {
  fs.rmSync(path.join(skillsDir, 'beta-skill'), { recursive: true })
  const result = auditFullstackCatalog({ ...documents(), skillsDir })
  assert.ok(result.problems.some((problem) => /beta-skill.*未安装/.test(problem)))
  assert.equal(result.itemResults.find((item) => item.id === 'beta-skill')?.status, 'fail')
  assert.equal(toCanonicalCatalogResult(result).failed, 1)
}))

test('extra 的 frontmatter flags 非布尔值必须失败，但不能强迫所有技能 model-enabled', () => withSkills((skillsDir) => {
  const file = path.join(skillsDir, 'beta-skill', 'SKILL.md')
  fs.writeFileSync(file, skillText('beta-skill', '乙技能', 'sometimes'))
  const result = auditFullstackCatalog({ ...documents(), skillsDir })
  assert.ok(result.problems.some((problem) => /beta-skill.*disable-model-invocation/.test(problem)))
}))

test('extra artifact 的脚本语法错误必须进入同一逐项结果', () => withSkills((skillsDir) => {
  const script = path.join(skillsDir, 'beta-skill', 'broken.mjs')
  fs.writeFileSync(script, 'export const broken =\n')
  const result = auditFullstackCatalog({ ...documents(), skillsDir })
  assert.ok(result.problems.some((problem) => /beta-skill.*resource 语法失败 broken\.mjs/.test(problem)))
}))

test('路由型技能缺目标引用必须继续判红，不能在 138 扩容时丢掉旧射程', () => withSkills((skillsDir) => {
  const docs = documents()
  docs.mapping.skills[0].name = 'grill-me'
  docs.mapping.skills[0].src = 'engineering/grill-me'
  docs.manifest.skills[0].name = 'grill-me'
  fs.renameSync(path.join(skillsDir, 'alpha-skill'), path.join(skillsDir, 'grill-me'))
  fs.writeFileSync(path.join(skillsDir, 'grill-me', 'SKILL.md'), skillText('grill-me', '甲技能'))
  const result = auditFullstackCatalog({ ...docs, skillsDir })
  assert.ok(result.problems.some((problem) => /grill-me.*路由目标 grilling/.test(problem)))
}))

test('mapping / extra 跨源重复必须在 Set 吞掉前失败', () => {
  const docs = documents()
  docs.extra.skills[0].installAs = 'alpha-skill'
  const result = auditFullstackCatalog({ ...docs, checkInstalled: false })
  assert.ok(result.problems.some((problem) => /跨源重复|重名/.test(problem)))
  assert.equal(toCanonicalCatalogResult(result).status, 'fail')
})

test('NFKC/case 归一化碰撞必须失败', () => {
  const docs = documents()
  docs.extra.skills[0].installAs = 'ALPHA-SKILL'
  const result = auditFullstackCatalog({ ...docs, checkInstalled: false })
  assert.ok(result.problems.some((problem) => /归一化碰撞/.test(problem)))
})

test('删一补一维持总数时仍报告 manifest missing / unexpected', () => {
  const docs = documents()
  docs.extra.skills[0].name = 'gamma-skill'
  docs.extra.skills[0].installAs = 'gamma-skill'
  docs.extra.skills[0].dir = 'skills/gamma-skill'
  const result = auditFullstackCatalog({ ...docs, checkInstalled: false })
  assert.ok(result.problems.some((problem) => /manifest.*缺.*gamma-skill/.test(problem)))
  assert.ok(result.problems.some((problem) => /manifest.*多.*beta-skill/.test(problem)))
})

test('批准 whitelist 的合法 fixture 给出独立的 2/2 分母', () => {
  const audit = auditApprovedWhitelist({ whitelist: approved(), catalogAudit: auditFullstackCatalog({ ...documents(), checkInstalled: false }) })
  assert.deepEqual(toCanonicalWhitelistResult(audit), {
    status: 'pass', expected: 2, discovered: 2, checked: 2, skipped: 0, failed: 0,
    typedSkips: [], reason: 'agent-fullstack approved whitelist 闭合',
    note: 'whitelist 2/2；owner=lute；scope=preset-composition-only', violations: [],
  })
})

test('当前 canonical approved whitelist 与用户确认的 89 项集合及指纹闭合', () => {
  const catalogAudit = auditFullstackCatalog({ packageRoot, checkInstalled: false })
  const audit = auditApprovedWhitelist({ catalogAudit })
  const result = toCanonicalWhitelistResult(audit)
  assert.equal(result.status, 'pass')
  assert.equal(result.expected, 89)
  assert.equal(result.checked, 89)
  assert.equal(audit.owner, 'lute')
  assert.equal(audit.decisionRef, 'docs/adr/ADR-0091.md')
  assert.equal(audit.scope, 'preset-composition-only')
  assert.equal(audit.setSha256, '4ebfa9f70176774e5018ea8ec8ab33f7f6f037b697f5bd48cd438c1b4821fa0d')
  assert.equal(audit.calculatedSetSha256, audit.setSha256)
})

test('批准集合内容变化但保留旧指纹必须失败', () => {
  const document = approved()
  document.skillIds[1] = 'gamma-skill'
  const audit = auditApprovedWhitelist({
    whitelist: document,
    catalogAudit: auditFullstackCatalog({ ...documents(), checkInstalled: false }),
  })
  assert.ok(audit.problems.some((problem) => /setSha256 不符/.test(problem)))
})

test('批准 manifest 缺失必须硬失败，不能随 live preset 一起 skip', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fullstack-whitelist-missing-'))
  try {
    const audit = auditApprovedWhitelist({
      whitelistPath: path.join(root, 'missing.json'),
      catalogAudit: auditFullstackCatalog({ ...documents(), checkInstalled: false }),
    })
    assert.equal(toCanonicalWhitelistResult(audit).status, 'fail')
    assert.ok(audit.problems.some((problem) => /无法读取/.test(problem)))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('批准元数据的 owner/ref/reason/date/scope/order 任何一项漂移都必须失败', () => {
  const document = approved()
  Object.assign(document.approval, {
    owner: 'someone-else',
    decisionRef: 'docs/adr/ADR-other.md',
    reason: '太短',
    approvedAt: '16-09-2026',
    scope: 'release-authorized',
    orderSignificant: true,
  })
  const audit = auditApprovedWhitelist({
    whitelist: document,
    catalogAudit: auditFullstackCatalog({ ...documents(), checkInstalled: false }),
  })
  for (const pattern of [/owner 必须为 lute/, /decisionRef 必须为/, /reason 缺失或过短/, /approvedAt/, /scope 必须为/, /orderSignificant/]) {
    assert.ok(audit.problems.some((problem) => pattern.test(problem)), `缺少 ${pattern}：\n${audit.problems.join('\n')}`)
  }
})

test('批准项越出 catalog 或 catalog 自身未闭合都必须失败', () => {
  const catalogAudit = auditFullstackCatalog({ ...documents(), checkInstalled: false })
  const outsider = approved()
  outsider.skillIds[1] = 'outsider-skill'
  outsider.approval.setSha256 = whitelistSetSha256(outsider.skillIds)
  const outsiderAudit = auditApprovedWhitelist({ whitelist: outsider, catalogAudit })
  assert.ok(outsiderAudit.problems.some((problem) => /不属于 catalog：outsider-skill/.test(problem)))

  const unclosedAudit = auditApprovedWhitelist({
    whitelist: approved(),
    catalogAudit: { ...catalogAudit, failed: 1 },
  })
  assert.ok(unclosedAudit.problems.some((problem) => /无法绑定未闭合/.test(problem)))
})

test('本次批准的是集合：runtime 顺序变化不构成 whitelist 漂移', () => {
  const result = compareRuntimeWhitelist(approved(), ['beta-skill', 'alpha-skill'])
  assert.deepEqual(result.problems, [])
})

test('任意一节点一条的合法子集也不能冒充 approved whitelist', () => {
  const result = compareRuntimeWhitelist(approved(), ['alpha-skill'])
  assert.deepEqual(result.missing, ['beta-skill'])
  assert.deepEqual(result.unexpected, [])
  assert.ok(result.problems.some((problem) => /missing.*beta-skill/.test(problem)))
})

test('等数量替换批准项必须同时报告 missing / unexpected', () => {
  const result = compareRuntimeWhitelist(approved(), ['alpha-skill', 'gamma-skill'])
  assert.deepEqual(result.missing, ['beta-skill'])
  assert.deepEqual(result.unexpected, ['gamma-skill'])
})

test('用重复项维持数组长度必须报告 duplicate 与 missing', () => {
  const result = compareRuntimeWhitelist(approved(), ['alpha-skill', 'alpha-skill'])
  assert.deepEqual(result.duplicates, ['alpha-skill'])
  assert.deepEqual(result.missing, ['beta-skill'])
})
