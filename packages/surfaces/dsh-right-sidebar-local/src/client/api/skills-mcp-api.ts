/**
 * Skills & MCP API - P1 Implementation
 * 
 * NOTE: This is a demo implementation. In production, this should integrate
 * with the host application's context to get real skills and MCP servers.
 */

export interface Skill {
  id: string
  name: string
  enabled: boolean
  provider?: string
}

export interface McpServer {
  id: string
  name: string
  enabled: boolean
  config?: Record<string, unknown>
}

export interface SkillsMcpApi {
  listSkills(): Promise<Skill[]>
  toggleSkill(id: string, enabled: boolean): Promise<void>
  listMcpServers(): Promise<McpServer[]>
  toggleMcpServer(id: string, enabled: boolean): Promise<void>
}

// Demo data for development
const DEMO_SKILLS: Skill[] = [
  { id: 'sk-fs-tdd', name: 'Test-Driven Development', enabled: true, provider: 'fs' },
  { id: 'sk-fs-write-spec', name: 'Write Specification', enabled: true, provider: 'fs' },
  { id: 'sk-fs-to-tickets', name: 'Convert to Tickets', enabled: false, provider: 'fs' },
  { id: 'langchain4j-spring-boot-integration', name: 'LangChain4J Spring Boot', enabled: true, provider: 'npm' },
  { id: 'rust-analyzer-lsp', name: 'Rust Analyzer LSP', enabled: true, provider: 'npm' },
]

const DEMO_MCP_SERVERS: McpServer[] = [
  { id: 'mcp-git', name: 'Git Server', enabled: true, config: { path: '/path/to/repo' } },
  { id: 'mcp-filesystem', name: 'Filesystem Server', enabled: false, config: { root: '/' } },
  { id: 'mcp-postgres', name: 'PostgreSQL Server', enabled: true, config: { connectionString: 'postgresql://...' } },
]

// Real implementation (demo mode)
export const skillsMcpApi: SkillsMcpApi = {
  listSkills: async (): Promise<Skill[]> => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return [...DEMO_SKILLS]
  },

  toggleSkill: async (id: string, enabled: boolean): Promise<void> => {
    console.log(`[dsh-right-sidebar] Toggle skill: ${id} -> ${enabled}`)
    // TODO: Call host API to update skill state
  },

  listMcpServers: async (): Promise<McpServer[]> => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return [...DEMO_MCP_SERVERS]
  },

  toggleMcpServer: async (id: string, enabled: boolean): Promise<void> => {
    console.log(`[dsh-right-sidebar] Toggle MCP server: ${id} -> ${enabled}`)
    // TODO: Call host API to update MCP server state
  },
}
