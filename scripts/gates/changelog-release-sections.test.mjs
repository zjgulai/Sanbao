/**
 * `changelog-release-sections` 的反向自测（P-03：判据自己也要被证伪）。
 *
 * 立的规矩：**每个用例都要能在「判据退化成恒真桩」时变红**。
 * 下面每条注释都点名它挡的是哪种退化。第 1～2 条用的是 2026-09-14 修复前后的**真实文本形状**。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkChangelogSections } from './changelog-release-sections.mjs'

/** 射程：五个已发布版本（与门禁 `release-published` 同一把尺的交集）。 */
const PUBLISHED = ['2.2.0', '2.3.0', '2.3.1', '2.3.3', '2.4.0']

test('修复前的真实形状：账停在 Unreleased，两个已发布版本没有段', () => {
  // 挡的退化：把「有段」判成「文件非空」。那样修复前那份账会判绿——
  // 而它恰恰漏掉了 2.3.3 与 2.4.0 两个已发布版本。
  const root = [
    '# Changelog',
    '',
    '## [Unreleased] - 2026-09-13（HMR 生产守卫：白屏机制修复 + 可观测性）',
    '',
    '- 安装器新增 0b 步骤……',
    '',
    '## [2.3.2] - 2026-09-13（**未发布**）',
    '',
    '## [2.3.1] - 2026-09-13',
    '',
    '## [2.3.0] - 2026-09-13',
    '',
    '## [2.2.0] - 2026-09-12',
    '',
  ].join('\n')

  const result = checkChangelogSections({
    publishedVersions: PUBLISHED,
    documents: [{ path: 'CHANGELOG.md', text: root, requireVersionSections: true }],
  })

  assert.equal(result.passed, false)
  // 缺的必须是**那两个**，不多不少：2.2.0/2.3.1 有段，2.3.2 不在射程内。
  const missing = result.violations.filter((line) => /已发布版本/.test(line))
  assert.equal(missing.length, 2)
  assert.match(missing.join('\n'), /2\.3\.3/)
  assert.match(missing.join('\n'), /2\.4\.0/)
})

test('补齐之后全绿，且读数常显射程（量了哪几个版本）', () => {
  const root = [
    '# Changelog',
    '',
    '## [Unreleased] - 2026-09-14',
    '',
    '## [2.4.0] - 2026-09-14（底本收敛与「拦住」补齐：出货面零变化，门禁首次 full 55/55）',
    '',
    '## [2.3.3] - 2026-09-13（HMR 生产守卫：白屏机制修复 + 可观测性）',
    '',
    '## [2.3.2] - 2026-09-13（**未发布**）',
    '',
    '## [2.3.1] - 2026-09-13',
    '',
    '## [2.3.0] - 2026-09-13',
    '',
    '## [2.2.0] - 2026-09-12',
    '',
  ].join('\n')

  const result = checkChangelogSections({
    publishedVersions: PUBLISHED,
    documents: [{ path: 'CHANGELOG.md', text: root, requireVersionSections: true }],
  })

  assert.equal(result.passed, true)
  // 「本项量了谁」也是读数的一部分：不然「没核对」与「都合格」在输出上同形（P-02）。
  assert.match(result.note, /核对 5 个已发布版本/)
  assert.match(result.note, /2\.4\.0/)
})

test('退化守卫：版本号只出现在正文里，不算成段', () => {
  // 挡的退化：判据写成 `text.includes(version)` 或 `text.includes('[' + version + ']')`。
  // 下面这份正文里「2.4.0」出现三次（清单链接、构建号说明、正文叙述），
  // 但**没有** `## [2.4.0]` 标题——那种实现会判绿，而客户读到的账里根本没有这一版。
  const root = [
    '# Changelog',
    '',
    '## [Unreleased] - 2026-09-14',
    '',
    '- 入库清单 [`release/2.4.0.sha256`](release/2.4.0.sha256)：build `20260914-112858`。',
    '- 2.4.0 的出货技能面与 2.3.3 逐名相同（349 条）。',
    '- 关于 [2.4.0] 的完整记录见 GitHub Release。',
    '',
    '## [2.3.3] - 2026-09-13',
    '',
  ].join('\n')

  const result = checkChangelogSections({
    publishedVersions: ['2.4.0'],
    documents: [{ path: 'CHANGELOG.md', text: root, requireVersionSections: true }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /2\.4\.0/)
})

test('退化守卫：`## [2.4.0-rc.1]` 不能冒充 `## [2.4.0]`', () => {
  // 挡的退化：标题匹配写成前缀匹配（`startsWith('[' + version)`）。
  // 预发布号与正式版是两次交付，拿 rc 的段冒充正式版正是「未验证的事实被钉进出货面」（P-01）。
  const text = '# Changelog\n\n## [2.4.0-rc.1] - 2026-09-14\n\n## [Unreleased] - 2026-09-14\n'

  const result = checkChangelogSections({
    publishedVersions: ['2.4.0'],
    documents: [{ path: 'CHANGELOG.md', text, requireVersionSections: true }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /2\.4\.0/)
})

test('退化守卫：并列多个 `## [Unreleased]` 判红（修复前 packaging 账的真实形状）', () => {
  // 2026-09-14 修复前 packaging/CHANGELOG.md 三段并列都顶着 [Unreleased]，
  // 而它们描述的工作**已经随 2.3.3 出货**。这条结构规则对两份账都适用。
  const text = [
    '# CHANGELOG',
    '',
    '## [Unreleased]（2026-09-13 · 发布前门禁的射程与三态读数）',
    '',
    '## [Unreleased]（2026-09-13 · 出货面边界）',
    '',
    '## [Unreleased]（2026-09-13 · HMR 生产守卫）',
    '',
    '## [2.2.0]（2026-09-12）',
    '',
  ].join('\n')

  const result = checkChangelogSections({
    publishedVersions: [],
    documents: [{ path: 'packaging/CHANGELOG.md', text, requireVersionSections: false }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /3 个/)
})

test('流水线账不因「某版没有段」判红，但结构规则仍然说话', () => {
  // 挡的退化：把「逐版成段」推广到两份账。packaging/CHANGELOG 是流水线细节的账，
  // 某版打包面没变化时**合法地**没有段（2.3.0 / 2.3.1 正是如此）——那会造出一条
  // 噪声规则，而噪声规则的结局是被关掉（P-02 的死法）。同时它也不是法外之地：
  // 多个 Unreleased 照样红（见上一条）。
  const ok = checkChangelogSections({
    publishedVersions: PUBLISHED,
    documents: [
      { path: 'packaging/CHANGELOG.md', text: '# CHANGELOG\n\n## [2.4.0]（2026-09-14）\n', requireVersionSections: false },
    ],
  })
  assert.equal(ok.passed, true)

  const bad = checkChangelogSections({
    publishedVersions: PUBLISHED,
    documents: [
      {
        path: 'packaging/CHANGELOG.md',
        text: '# CHANGELOG\n\n## [Unreleased]\n\n## [Unreleased]\n',
        requireVersionSections: false,
      },
    ],
  })
  assert.equal(bad.passed, false)
})

test('退化守卫：账读不到正文必须判红，不许静默跳过', () => {
  // 挡的退化：读不到文件时 `continue`。删空这份账是最省事的「通过」方式，
  // 而它正是本条要防的东西（P-02 的「没有读数」被当成「读数为好」）。
  const result = checkChangelogSections({
    publishedVersions: PUBLISHED,
    documents: [{ path: 'CHANGELOG.md', text: '', requireVersionSections: true }],
  })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /读不到正文/)
})

test('射程为空必须报 vacuous，不许与「通过」同形', () => {
  // 浅克隆（git tag 读不到）或清单目录缺失时射程为空。此时**不能**退化成
  // 「没有版本要查 ⇒ 通过」——正确处置是调用方报**跳过**（ADR-0075）。
  const result = checkChangelogSections({
    publishedVersions: [],
    documents: [{ path: 'CHANGELOG.md', text: '# Changelog\n\n## [Unreleased]\n', requireVersionSections: true }],
  })

  assert.equal(result.vacuous, true)
  assert.equal(result.passed, true)
  assert.match(result.note, /射程内没有任何版本/)
})

test('标签带不带 `v` 前缀都认（两个来源格式不同）', () => {
  // 挡的退化：只 strip 一处。清单给的是 `2.4.0`、tag 给的是 `v2.4.0`，
  // 标题写成 `## [v2.4.0]` 时若只认一种，就会造出一条永远为真的假红。
  const result = checkChangelogSections({
    publishedVersions: ['v2.4.0'],
    documents: [{ path: 'CHANGELOG.md', text: '# Changelog\n\n## [v2.4.0] - 2026-09-14\n', requireVersionSections: true }],
  })

  assert.equal(result.passed, true)
})

test('读数稳定：版本按数字序展示，不随输入顺序抖动', () => {
  const a = checkChangelogSections({ publishedVersions: ['2.10.0', '2.9.0'] })
  const b = checkChangelogSections({ publishedVersions: ['2.9.0', '2.10.0'] })

  assert.equal(a.note, b.note)
  // 字典序会把 2.10.0 排在 2.9.0 前面——那是读数错，不是显示口味问题。
  assert.match(a.note, /2\.9\.0 2\.10\.0/)
})
