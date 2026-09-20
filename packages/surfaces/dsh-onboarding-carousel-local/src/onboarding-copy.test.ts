import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  INTRO_ACK_FIELD,
  INTRO_COPY,
  INTRO_PAGES,
  INTRO_SETTINGS_NAMESPACE,
  INTRO_VERSION,
  UPSTREAM_NOTICE_ACK_FIELD,
  UPSTREAM_NOTICE_NAMESPACE,
  UPSTREAM_NOTICE_VERSION,
} from './onboarding-copy.js'

describe('sanbao intro copy', () => {
  it('ships three pages with unique ids and resolvable copy keys', () => {
    expect(INTRO_PAGES).toHaveLength(3)
    expect(new Set(INTRO_PAGES.map(page => page.id)).size).toBe(INTRO_PAGES.length)
    for (const page of INTRO_PAGES) {
      for (const dictionary of [INTRO_COPY.zh, INTRO_COPY.en]) {
        expect(dictionary[page.titleKey], page.titleKey).toBeTruthy()
        expect(dictionary[page.bodyKey], page.bodyKey).toBeTruthy()
      }
    }
  })

  it('keeps the action labels every page path needs', () => {
    for (const dictionary of [INTRO_COPY.zh, INTRO_COPY.en]) {
      for (const key of ['action.skip', 'action.next', 'action.start']) {
        expect(dictionary[key], key).toBeTruthy()
      }
    }
  })

  it('acknowledges a versioned field in its own namespace', () => {
    expect(INTRO_SETTINGS_NAMESPACE).toBe('sanbao-onboarding')
    expect(INTRO_ACK_FIELD).toBe('introVersion')
    expect(INTRO_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/u)
  })

  it('pins the upstream notice version it acknowledges on the user\'s behalf', async () => {
    expect(UPSTREAM_NOTICE_NAMESPACE).toBe('ui-onboarding')
    expect(UPSTREAM_NOTICE_ACK_FIELD).toBe('welcomeNoticeVersion')
    // 上游内测声明的版本常量在 vendor 参照里；参照未初始化时跳过，仍由真实应用验收兜底。
    const source = await readFile(
      new URL('../../../vendor/dsh-desktop/deepseek-harness/packages/client/ui-settings-models/src/onboarding-copy.ts', import.meta.url),
      'utf8',
    ).catch(() => undefined)
    if (source === undefined) return
    const match = /WELCOME_NOTICE_VERSION = ['"]([^'"]+)['"]/u.exec(source)
    expect(match, 'upstream notice version constant must stay greppable').not.toBeNull()
    expect(UPSTREAM_NOTICE_VERSION).toBe(match?.[1])
  })
})
