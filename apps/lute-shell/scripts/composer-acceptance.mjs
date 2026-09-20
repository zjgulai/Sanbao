import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const requireBrowser = createRequire(process.env.LUTE_PLAYWRIGHT_PACKAGE ?? resolve(import.meta.dirname, '../package.json'))
const { chromium } = requireBrowser('playwright-core')
const endpoint = process.env.LUTE_COMPOSER_CDP ?? 'http://127.0.0.1:9463'
const evidence = resolve(process.env.LUTE_COMPOSER_EVIDENCE ?? resolve(import.meta.dirname, '../../../.composer-preview/evidence'))
const browser = await chromium.connectOverCDP(endpoint)
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url() === 'dsh-app://app/index.html')
assert.ok(page, 'The shell application must already be open')
const results = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
const check = (name, value) => {
  assert.ok(value, name)
  results.push(name)
  console.log(`PASS ${name}`)
}
const composer = page.locator('[data-sanbao-composer]')
const editor = composer.locator('[contenteditable=true]')
const send = () => composer.getByRole('button', { name: '发送消息', exact: true })
const stop = () => composer.getByRole('button', { name: '停止生成', exact: true })
const reply = page.getByText('本地测试回复：已走通输入、宿主、流式响应和消息呈现。', { exact: true })
const waitUntil = async predicate => {
  await page.waitForFunction(predicate, undefined, { timeout: 15000 })
}

try {
  await mkdir(evidence, { recursive: true })
  await composer.waitFor({ timeout: 20000 })
  const heroHint = '描述你想要构建的内容, / 调用指令, @ 文件或对话'
  const modelSeat = page.getByRole('button', { name: '选择模型，当前 测试', exact: true })
  check('model seat shows a two-character label', await modelSeat.isVisible())
  const modelMenu = page.getByRole('menu', { name: '模型与推理等级' })
  // 启动后组合仍在收敛，落在重渲染窗口里的点击会丢；有界重试，三次仍不开就照常失败。
  for (let attempt = 0; ; attempt += 1) {
    if (!await modelMenu.isVisible()) await modelSeat.click()
    try {
      await modelMenu.waitFor({ timeout: 4000 })
      break
    } catch (error) {
      if (attempt >= 2) throw error
    }
  }
  await modelMenu.getByRole('menuitem').first().click()
  const fixtureGroup = modelMenu.locator('section[role=group]', { hasText: '非真实模型' })
  await fixtureGroup.waitFor({ timeout: 5000 })
  check('test-only model is identified in the model menu', await fixtureGroup.isVisible()
    && (await fixtureGroup.getByRole('menuitemradio', { checked: true }).innerText()).trim() === '测试')
  await page.keyboard.press('Escape')
  const permission = composer.locator('button[aria-label="访问模式，当前：工作区内修改"]')
  check('permission trigger shows 可改 while aria and tooltip keep the full name', await permission.isVisible()
    && (await permission.innerText()).trim() === '可改'
    && await permission.getAttribute('title') === '工作区内修改')
  const presetSeat = page.locator('button[title="标准模式 · 即将开始的这个会话所用的 Agent 预设"]')
  check('preset seat shows 标准 while hover keeps the full preset name', await presetSeat.isVisible()
    && (await presetSeat.innerText()).trim() === '标准')
  const workspace = composer.locator('button[aria-label="选择工作区"]')
  check('workspace chip shows 项目 while the picker keeps its accessible name', await workspace.isVisible()
    && (await workspace.innerText()).trim() === '项目')
  const placeholder = composer.locator('[data-composer-placeholder]')
  check('placeholder is minimal while the editor keeps the full hint', (await placeholder.innerText()).trim() === '输入'
    && await editor.getAttribute('data-placeholder') === heroHint
    && await editor.getAttribute('aria-label') === heroHint)
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
  await editor.waitFor()
  check('one live input editor', await editor.count() === 1)
  await editor.fill('兼容性验收第一行')
  await editor.press('Shift+Enter')
  await editor.press('x')
  check('Shift Enter adds a line without submitting', /第一行\nx/u.test(await editor.innerText()))
  await editor.fill('/')
  await page.getByRole('listbox').waitFor()
  check('slash menu contains real commands', (await page.getByRole('listbox').innerText()).includes('permission'))
  await editor.press('Escape')
  await editor.fill('附件验收')
  await composer.locator('input[type=file]').setInputFiles({ name: 'compatibility.txt', mimeType: 'text/plain', buffer: Buffer.from('local-only acceptance') })
  await page.getByRole('button', { name: '移除文件 compatibility.txt', exact: true }).waitFor()
  await waitUntil(() => !document.querySelector('[data-sanbao-composer] button[aria-label="发送消息"]').disabled)
  check('file upload settles and enables send', await send().isEnabled())
  await page.getByRole('button', { name: '移除文件 compatibility.txt', exact: true }).click()
  check('attachment removal updates the rail', await page.getByRole('group', { name: '待发送附件' }).count() === 0)

  await editor.fill('fixture:hello compatibility')
  const previousReplies = await reply.count()
  await send().click()
  await reply.nth(previousReplies).waitFor({ timeout: 15000 })
  await send().waitFor()
  check('prompt traverses host and returns a rendered response', await reply.count() === previousReplies + 1)
  check('successful send clears the draft', (await editor.innerText()).trim() === '')

  await editor.fill('fixture:slow cancellation')
  await send().click()
  await stop().click({ timeout: 5000 })
  await send().waitFor({ timeout: 10000 })
  check('stop returns to editable idle', await editor.isEditable())

  await editor.fill('fixture:slow queue')
  await send().click()
  await stop().waitFor({ timeout: 5000 })
  await editor.fill('queued compatibility message')
  await composer.getByRole('button', { name: '排队发送', exact: true }).click()
  const queued = page.getByRole('button', { name: '删除排队消息', exact: true })
  await waitUntil(() => [...document.querySelectorAll('button')].some(button => button.getAttribute('aria-label') === '删除排队消息' && !button.disabled))
  await stop().click()
  await send().waitFor({ timeout: 10000 })
  check('stopping preserves the queued message', await queued.isVisible())
  await queued.click()
  await queued.waitFor({ state: 'hidden' })
  check('queued message can be removed', await queued.count() === 0)

  for (const decision of ['拒绝', '允许一次']) {
    await editor.fill('fixture:approval')
    await send().click()
    const action = page.getByRole('button', { name: decision, exact: true })
    await action.waitFor({ timeout: 8000 })
    check(`approval exposes ${decision}`, await action.isEnabled())
    await action.click()
    await send().waitFor({ timeout: 10000 })
    check(`approval ${decision} returns to the composer`, await editor.isEditable())
  }

  await editor.fill('fixture:error')
  await send().click()
  await page.getByText('本地验收故障注入', { exact: false }).first().waitFor({ timeout: 8000 })
  await send().waitFor()
  check('failed run displays its error without losing the composer', await editor.isEditable())
  await editor.fill('刷新保留的草稿')
  await page.reload()
  await editor.waitFor()
  check('refresh restores the draft', (await editor.innerText()).trim() === '刷新保留的草稿')

  await page.getByRole('button', { name: '添加工作区', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选择工作区目录' })
  await picker.waitFor({ timeout: 15000 })
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await picker.waitFor({ state: 'hidden', timeout: 5000 })
  check('dismissed project selection preserves the draft', (await editor.innerText()).trim() === '刷新保留的草稿')

  await page.setViewportSize({ width: 900, height: 680 })
  await editor.fill('长文本与窄窗口验收。'.repeat(400))
  const geometry = await composer.evaluate(element => {
    const scroller = element.querySelector('[data-input-scroll]')
    return {
      scrollable: scroller.scrollHeight > scroller.clientHeight,
      escapedButtons: [...element.querySelectorAll('button')].filter(button => {
        const box = button.getBoundingClientRect()
        return box.width > 0 && (box.left < 0 || box.right > innerWidth)
      }).length,
    }
  })
  check('long text scrolls within the composer', geometry.scrollable)
  check('all composer buttons stay inside a narrow viewport', geometry.escapedButtons === 0)
  await page.screenshot({ path: resolve(evidence, 'composer-narrow.png') })
  await editor.fill('')
  await page.setViewportSize({ width: 1280, height: 812 })
  await page.screenshot({ path: resolve(evidence, 'composer-final.png') })
  check('no uncaught renderer errors', errors.length === 0)
  await writeFile(resolve(evidence, 'acceptance.json'), JSON.stringify({ endpoint, model: 'local fixture, not a real LLM; the disclosure stays in the model menu provider group', passed: results, rendererErrors: errors }, null, 2))
  console.log(`PASS ${results.length} composer acceptance checks; evidence: ${evidence}`)
} catch (error) {
  await writeFile(resolve(evidence, 'acceptance-failed.json'), JSON.stringify({ passed: results, rendererErrors: errors, failure: String(error), snapshot: await page.locator('body').ariaSnapshot() }, null, 2))
  throw error
} finally {
  await browser.close()
}
