import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { setTimeout } from 'node:timers/promises'

export const inject = ['llm', 'tools']

class AcceptanceModel extends LlmAdapter {
  providerInfo() { return { id: 'sanbao-acceptance', name: '本地兼容性测试（非真实模型）' } }
  async listModels() {
    return [{ provider: 'sanbao-acceptance', id: 'fixture', name: '测试', inputModalities: ['text', 'image'] }]
  }
  async resolveModel() {
    return { ...(await this.listModels())[0], context: { contextWindow: 32000 }, defaultMaxTokens: 1000 }
  }
  async *stream(options) {
    const last = options.messages.at(-1)
    const text = (last?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join(' ')
    if (text.includes('fixture:error')) throw new Error('本地验收故障注入')
    if (text.includes('fixture:approval')) {
      const block = { type: 'tool-call', id: 'acceptance-call', name: 'acceptance_check', arguments: '{}' }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: '{}' }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const reply = '本地测试回复：已走通输入、宿主、流式响应和消息呈现。'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    for (const part of reply.match(/.{1,5}/gu)) {
      await setTimeout(text.includes('fixture:slow') ? 800 : 35, undefined, { signal: options.signal })
      yield { type: 'text-delta', index: 0, text: part }
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
    yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 20 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  ctx.llm.registerAdapter(['sanbao-acceptance'], new AcceptanceModel())
  ctx.tools.register({
    name: 'acceptance_check', description: '本地验收用无副作用审批操作',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => '本地审批已允许',
  })
  ctx.on('tools/pre-execute', async (exec, next) => exec.name === 'acceptance_check'
    ? { kind: 'ask', reason: '本地兼容性验收，无文件修改或网络请求' }
    : next())
}
