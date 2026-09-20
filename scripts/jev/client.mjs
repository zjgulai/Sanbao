/**
 * Jev System One 客户端（ADR-0138 D6/D8）。离线可测：transport/sleep 可注入。
 *
 * 反面教材是 dsh-my-quotes lib/index.js llmClassify 的 `catch {}` 静默降级——
 * 本模块的每一次失败都是**大声**的：非 2xx、响应形状不对、预算耗尽全部抛
 * JevError，调用方必须显式决定降级策略，客户端不替它瞒。
 *
 * 重试只对 429/529 与网络层失败（超时/连接错误）做指数退避；其余 4xx
 * 是契约错误（key 坏、请求形状坏），重试只会掩盖问题。
 *
 * 响应校验按 P-02 防线写：HTTP 200 且 answers 缺问、type 不匹配、model
 * 字段缺失，都算失败——仪器假绿比失败更贵。
 */
import { MODEL_VERSION } from './questions.mjs'

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export class JevError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null, retryAfterHeader = null, body = '' } = {}) {
    super(message)
    this.name = 'JevError'
    this.status = status
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
    this.retryAfterHeader = retryAfterHeader
    this.body = body.length > 500 ? body.slice(0, 500) : body
  }
}

export class JevBudgetExceeded extends JevError {
  constructor(message) {
    super(message)
    this.name = 'JevBudgetExceeded'
  }
}

const RETRYABLE_STATUS = new Set([429, 529])

function backoffMs(attempt, retryAfterHeader) {
  const ra = Number(retryAfterHeader)
  if (Number.isFinite(ra) && ra > 0) return ra * 1000
  return Math.round(500 * 2 ** attempt * (0.5 + Math.random() * 0.5))
}

/**
 * 创建客户端。
 * @param {object} opts
 * @param {string} opts.apiKey 必填，空值立即抛错（大声）。
 * @param {string} [opts.model] 钉版本，默认取 questions.mjs 的 MODEL_VERSION。
 * @param {Function} [opts.fetchImpl] 可注入 fetch（测试 fake transport）。
 * @param {Function} [opts.sleepImpl] 可注入 sleep（测试断言退避序列）。
 * @param {number} [opts.timeoutMs] 单次请求超时。
 * @param {number} [opts.maxRetries] 429/529/网络失败的最大重试次数。
 * @param {{maxRequests?: number}} [opts.budget] 累计请求预算；超限在发起调用前抛 JevBudgetExceeded。
 */
export function createJevClient({
  apiKey,
  model = MODEL_VERSION,
  endpoint = JEV_ENDPOINT,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = 30_000,
  maxRetries = 3,
  budget = { maxRequests: 400 },
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new JevError('Jev apiKey 缺失——凭据解析链没有给出 key，禁止静默继续')
  }
  if (typeof fetchImpl !== 'function') {
    throw new JevError('fetchImpl 不可用：当前运行时没有 fetch，也未注入实现')
  }

  const stats = { requests: 0, retries: 0, failures: 0, inputTokens: 0, outputTokens: 0, modelEcho: null }

  async function ask(state, questions) {
    const qIds = Object.keys(questions ?? {})
    if (qIds.length === 0) throw new JevError('questions 不能为空')
    if (budget.maxRequests != null && stats.requests + 1 > budget.maxRequests) {
      throw new JevBudgetExceeded(
        `Jev 预算耗尽：已发 ${stats.requests} 次请求，上限 ${budget.maxRequests}——在发起前拦截，不半途截断`,
      )
    }

    const payload = { state, model, questions }
    let lastError
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) {
        stats.retries += 1
        await sleepImpl(lastError.retryAfterMs ?? backoffMs(attempt - 1, lastError.retryAfterHeader))
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      stats.requests += 1
      let res
      try {
        res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (err) {
        lastError = new JevError(
          `Jev 请求网络层失败（${err?.name === 'AbortError' ? `超时 ${timeoutMs}ms` : err?.message}）`,
          { retryable: true, retryAfterHeader: null },
        )
        continue
      } finally {
        clearTimeout(timer)
      }

      const text = await res.text().catch(() => '')
      if (res.status === 200) {
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          stats.failures += 1
          lastError = new JevError('Jev 200 响应不是合法 JSON', { status: 200, body: text })
          break
        }
        if (typeof parsed?.model !== 'string' || parsed.model.length === 0) {
          stats.failures += 1
          lastError = new JevError('Jev 200 响应缺 model 回读字段', { status: 200, body: text })
          break
        }
        stats.modelEcho = parsed.model
        const answers = parsed?.answers
        const missing = qIds.filter((id) => answers?.[id]?.type !== questions[id].type)
        if (missing.length > 0) {
          stats.failures += 1
          lastError = new JevError(
            `Jev 200 响应缺问或 type 不匹配：${missing.join(', ')}——按失败处理，不当成功`,
            { status: 200, body: text },
          )
          break
        }
        if (parsed.usage && Number.isFinite(parsed.usage.input_tokens)) {
          stats.inputTokens += parsed.usage.input_tokens
          stats.outputTokens += parsed.usage.output_tokens ?? 0
        }
        return { model: parsed.model, answers, usage: parsed.usage ?? null }
      }

      const retryAfterHeader = res.headers?.get?.('retry-after') ?? null
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new JevError(`Jev ${res.status}（限流/过载），可重试`, {
          status: res.status,
          retryable: true,
          retryAfterHeader,
          body: text,
        })
        continue
      }
      stats.failures += 1
      throw new JevError(`Jev ${res.status}：契约层失败，不重试`, { status: res.status, body: text })
    }
    stats.failures += 1
    throw lastError ?? new JevError('Jev 请求失败：重试耗尽')
  }

  return { ask, stats: () => ({ ...stats }) }
}
