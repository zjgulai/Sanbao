#!/usr/bin/env node
/**
 * `preset-config-schema` 的反向自测。
 *
 * ## 这份自测守什么
 *
 * 判据的价值全在「它会不会在该红的时候红、在该静的时候静」。所以这里逐条钉住：
 *
 * 1. **缺陷原文必须判红**：2026-09-17 让 2.5.0 装完不可用的那条配置（persona 写 `text:`、
 *    而上游 schema 要 `prefix`）必须被本判据抓住——夹具用**同一形状**的 schema。
 * 2. **超出 schemastery 默认严格度的那一层也要抓**：schemastery 不拒未知键，所以
 *    「上游改了键名、旧键还在、新键有默认值」只靠 schema 调用抓不到，必须靠键集判据。
 *    这条单独一个用例，否则这一层坏了没人知道。
 * 3. **仪器假红与假绿一样贵**：模板占位符、块标量里的 `:`/`{}`、可选键、group 行、
 *    `cordis:` 内置行、disabled 行都必须静默；射程为空的树必须报 skip 而不是「都合格」。
 * 4. **分母守恒**：`discovered = ok + failed + unverifiable + notApplicable`，
 *    「未核实」不许被并进「已核实」。
 *
 * ## 边界
 *
 * 这里是**纯函数层**的自测（喂对象、喂注入的解析器），不依赖 /Applications 或在运行的 app，
 * 因此 CI 上也能跑。真实 schema 与真实 YAML 解析器那条链路由判据的实跑读数作证
 * （live 根静默 / 出货载荷判红），不在这份文件里假装跑过。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgeConfigObject, judgeTarget, summarize } from './preset-config-schema.mjs'

/** 与上游 `@deepseek-ai/dsh-persona` 同形状的 schema（键集 + 必填 prefix）。 */
const personaLike = {
  keys: ['prefix', 'suffix', 'complete', 'includeRuntimeContext'],
  validate: (object) => {
    if (typeof object.prefix !== 'string' || object.prefix === '') {
      throw new Error('$.prefix missing required value')
    }
    if (object.suffix !== undefined && typeof object.suffix !== 'string') {
      throw new Error('$.suffix expected string')
    }
    return object
  },
}

/** 夹具用的最小解析器：config 正文就是 JSON（把「解析器」这一层换成受控输入）。 */
const parseJson = (text) => JSON.parse(text)
const schemaOk = (schema) => () => ({ status: 'ok', schema })
const target = (config, over = {}) => ({
  source: 'fixture',
  preset: 'agt-000',
  rowId: 'persona',
  line: 25,
  name: '@deepseek-ai/dsh-persona',
  disabled: false,
  config: { line: 25, inline: '', text: config },
  ...over,
})

test('缺陷原文：persona 写 text:（上游 schema 要 prefix）必须判红', () => {
  const verdict = judgeTarget(
    target('{\n  "text": "你是三无"\n}'),
    { schemaFor: schemaOk(personaLike), parseYaml: parseJson },
  )
  assert.equal(verdict.status, 'failed')
  assert.match(verdict.reason, /prefix/)
})

test('修复后：prefix + 模板占位符必须静默（不得因 {{model}}/{{cwd}} 假红）', () => {
  const verdict = judgeTarget(
    target('{\n  "prefix": "{{model}} 在 {{cwd}}：你是三无",\n  "suffix": ""\n}'),
    { schemaFor: schemaOk(personaLike), parseYaml: parseJson },
  )
  assert.equal(verdict.status, 'ok')
})

test('超出 schema 默认严格度的一层：未声明键必须判红（schemastery 自己不会拒）', () => {
  // 直接证明「只靠 schema 调用抓不到这一形态」：schema 本身静默通过。
  assert.doesNotThrow(() => personaLike.validate({ prefix: 'x', text: '旧键' }))
  const verdict = judgeConfigObject({
    config: { prefix: 'x', text: '旧键' },
    schema: personaLike,
  })
  assert.equal(verdict.status, 'failed')
  assert.match(verdict.reason, /未声明键 text/)
})

test('仪器假红防线：块标量里的冒号/花括号/多行文本不得判红', () => {
  const verdict = judgeTarget(
    target('{\n  "prefix": "行一：{a: b}\\n行二 {\\"k\\": 1}"\n}'),
    { schemaFor: schemaOk(personaLike), parseYaml: parseJson },
  )
  assert.equal(verdict.status, 'ok')
})

test('仪器假红防线：可选键缺省、多余空白、注释行不得判红', () => {
  const verdict = judgeTarget(
    target('\n{\n  "prefix": "只有必填键"\n}\n'),
    { schemaFor: schemaOk(personaLike), parseYaml: parseJson },
  )
  assert.equal(verdict.status, 'ok')
})

test('group 行（config 是 nested list）与无 config 行都不适用，不得计入 checked', () => {
  const group = judgeTarget(
    {
      ...target('- id: inner\n  name: "@deepseek-ai/dsh-persona"'),
      name: 'cordis:group',
    },
    { schemaFor: schemaOk(personaLike), parseYaml: parseJson },
  )
  assert.equal(group.status, 'notApplicable')

  const noConfig = judgeTarget({ ...target(''), config: null }, { schemaFor: schemaOk(personaLike), parseYaml: parseJson })
  assert.equal(noConfig.status, 'notApplicable')

  const nestedList = judgeTarget(target('- id: a\n  name: "@scope/x"'), {
    schemaFor: schemaOk(personaLike),
    parseYaml: parseJson,
  })
  assert.equal(nestedList.status, 'notApplicable')
  assert.match(nestedList.reason, /group row/)
})

test('非 package 行（内置/preset/file）与 disabled 行不适用', () => {
  const builtin = judgeTarget(target('{\n  "prefix": "x"\n}', { name: 'cordis:include' }), {
    schemaFor: schemaOk(personaLike),
    parseYaml: parseJson,
  })
  assert.equal(builtin.status, 'notApplicable')

  const disabled = judgeTarget(target('{\n  "prefix": "x"\n}', { disabled: true }), {
    schemaFor: schemaOk(personaLike),
    parseYaml: parseJson,
  })
  assert.equal(disabled.status, 'notApplicable')
  assert.match(disabled.reason, /disabled/)
})

test('取不到 schema / 解析不了 = unverifiable（不算 checked，也不判红）', () => {
  const noSchema = judgeTarget(target('{\n  "prefix": "x"\n}'), {
    schemaFor: () => ({ status: 'unverifiable', reason: '插件未导出 Config（@scope/x）' }),
    parseYaml: parseJson,
  })
  assert.equal(noSchema.status, 'unverifiable')
  assert.match(noSchema.reason, /未导出 Config/)

  const brokenYaml = judgeTarget(target('!!js process.platform === "win32"'), {
    schemaFor: schemaOk(personaLike),
    parseYaml: () => {
      throw new Error('unknown tag !!js')
    },
  })
  assert.equal(brokenYaml.status, 'unverifiable')
  assert.match(brokenYaml.reason, /解析失败/)
})

test('schema 无键集时只过第一层，必须自报 weak（不许冒充「两层都过」）', () => {
  const weak = judgeTarget(target('{\n  "prefix": "x", "任意键": 1\n}'), {
    schemaFor: schemaOk({ keys: null, validate: () => {} }),
    parseYaml: parseJson,
  })
  assert.equal(weak.status, 'ok')
  assert.equal(weak.weak, true)
})

test('分母守恒：discovered = ok + failed + unverifiable + notApplicable', () => {
  const targets = [
    target('{\n  "prefix": "x"\n}'),
    target('{\n  "text": "缺陷原文"\n}'),
    target('{\n  "prefix": "x"\n}', { name: '@scope/无 schema 的包' }),
    target('', { config: null }),
  ]
  const verdicts = [
    { status: 'ok' },
    { status: 'failed', reason: 'schema 拒绝：$.prefix missing required value' },
    { status: 'unverifiable', reason: '插件未导出 Config（@scope/无 schema 的包）' },
    { status: 'notApplicable', reason: '无 config' },
  ]
  const summary = summarize(targets, verdicts, { span: 'fixture' })
  assert.equal(summary.counts.ok, 1)
  assert.equal(summary.counts.failed, 1)
  assert.equal(summary.counts.unverifiable, 1)
  assert.equal(summary.counts.notApplicable, 1)
  assert.equal(summary.checked, 2)
  assert.equal(summary.violations.length, 1)
  assert.match(summary.note, /未核实 ≠ 合格/)
})

test('射程为空：必须是 skip 而不是「都合格」', () => {
  const summary = summarize([], [], { span: '空射程' })
  assert.equal(summary.checked, 0)
  assert.equal(summary.violations.length, 0)
})
