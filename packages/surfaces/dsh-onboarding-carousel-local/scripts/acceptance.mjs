/**
 * Acceptance for the first-run carousel against a running shell.
 *
 * Drives the real app over CDP: the carousel must replace the shipped
 * first-run cards, page through its copy, acknowledge on finish, and stay
 * acknowledged across a reload — with the upstream internal-testing notice
 * never surfacing. Evidence lands in the path given by LUTE_ONBOARDING_EVIDENCE.
 *
 * Requires: an app already open on the CDP endpoint, a blank (new) session
 * reachable through 新建会话, and LUTE_DSH_HOME pointing at that app's DSH home
 * so the durable settings document can be read back.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const requireBrowser = createRequire(process.env.LUTE_PLAYWRIGHT_PACKAGE ?? resolve(import.meta.dirname, '../package.json'))
const { chromium } = requireBrowser('playwright-core')
const endpoint = process.env.LUTE_ONBOARDING_CDP ?? 'http://127.0.0.1:9463'
const dshHome = process.env.LUTE_DSH_HOME
const evidence = resolve(process.env.LUTE_ONBOARDING_EVIDENCE ?? resolve(import.meta.dirname, '../../../.onboarding-preview/evidence'))

const browser = await chromium.connectOverCDP(endpoint)
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url() === 'dsh-app://app/index.html')
assert.ok(page, 'the shell application must already be open')

const results = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
const check = (name, value) => {
  assert.ok(value, name)
  results.push(name)
  console.log(`PASS ${name}`)
}
const carousel = page.locator('[data-sanbao-intro]')
const waitText = async (locator, text) => {
  await locator.waitFor({ timeout: 10000 })
  assert.equal((await locator.innerText()).trim(), text)
}

try {
  await mkdir(evidence, { recursive: true })
  await page.locator('[data-sanbao-intro], [contenteditable=true]').first().waitFor({ timeout: 25000 })
  if (!await carousel.isVisible()) {
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
  }
  await carousel.waitFor({ timeout: 15000 })
  check('the intro carousel takes over the first-run surface', await carousel.isVisible())

  const card = carousel.locator('.soc-card')
  check('the carousel opens on the brand page', await carousel.getAttribute('data-page') === 'brand')
  check('page one carries the slogan', (await card.locator('h2').innerText()).trim() === '三宝出海，货通四方')
  check('the skip exit is offered', await card.getByRole('button', { name: '跳过', exact: true }).isVisible())
  check('the upstream internal-testing notice is gone', !(await page.locator('body').innerText()).includes('内测声明'))

  await card.getByRole('button', { name: '下一步', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-sanbao-intro]')?.getAttribute('data-page') === 'ability')
  check('the second page explains the workbench', (await card.locator('h2').innerText()).trim() === '一个输入框，装着全部')

  await card.getByRole('button', { name: '下一步', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-sanbao-intro]')?.getAttribute('data-page') === 'start')
  await waitText(card.getByRole('button', { name: '开始使用', exact: true }), '开始使用')
  check('the last page offers the single primary exit', await card.getByRole('button', { name: '下一步', exact: true }).count() === 0)

  await card.getByRole('button', { name: '开始使用', exact: true }).click()
  await carousel.waitFor({ state: 'hidden', timeout: 10000 })
  check('finishing dismisses the carousel', await carousel.count() === 0 || !await carousel.isVisible())

  await page.waitForTimeout(1500)
  check('the upstream internal-testing notice never queues behind it', !(await page.locator('body').innerText()).includes('内测声明'))
  check('the working surface is reachable straight after the intro', await page.getByRole('button', { name: '新建会话', exact: true }).first().isVisible())

  const document = dshHome === undefined
    ? undefined
    : await readFile(resolve(dshHome, 'settings.yaml'), 'utf8').catch(() => undefined)
  if (document !== undefined) {
    check('the intro acknowledgement is durable', /sanbao-onboarding:[\s\S]*introVersion: '?2026-09-20\.1/u.test(document))
    // The exact upstream version constant is pinned by src/onboarding-copy.test.ts against the vendor source.
    check('the upstream notice version is acknowledged', /ui-onboarding:[\s\S]*welcomeNoticeVersion:/u.test(document))
  } else {
    console.log('SKIP durable acknowledgement read (LUTE_DSH_HOME unset or unreadable)')
  }

  await page.reload()
  await page.getByRole('button', { name: '新建会话', exact: true }).first().waitFor({ timeout: 25000 })
  await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
  await page.waitForTimeout(2500)
  check('an acknowledged install never sees the carousel again', !await carousel.isVisible())
  check('nor the upstream notice', !(await page.locator('body').innerText()).includes('内测声明'))
  check('no uncaught renderer errors', errors.length === 0)

  await writeFile(resolve(evidence, 'acceptance.json'), JSON.stringify({ endpoint, passed: results, rendererErrors: errors }, null, 2))
  console.log(`PASS ${results.length} onboarding acceptance checks; evidence: ${evidence}`)
} catch (error) {
  await writeFile(resolve(evidence, 'acceptance-failed.json'), JSON.stringify({ passed: results, rendererErrors: errors, failure: String(error) }, null, 2))
  throw error
} finally {
  await browser.close()
}
