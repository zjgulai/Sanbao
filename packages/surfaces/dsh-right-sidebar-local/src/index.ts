/**
 * Right Sidebar Plugin - Main Entry Point
 */

// Export sidebar entry mount function
export { mountRightSidebarEntries, type SidebarSignalsMap, type ModuleSignal } from './client/sidebar-entry'

// Export module components
export { TodoPanel } from './client/modules/todo-panel'
export { EnvInfoPanel } from './client/modules/env-info-panel'
export { SkillsMcpPanel } from './client/modules/skills-mcp-panel'
export { WebSearchPanel } from './client/modules/web-search-panel'
export { BackgroundProcsPanel } from './client/modules/background-procs-panel'
export { OutputsPanel } from './client/modules/outputs-panel'
export { SourcesPanel } from './client/modules/sources-panel'

// Export APIs
export { todoApi } from './client/api/todo-api'
export { gitApi } from './client/api/git-api'
export { skillsMcpApi } from './client/api/skills-mcp-api'
