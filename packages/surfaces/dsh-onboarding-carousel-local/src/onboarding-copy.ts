/**
 * First-run carousel facts shared by the host entry and the client step:
 * the durable acknowledgement, the upstream notice this product replaces,
 * and the page copy.
 */

/** Durable settings namespace owning Sanbao first-run facts. */
export const INTRO_SETTINGS_NAMESPACE = 'sanbao-onboarding'

/** Field storing the intro version this install has already seen. */
export const INTRO_ACK_FIELD = 'introVersion'

/**
 * Bump only when the carousel copy changes materially and every install should
 * see it again; the acknowledgement is compared for exact equality.
 */
export const INTRO_VERSION = '2026-09-20.1'

/**
 * Upstream product-wide notice (`welcome-notice` step) that this carousel
 * replaces. Sanbao acknowledges it on the user's behalf when the carousel
 * finishes, so the DeepSeek internal-testing card never surfaces.
 */
export const UPSTREAM_NOTICE_NAMESPACE = 'ui-onboarding'

/** Field the upstream notice stores its acknowledged version in. */
export const UPSTREAM_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Copy of `WELCOME_NOTICE_VERSION` from the upstream
 * `@deepseek-ai/dsh-client-ui-settings-models` package. `src/onboarding-copy.test.ts`
 * compares it against the vendor reference so an upstream bump fails a test
 * instead of silently resurrecting the notice.
 */
export const UPSTREAM_NOTICE_VERSION = '2026-08-13.1'

/** Durable section shape this package owns. */
export interface IntroSection {
  introVersion?: string
}

/** One carousel page, resolved through the locale dictionaries below. */
export interface IntroPage {
  readonly id: string
  readonly titleKey: string
  readonly bodyKey: string
}

/**
 * The three intro pages. Copy stays inside what the product does today —
 * cloud execution and invitation-only accounts land later and must not be
 * promised here before they exist.
 */
export const INTRO_PAGES: readonly IntroPage[] = [
  { id: 'brand', titleKey: 'page.brand.title', bodyKey: 'page.brand.body' },
  { id: 'ability', titleKey: 'page.ability.title', bodyKey: 'page.ability.body' },
  { id: 'start', titleKey: 'page.start.title', bodyKey: 'page.start.body' },
]

/** Locale dictionaries for the carousel, registered under {@link INTRO_LOCALE_NS}. */
export const INTRO_LOCALE_NS = 'sanbao-onboarding'

export const INTRO_COPY: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    'page.brand.title': '三宝出海，货通四方',
    'page.brand.body': '把想做的事说出来，剩下的交给它。',
    'page.ability.title': '一个输入框，装着全部',
    'page.ability.body': '写作、分析、编码、自动化——同一处起步，过程可见，结果可留。',
    'page.start.title': '从第一个任务开始',
    'page.start.body': '选一个项目，或直接开聊。',
    'action.skip': '跳过',
    'action.next': '下一步',
    'action.start': '开始使用',
  },
  en: {
    'page.brand.title': 'Sanbao: ship everywhere',
    'page.brand.body': 'Say what you want done; the rest is handled.',
    'page.ability.title': 'One box, every ability',
    'page.ability.body': 'Writing, analysis, code, automation — start here, watch it work, keep the result.',
    'page.start.title': 'Start with one task',
    'page.start.body': 'Pick a project, or just start typing.',
    'action.skip': 'Skip',
    'action.next': 'Next',
    'action.start': 'Start',
  },
}
