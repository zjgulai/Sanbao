/**
 * sanbao-host-preload —— Sage sanbao 承载面的 sandboxed preload（CJS；由 tsc 从 .cts 编译为 .cjs）。
 *
 * 把壳侧 SanbaoHostPort 注入页面主世界（`window.__SANBAO_HOST__`）：协议号 + 每个具名方法 →
 * `ipcRenderer.invoke('sanbao-host:call', { method, args })`。方法清单与 main 侧白名单
 * （sanbao-surface.ts 的 SANBAO_HOST_METHODS）镜像；沙箱 preload 不能 require 仓内模块，
 * 两处字符串的漂移由真实 Electron 探针（test/support/sanbao-surface-probe.mjs）端到端兜底。
 */
import { contextBridge, ipcRenderer } from 'electron'

const CHANNEL = 'sanbao-host:call'
const METHODS = [
  'readWorkspace',
  'startRequirement',
  'readKnowledge',
  'readSites',
  'readSession',
  'stopSession',
  'answerClarification',
  'searchSessions',
  'readAutomations',
  'readUsage',
  'openArtifact',
  'readSettings',
  'readCapabilities',
] as const

const port: Record<string, unknown> = { protocolVersion: 1 }
for (const method of METHODS) {
  port[method] = (...args: string[]): Promise<unknown> => ipcRenderer.invoke(CHANNEL, { method, args })
}
contextBridge.exposeInMainWorld('__SANBAO_HOST__', port)
