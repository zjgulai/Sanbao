/**
 * `dmg-layout.mjs` 的反向自测。
 *
 * 为什么这些用例必须是「能说**不**」的用例：本项守的是**一条会自己过期的文档断言**
 * ——「DMG 挂载后应看到什么」。一份只会在正确时判绿的校验，与没有校验的区别只在于它
 * 更让人放心，而那正是 P-02「仪器假绿」的成因。
 *
 * 最要紧的是那条**恒真桩突变**（`R2 形态断言` 的用例）：输入用的就是 2026-09-13 实测
 * 撞上的**缺陷原文**（「应看到 DSH Desktop.app 与 Applications 快捷方式」）。一个只检查
 * 「SOP 有没有链接安装手册」的实现会放过它——因为那份 SOP 什么都没链接，却也什么都没说错
 * 的样子——于是缺陷原样复发。这条用例的作用就是让那种退化的实现红给你看。
 *
 * 另一条同样要紧的是**空射程**：没有产物可量时必须报 `skip`，不能报 `ok`。
 * 「没量到东西」被读成「都合格」是本类判据最便宜的失效路径（ADR-0075 / P-02）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDmgLayout, GUIDE_REL_PATH, parseGuideEntries, selectLayoutTargets, SOP_REL_PATH } from './dmg-layout.mjs'

/** 2.3.3 交付卷的**真实**顶层清单（`ls -A /Volumes/DSH Desktop LUTE 2.3.3/`，实测 13 项）。 */
const REAL_VOLUME = [
  'aeis-portable.tar.gz',
  'completeness.json',
  'DSH Desktop.app.tar.gz',
  'INSTALL-GUIDE.md',
  'install.sh',
  'LUTE Setup.app',
  'manifest.json',
  'profile.tar.gz',
  'README.md',
  'SHA256SUMS',
  'skills-presets.tar.gz',
  'tools',
  'VERSION',
]

/** 安装手册第 2 节的入口表（与仓库里那份同形，含 `completeness.json` 行）。 */
const GUIDE = `# LUTE Agentic System 安装手册（用户版）

## 2. 关键一步：DMG 里哪个文件才是「安装入口」

打开 \`.dmg\` 后会看到一个窗口。**只有下面两个是可点的安装入口，其余全是载荷**：

| 你看到的 | 它是什么 | 该怎么用 |
| --- | --- | --- |
| **LUTE Setup.app** | 图形安装向导 | ✅ **双击它**（所有人都用这个） |
| **install.sh** | 命令行安装器 | ✅ 只在「终端」里运行它 |
| \`DSH Desktop.app.tar.gz\` | 应用本体（已定制） | ⛔ 别动 |
| \`profile.tar.gz\` | 运行环境（离线依赖） | ⛔ 别动 |
| \`skills-presets.tar.gz\` | 技能与岗位预设 | ⛔ 别动 |
| \`aeis-portable.tar.gz\` | 灵枢（内置 Python 运行时） | ⛔ 别动 |
| \`tools/\` | 自检与修复工具 | ⛔ 别动 |
| \`completeness.json\` | 出货清单（冒烟与安装器据此比对） | 👀 只用来看 |
| \`INSTALL-GUIDE.md\` / \`README.md\` / \`VERSION\` / \`manifest.json\` / \`SHA256SUMS\` | 说明与校验文件 | 👀 只用来看 |

---

## 3. 安装 · 方式一：双击向导（推荐，无需终端）
`

/** 修好之后的 SOP §5.2（指向唯一事实之家，不复述清单，不断言拖拽形态）。 */
const SOP_OK = `# SOP · DSH Desktop × Magpie-Horch DMG 打包发布

## 5. 终验

### 5.2 挂载与内容验证

交付形态是**离线安装器载荷**，卷内清单一律以
[安装手册第 2 节](../../packaging/INSTALL-GUIDE.md) 为准，本节不复述清单。

\`\`\`bash
hdiutil attach "packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg" -nobrowse
ls -A "/Volumes/DSH Desktop LUTE $VERSION"/
hdiutil detach "/Volumes/DSH Desktop LUTE $VERSION"
\`\`\`
`

const realArtifacts = (entries = REAL_VOLUME) => [{ label: '/Volumes/DSH Desktop LUTE 2.3.3', entries }]

/**
 * 断言判据判红，且违规文本里**指名道姓**地说出坏在哪。
 * 只说「校验失败」的校验，下次没人知道该改什么。
 * @param {{passed: boolean, violations: string[]}} result 判据结果
 * @param {string} needle 违规文本里必须出现的片段
 */
function assertRed(result, needle) {
  assert.equal(result.passed, false, `应当判红，实际判绿：${JSON.stringify(result)}`)
  assert.ok(
    result.violations.some((line) => line.includes(needle)),
    `违规文本里应当说出「${needle}」，实际是：\n${result.violations.join('\n')}`,
  )
}

test('交付卷形态：SOP 指向安装手册且卷与表逐名一致时判绿', () => {
  const result = checkDmgLayout({ sopText: SOP_OK, guideText: GUIDE, artifacts: realArtifacts() })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.equal(result.skipped, undefined, '有产物在射程内时不得报跳过')
  assert.match(result.note, /已比对 1 份卷内清单/)
})

test('交付卷形态：恒真桩突变——缺陷原文「应看到 DSH Desktop.app 与 Applications 快捷方式」必须判红', () => {
  // 这是 2026-09-13 实测撞上的那两句话。一个只检查「SOP 有没有链接安装手册」的实现
  // 会放过它，因为那份 SOP 只是没链接、语法上什么都没错——于是同一处缺陷原样复发。
  const stale = SOP_OK.replace(
    '交付形态是**离线安装器载荷**，卷内清单一律以\n[安装手册第 2 节](../../packaging/INSTALL-GUIDE.md) 为准，本节不复述清单。',
    'ls /Volumes/"DSH Desktop LUTE $VERSION"/\n# 应看到 DSH Desktop.app 与 Applications 快捷方式',
  )
  const result = checkDmgLayout({ sopText: stale, guideText: GUIDE, artifacts: realArtifacts() })
  assertRed(result, '拖拽式交付形态')
  assertRed(result, 'Applications 快捷方式')
})

test('交付卷形态：SOP 没有指向安装手册时判红（复述清单＝给同一事实再造一个家）', () => {
  const result = checkDmgLayout({
    sopText: '# SOP\n\n### 5.2 挂载与内容验证\n\n自己列一遍：install.sh、profile.tar.gz\n',
    guideText: GUIDE,
    artifacts: realArtifacts(),
  })
  assertRed(result, '必须只有一个家')
})

test('交付卷形态：卷上有手册没登记的文件时判红', () => {
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: GUIDE,
    artifacts: realArtifacts([...REAL_VOLUME, 'debug-trace.log']),
  })
  assertRed(result, '未登记条目')
  assertRed(result, 'debug-trace.log')
})

test('交付卷形态：手册登记了卷上没有的文件时判红（幽灵条目）', () => {
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: GUIDE,
    artifacts: realArtifacts(REAL_VOLUME.filter((name) => name !== 'completeness.json')),
  })
  assertRed(result, '实物没有')
  assertRed(result, 'completeness.json')
})

test('交付卷形态：标为「✅ 可点入口」的项在卷上不存在时判红', () => {
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: GUIDE,
    artifacts: realArtifacts(REAL_VOLUME.filter((name) => name !== 'install.sh')),
  })
  assertRed(result, '可点入口')
  assertRed(result, 'install.sh')
})

test('交付卷形态：入口表解析不出任何条目时判红，而不是当作「没什么可比的」放行', () => {
  // 表的形态变了而判据没跟着变——这时**空读数不是合格读数**（P-02）。
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: '# 手册\n\n## 2. 入口\n\n表被删掉了，改成了一段散文。\n\n## 3. 安装\n',
    artifacts: realArtifacts(),
  })
  assertRed(result, '解析不出任何条目')
})

test('交付卷形态：安装手册读不到时判红（形态事实不能只剩会过期的那份复述）', () => {
  const result = checkDmgLayout({ sopText: SOP_OK, guideText: '', artifacts: realArtifacts() })
  assertRed(result, '读不到安装手册')
})

test('交付卷形态：SOP 读不到时判红（删掉复核入口不该是绿的）', () => {
  const result = checkDmgLayout({ sopText: '', guideText: GUIDE, artifacts: realArtifacts() })
  assertRed(result, '读不到 SOP 正文')
})

test('交付卷形态：射程为空时报「跳过」而不是「通过」，且静态半仍然有效', () => {
  // 清理掉 staging、卸掉交付卷之后，本项必然处于这个状态。
  // 「没量到任何东西」被读成「都合格」是本类判据最便宜的失效路径（ADR-0075 / P-02）。
  const result = checkDmgLayout({ sopText: SOP_OK, guideText: GUIDE, artifacts: [] })
  assert.equal(result.passed, true)
  assert.equal(result.skipped, true)
  assert.match(result.note, /未校验任何卷内清单/)
})

test('交付卷形态：射程为空 + SOP 描述已过时 → 仍然判红（静态半不依赖产物在场）', () => {
  // 这条与上一条成对：跳过只让**动态半**沉默，不能把静态半一起豁免掉。
  const stale = SOP_OK.replace('本节不复述清单。', '把 DMG 里的 app 拖到 `/Applications`。')
  const result = checkDmgLayout({ sopText: stale, guideText: GUIDE, artifacts: [] })
  // 跳过只在「静态半也无可指摘」时成立；静态半一旦说话，本项就是 fail，不是 skip。
  assert.equal(result.skipped, false)
  assertRed(result, '拖拽式交付形态')
})

test('交付卷形态：同一句话写在「」引用里 → 判绿（判据不得把它自己要求的修复判成缺陷）', () => {
  // 2026-09-13 实测：SOP 已按 ADR-0077 改成「**不要**试图把某个 `.app` 拖进 /Applications」，
  // 但同一段里按修复方案的要求**原址保留**了旧措辞做说明，而旧措辞逐字命中黑名单——
  // 于是本项持续判红，红在**正确的写法**上。判据与它守的修复自相矛盾，属 P-02 的镜像：
  // 不是「该红时绿」，而是「该绿时红」，后果同样是把判据关掉。
  // 这条与上一条成对：**同一句话**，裸着写判红、写在引用里判绿——差别只能是引用。
  const quoted = SOP_OK.replace(
    '本节不复述清单。',
    '**不要**试图把某个 `.app` 拖进 `/Applications`（本 SOP 曾把这一步写成'
      + '「把 DMG 里的 app 拖到 `/Applications`」，见 P-14）。',
  )
  const result = checkDmgLayout({ sopText: quoted, guideText: GUIDE, artifacts: [] })
  assert.deepEqual(result.violations, [], `引用不该被判成断言，实得：${result.violations.join('；')}`)
  assert.notEqual(result.passed, false)
})

test('交付卷形态：剥引用只剥引用——把断言包进「」逃逸的写法仍被判红（残留缺口的边界）', () => {
  // 诚实划界：剥引用之后，写在「」里的**活断言**会被漏掉。这里把它钉成已知行为，
  // 免得日后有人以为本项守得住它。要守它得引入「这句引文出现在谁的话里」的语义判断，
  // 不是一行正则的事——不假装。
  const smuggled = SOP_OK.replace('本节不复述清单。', '请把 app「拖到 `/Applications`」。')
  const result = checkDmgLayout({ sopText: smuggled, guideText: GUIDE, artifacts: [] })
  assert.equal(result.violations.length, 0, '已知缺口：引用内的活断言会被漏掉（见模块注释的诚实划界）')
})

test('交付卷形态：入口表解析——多名字一行要拆开，目录名尾斜杠要去掉', () => {
  const entries = parseGuideEntries(GUIDE)
  const names = entries.map((entry) => entry.name)
  assert.ok(names.includes('README.md'), '「A / B / C」一行必须拆成多个条目')
  assert.ok(names.includes('tools'), 'tools/ 必须归一化成 tools')
  assert.ok(!names.includes('你看到的'), '表头不得被当成条目')
  assert.deepEqual(
    entries.filter((entry) => entry.clickable).map((entry) => entry.name),
    ['LUTE Setup.app', 'install.sh'],
    '「可点入口」的标记在用法列，不在首列',
  )
})

test('交付卷形态：产物给多份（卷 + payload）时逐份比对，任一份不符即红', () => {
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: GUIDE,
    artifacts: [
      { label: '/Volumes/DSH Desktop LUTE 2.3.3', entries: REAL_VOLUME },
      { label: 'packaging/staging/2.3.4/payload', entries: [...REAL_VOLUME, 'stray.tmp'] },
    ],
  })
  assertRed(result, 'packaging/staging/2.3.4/payload')
  assertRed(result, 'stray.tmp')
})

test('交付卷形态：Finder 噪声（.DS_Store 等）不参与比对，不制造误报', () => {
  // 会误报的校验很快会被当成噪声关掉——那等于把判据删了（P-02）。
  const result = checkDmgLayout({
    sopText: SOP_OK,
    guideText: GUIDE,
    artifacts: realArtifacts([...REAL_VOLUME, '.DS_Store', '.VolumeIcon.icns', '.fseventsd']),
  })
  assert.equal(result.passed, true, result.violations.join('\n'))
})

test('交付卷形态：导出常量指向真实的两个文件（防止判据自己变成死指针）', () => {
  assert.equal(SOP_REL_PATH, 'docs/sop/dmg-release.md')
  assert.equal(GUIDE_REL_PATH, 'packaging/INSTALL-GUIDE.md')
})

// ── 射程判据（P-11 / ADR-0075：跟着 git 走，不跟着磁盘走） ──────────────────────

test('射程：已打 tag 的卷与 payload 退出扫描，并在读数里点名「谁退出了、为什么」', () => {
  // 下一版往载荷里加一个文件、手册随之更新，所有还挂载着的旧卷就会永久判红——
  // 而那条红与「手册和当前载荷对不上」在输出上不可区分，清理挂载于是成了让它变绿的唯一手段。
  const scope = selectLayoutTargets({
    volumes: [
      { label: '/Volumes/DSH Desktop LUTE 2.3.3', version: '2.3.3' },
      { label: '/Volumes/DSH Desktop LUTE 2.3.4', version: '2.3.4' },
    ],
    payloadVersions: ['2.3.3', '2.3.4'],
    taggedVersions: ['2.3.3'],
  })

  assert.deepEqual(scope.scanVolumes.map((v) => v.label), ['/Volumes/DSH Desktop LUTE 2.3.4'])
  assert.deepEqual(scope.scanPayloads, ['2.3.4'])
  assert.deepEqual(scope.retired, ['2.3.3'])
  assert.equal(scope.vacuous, false)
  assert.match(scope.note, /不参与：2\.3\.3/)
})

test('射程：读不到任何 tag 时全部纳入（默认错误方向选「多量」而不是放行）', () => {
  const scope = selectLayoutTargets({
    volumes: [{ label: '/Volumes/DSH Desktop LUTE 2.3.3', version: '2.3.3' }],
    payloadVersions: ['2.2.0', '2.3.3'],
    taggedVersions: [],
  })

  assert.equal(scope.scanVolumes.length, 1)
  assert.deepEqual(scope.scanPayloads, ['2.2.0', '2.3.3'])
  assert.deepEqual(scope.retired, [])
})

test('射程：卷名解析不出版本号时纳入扫描，不得因「说不清是哪版」而静默放行', () => {
  const scope = selectLayoutTargets({
    volumes: [{ label: '/Volumes/DSH Desktop LUTE nightly', version: undefined }],
    payloadVersions: [],
    taggedVersions: ['2.3.3'],
  })

  assert.equal(scope.scanVolumes.length, 1)
  assert.deepEqual(scope.retired, [])
  assert.equal(scope.vacuous, false)
})

test('射程：全部退出时 vacuous 为真——「没量到任何东西」必须与「都合格」分开报', () => {
  const scope = selectLayoutTargets({
    volumes: [{ label: '/Volumes/DSH Desktop LUTE 2.3.3', version: '2.3.3' }],
    payloadVersions: ['2.3.3'],
    taggedVersions: ['2.3.3'],
  })

  assert.equal(scope.vacuous, true)
  assert.match(scope.note, /扫描面为空/)
})
