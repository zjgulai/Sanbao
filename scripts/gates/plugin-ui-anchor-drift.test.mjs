/**
 * `plugin-ui-anchor-drift` 判据的反向自测。
 *
 * 这一层要证明两件事，缺一不可：
 *   ①**能说「不」**：2.0.10 真实产物形态下的缺陷（`headlineText` 局部名消失、
 *     `StatsLine.module.css` 整个模块消失）必须判红，且两种原因**可区分**；
 *   ②**能说「是」**：同一判据对旧基座（持有 `headlineText` 的那代）必须判绿——
 *     恒判红的仪器与恒判绿的仪器一样没用，只是死法不同。
 *
 * 另有第 ③ 件：**恒真桩突变**。用一个「候选为空也算通过」的桩跑同一个缺陷样本，
 * 断言它不再判红——用来证明上面那条红是承重的，不是巧合。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classNameCandidates,
  describeMiss,
  extractModuleCss,
  judgeDeclaredAnchors,
  parseAnchorManifest,
} from './plugin-ui-anchor-drift.mjs'

const HERO_MODULE = '@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css'
const STATS_MODULE = '@deepseek-ai/dsh-client-ui-chat/StatsLine.module.css'

/**
 * 2.0.10（装机实测）的 `HeroShell.module.css` 局部名，逐字抄自产物：
 * `root, stack, headline, titleGroup, previewBadge, fishHitbox, fish, body,
 *  workspaceRow, workspace, folder, workspaceLabel, chevron, modalInput, modalAction, modalError`。
 * **没有 `headlineText`**——这正是本次故障的原文。
 */
const HERO_CSS_2_0_10 = [
  '.sro9dq_root{display:flex}',
  '.sro9dq_stack{display:flex}',
  '.sro9dq_headline{display:flex;font-size:26px}',
  '.sro9dq_titleGroup{display:flex;gap:4px 7px}',
  '.sro9dq_previewBadge{border-radius:24px}',
  '.sro9dq_fishHitbox{display:inline-flex}',
  '.sro9dq_fish{display:block}',
  '.sro9dq_body{display:flex}',
  '.sro9dq_workspaceRow{display:flex}',
  '.sro9dq_workspace{min-height:28px}',
  '.sro9dq_folder{display:block}',
  '.sro9dq_workspaceLabel{overflow:hidden}',
  '.sro9dq_chevron{display:block}',
  '.sro9dq_modalInput{width:100%}',
  '.sro9dq_modalAction{display:inline-flex}',
  '.sro9dq_modalError{color:red}',
].join('')

/** 旧基座（2.0.5）的同一模块：那时标题文本是**独立元素** `headlineText`。 */
const HERO_CSS_2_0_5 = [
  '.zNic4G_root{display:grid}',
  '.zNic4G_headline{display:grid;grid-template-columns:34px auto auto}',
  '.zNic4G_headlineText{font-size:26px}',
  '.zNic4G_previewBadge{border-radius:24px}',
  '.zNic4G_fishHitbox{display:inline-flex}',
].join('')

/**
 * 旧基座的统计条模块（2.0.10 起整个模块消失，换成 `StatsPills.module.css`）。
 * 前缀 `q2FAPq` 抄自归档产物 `dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-chat-client.js.orig`
 * 里真实的 `q2FAPq_root`。
 */
const STATS_CSS_2_0_5 = '.q2FAPq_root{display:flex}.q2FAPq_sep{color:gray}'

/**
 * 2.0.4 归档产物里**真实存在**的含连字符前缀（实测 `U-8p4G_root`）。
 * 用它钉住「前缀形态超出字符集」这条诊断——它与「上游没有这个局部名」必须分开说。
 */
const HYPHENATED_CSS = '.U-8p4G_root{display:flex}'

const anchor = (overrides = {}) => ({
  id: 'heroPreviewBadge',
  moduleId: HERO_MODULE,
  localName: 'previewBadge',
  purpose: '测试用',
  origin: 'ui-anchors.json（测试）',
  ...overrides,
})

test('类名候选：唯一前缀胜出，前缀后不得紧跟标识符字符', () => {
  assert.deepEqual(classNameCandidates(HERO_CSS_2_0_10, 'previewBadge'), ['sro9dq_previewBadge'])
  // `headline` 不得误配到以它开头的其它局部名（旧基座里同时有 headline 与 headlineText）
  assert.deepEqual(classNameCandidates(HERO_CSS_2_0_5, 'headline'), ['zNic4G_headline'])
})

test('缺陷原文：2.0.10 没有 headlineText → 判红，且原因点名「没有这个局部名」', () => {
  const declared = [anchor({ id: 'heroHeadlineText', localName: 'headlineText' })]
  const { checked, failures } = judgeDeclaredAnchors(declared, () => ({ css: HERO_CSS_2_0_10 }))
  assert.equal(checked, 0)
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason, /没有 headlineText 这个局部名/)
  assert.equal(failures[0].origin, 'ui-anchors.json（测试）')
})

test('缺陷原文（第二处）：StatsLine 整个模块消失 → 原因与「没有这个局部名」不同', () => {
  const declared = [anchor({ id: 'statsLineRoot', moduleId: STATS_MODULE, localName: 'root' })]
  const { failures } = judgeDeclaredAnchors(declared, (moduleId) =>
    moduleId === STATS_MODULE
      ? { reason: `产物里没有这个包（@deepseek-ai/dsh-client-ui-chat）——上游改名或换了包` }
      : { css: '' },
  )
  assert.equal(failures.length, 1)
  assert.doesNotMatch(failures[0].reason, /没有 root 这个局部名/)
  assert.match(failures[0].reason, /没有这个包/)
})

test('能说「是」：旧基座（2.0.5 的 headlineText）必须判绿', () => {
  const declared = [
    anchor({ id: 'heroHeadline', localName: 'headline' }),
    anchor({ id: 'heroHeadlineText', localName: 'headlineText' }),
    anchor({ id: 'heroPreviewBadge', localName: 'previewBadge' }),
  ]
  const { checked, failures, resolved } = judgeDeclaredAnchors(declared, () => ({ css: HERO_CSS_2_0_5 }))
  assert.equal(failures.length, 0)
  assert.equal(checked, 3)
  assert.deepEqual(
    resolved.map((hit) => hit.className),
    ['zNic4G_headline', 'zNic4G_headlineText', 'zNic4G_previewBadge'],
  )
})

test('旧基座的统计条锚也必须判绿（同一判据、另一份 CSS）', () => {
  const declared = [anchor({ id: 'statsLineRoot', moduleId: STATS_MODULE, localName: 'root' })]
  const { checked, failures } = judgeDeclaredAnchors(declared, () => ({ css: STATS_CSS_2_0_5 }))
  assert.equal(failures.length, 0)
  assert.equal(checked, 1)
})

test('前缀不唯一 → 判红而不是挑一个', () => {
  const css = '.aaaaaa_root{} .bbbbbb_root{}'
  const declared = [anchor({ id: 'statsLineRoot', moduleId: STATS_MODULE, localName: 'root' })]
  const { checked, failures } = judgeDeclaredAnchors(declared, () => ({ css }))
  assert.equal(checked, 0)
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason, /前缀不唯一（2 个/)
})

test('恒真桩突变：把「候选为空」当成通过时，缺陷样本不再判红', () => {
  const declared = [anchor({ id: 'heroHeadlineText', localName: 'headlineText' })]
  const loadCss = () => ({ css: HERO_CSS_2_0_10 })

  // 真判据：判红
  assert.equal(judgeDeclaredAnchors(declared, loadCss).failures.length, 1)

  // 突变判据：与真判据同构，唯独把 `candidates.length === 1` 放宽成 `candidates.length <= 1`
  const mutated = (declaredAnchors, loader) => {
    const resolvedStub = []
    const failuresStub = []
    for (const entry of declaredAnchors) {
      const loaded = loader(entry.moduleId)
      const candidates = 'css' in loaded ? classNameCandidates(loaded.css, entry.localName) : []
      if (candidates.length <= 1) resolvedStub.push({ id: entry.id, className: candidates[0] ?? '' })
      else failuresStub.push({ ...entry, reason: '不唯一' })
    }
    return { checked: resolvedStub.length, resolved: resolvedStub, failures: failuresStub }
  }
  assert.equal(mutated(declared, loadCss).failures.length, 0, '突变必须让用例失效——否则红不是承重的')
})

test('产物读取：从官方产物形态里取出 CSS；模块 id 不在时返回 null（与「0 个候选」不同）', () => {
  const source = `const css$5 = ${JSON.stringify(HERO_CSS_2_0_10)};var X={};` +
    'document.querySelector("style[data-plugin-css=" + JSON.stringify("@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css") + "]")'
  assert.equal(extractModuleCss(source, HERO_MODULE), HERO_CSS_2_0_10)
  // 模块 id 不在产物里 → null（调用方按「读不出」报，不按「0 个候选」报）
  assert.equal(extractModuleCss(source, STATS_MODULE), null)
  // 模块 id 在、但它前面的 CSS 常量不合法 → 也是 null
  const broken = 'const css$1 = "unterminated;' + JSON.stringify(HERO_MODULE)
  assert.equal(extractModuleCss(broken, HERO_MODULE), null)
})

test('清单结构校验：四种坏形态都判红，不得被读成「没有锚」', () => {
  const cases = [
    { raw: null, pattern: /清单根必须是对象/ },
    { raw: [], pattern: /清单根必须是对象/ },
    { raw: { anchors: 'nope' }, pattern: /anchors 必须是数组/ },
    { raw: { anchors: [{ module: HERO_MODULE, local: 'previewBadge' }] }, pattern: /缺失或不是非空字符串/ },
  ]
  for (const { raw, pattern } of cases) {
    const { anchors, errors } = parseAnchorManifest(raw, 'ui-anchors.json')
    assert.equal(anchors.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0], pattern)
  }
})

test('清单结构校验：id 重复判红（同一语义键只能声明一次）', () => {
  const raw = { anchors: [anchor(), anchor({ localName: 'headline' })] }
  const { anchors, errors } = parseAnchorManifest(raw, 'ui-anchors.json')
  assert.equal(anchors.length, 1)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /id 重复/)
})

test('清单结构校验：合法清单原样读出，purpose 可缺省', () => {
  const raw = { anchors: [anchor({ purpose: undefined })] }
  const { anchors, errors } = parseAnchorManifest(raw, 'ui-anchors.json')
  assert.equal(errors.length, 0)
  assert.equal(anchors.length, 1)
  assert.equal(anchors[0].purpose, '')
})

test('前缀形态超出字符集时，报的是「形态不认识」而不是「没有这个局部名」', () => {
  // 判据与插件共同认识的字符集里，含连字符前缀解析不出候选
  assert.deepEqual(classNameCandidates(HYPHENATED_CSS, 'root'), [])

  const miss = describeMiss(HYPHENATED_CSS, 'root', STATS_MODULE)
  assert.match(miss, /前缀形态（U-8p4G）超出/)
  assert.match(miss, /插件与判据的前缀规则一起/)
  assert.doesNotMatch(miss, /没有 root 这个局部名/)

  // 真·改名：诊断必须说「没有这个局部名」
  const renamed = describeMiss(HERO_CSS_2_0_10, 'headlineText', HERO_MODULE)
  assert.match(renamed, /没有 headlineText 这个局部名/)
  assert.doesNotMatch(renamed, /前缀形态/)
})
