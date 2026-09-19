/**
 * Right Sidebar Plugin - Panel Mount Point
 * 
 * This file is responsible for mounting the panel component when a sidebar
 * entry is clicked. It should be called from the host application's routing
 * or event system.
 */

import React from 'react'
import {
  TodoPanel,
  EnvInfoPanel,
  SkillsMcpPanel,
  WebSearchPanel,
  BackgroundProcsPanel,
  OutputsPanel,
  SourcesPanel,
} from './index'

export type ModuleId = 'todo' | 'env' | 'skills-mcp' | 'web-search' | 'background-procs' | 'outputs' | 'sources'

export interface PanelRegistry {
  [moduleId: string]: React.ComponentType<{ onClose: () => void }>
}

/** Registry of all panel components */
export const PANEL_REGISTRY: PanelRegistry = {
  todo: TodoPanel,
  env: EnvInfoPanel,
  'skills-mcp': SkillsMcpPanel,
  'web-search': WebSearchPanel,
  'background-procs': BackgroundProcsPanel,
  outputs: OutputsPanel,
  sources: SourcesPanel,
}

/**
 * Get panel component by module ID
 * @param moduleId - The module identifier
 * @returns Panel component constructor, or undefined if not found
 */
export function getPanelComponent(moduleId: ModuleId): React.ComponentType<{ onClose: () => void }> | undefined {
  return PANEL_REGISTRY[moduleId]
}

/**
 * Mount a panel component to a target DOM element
 * @param moduleId - The module identifier
 * @param target - Target DOM element or React container
 * @param onClose - Callback when panel is closed
 */
export function mountPanel(
  moduleId: ModuleId,
  target: HTMLElement | React.ContainerNode,
  onClose: () => void,
): void {
  const PanelComponent = getPanelComponent(moduleId)
  if (!PanelComponent) {
    console.error(`[dsh-right-sidebar] Unknown module: ${moduleId}`)
    return
  }

  if (target instanceof HTMLElement) {
    // Direct DOM mounting
    target.innerHTML = ''
    const div = document.createElement('div')
    target.appendChild(div)
    // TODO: Use proper React rendering
  } else {
    // React container mounting
    // TODO: Implement using createRoot or render
  }
}
