/**
 * Background Processes API - P2 Implementation
 * 
 * NOTE: This is a demo implementation. In production, this should integrate
 * with the host application's process management system.
 */

export interface ProcessInfo {
  id: string
  name: string
  pid: number
  cpuUsage: number
  memoryUsage: number // in MB
  status: 'running' | 'paused' | 'stopped'
  startTime: Date
  command?: string
}

export interface BackgroundProcsApi {
  list(): Promise<ProcessInfo[]>
  stop(id: string): Promise<void>
  pause(id: string): Promise<void>
  resume(id: string): Promise<void>
  refresh(): Promise<void>
}

// Demo data for development
const DEMO_PROCESSES: ProcessInfo[] = [
  {
    id: 'proc_1',
    name: 'node',
    pid: 12345,
    cpuUsage: 5.2,
    memoryUsage: 120.5,
    status: 'running',
    startTime: new Date(Date.now() - 7200000), // 2 hours ago
    command: 'node scripts/gate.mjs --mode quick',
  },
  {
    id: 'proc_2',
    name: 'pnpm',
    pid: 12346,
    cpuUsage: 0.8,
    memoryUsage: 45.2,
    status: 'running',
    startTime: new Date(Date.now() - 3600000), // 1 hour ago
    command: 'pnpm run gate',
  },
  {
    id: 'proc_3',
    name: 'git',
    pid: 12347,
    cpuUsage: 0.0,
    memoryUsage: 12.8,
    status: 'paused',
    startTime: new Date(Date.now() - 1800000), // 30 min ago
    command: 'git diff --stat',
  },
]

// Real implementation (demo mode)
export const backgroundProcsApi: BackgroundProcsApi = {
  list: async (): Promise<ProcessInfo[]> => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return [...DEMO_PROCESSES]
  },

  stop: async (id: string): Promise<void> => {
    console.log(`[dsh-right-sidebar] Stop process: ${id}`)
    // TODO: Call host API to stop process
  },

  pause: async (id: string): Promise<void> => {
    console.log(`[dsh-right-sidebar] Pause process: ${id}`)
    // TODO: Call host API to pause process
  },

  resume: async (id: string): Promise<void> => {
    console.log(`[dsh-right-sidebar] Resume process: ${id}`)
    // TODO: Call host API to resume process
  },

  refresh: async (): Promise<void> => {
    // Force refresh by re-querying
    await backgroundProcsApi.list()
  },
}
