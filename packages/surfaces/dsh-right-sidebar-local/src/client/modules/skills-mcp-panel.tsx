/**
 * Skills & MCP Panel - P1 Implementation
 */

import React, { useEffect, useState } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { skillsMcpApi, type Skill, type McpServer } from '../api/skills-mcp-api'

export interface SkillsMcpPanelProps {
  onClose: () => void
}

export function SkillsMcpPanel({ onClose }: SkillsMcpPanelProps): JSX.Element {
  const [skills, setSkills] = useState<Skill[]>([])
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'skills' | 'mcp'>('skills')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [skillsData, mcpData] = await Promise.all([
        skillsMcpApi.listSkills(),
        skillsMcpApi.listMcpServers(),
      ])
      setSkills(skillsData)
      setMcpServers(mcpData)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load skills/MCP:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSkill = async (id: string, enabled: boolean) => {
    await skillsMcpApi.toggleSkill(id, enabled)
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  const handleToggleMcpServer = async (id: string, enabled: boolean) => {
    await skillsMcpApi.toggleMcpServer(id, enabled)
    setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  const enabledSkillCount = skills.filter((s) => s.enabled).length
  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>技能和 MCP</h2>
        <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button
            onClick={() => setActiveTab('skills')}
            style={{
              flex: 1,
              padding: '10px',
              background: activeTab === 'skills' ? 'var(--lute-brand)' : 'var(--dsw-bg-layer-2)',
              color: activeTab === 'skills' ? 'white' : 'var(--dsw-text-secondary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'skills' ? '600' : '400',
              transition: 'all 150ms ease',
            }}
          >
            ⚡ 技能 ({enabledSkillCount}/{skills.length})
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            style={{
              flex: 1,
              padding: '10px',
              background: activeTab === 'mcp' ? 'var(--lute-brand)' : 'var(--dsw-bg-layer-2)',
              color: activeTab === 'mcp' ? 'white' : 'var(--dsw-text-secondary)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeTab === 'mcp' ? '600' : '400',
              transition: 'all 150ms ease',
            }}
          >
            🔌 MCP 服务 ({enabledMcpCount}/{mcpServers.length})
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && !loading && (
          <>
            {skills.length === 0 ? (
              <div className={css['emptyState'] ?? ''}>
                <span className={css['emptyStateIcon'] ?? ''}>⚡</span>
                <p className={css['emptyStateText'] ?? ''}>暂无技能</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    style={{
                      padding: '12px',
                      background: skill.enabled ? 'var(--dsw-bg-layer-2)' : 'var(--dsw-bg-layer-1)',
                      borderRadius: '8px',
                      opacity: skill.enabled ? 1 : 0.6,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Toggle Switch */}
                      <label style={{ position: 'relative', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={(e) => handleToggleSkill(skill.id, e.target.checked)}
                          style={{
                            position: 'absolute',
                            opacity: 0,
                            width: '100%',
                            height: '100%',
                            cursor: 'pointer',
                          }}
                          aria-label={`启用 ${skill.name}`}
                        />
                        <div
                          style={{
                            width: '44px',
                            height: '24px',
                            background: skill.enabled ? 'var(--lute-brand)' : 'var(--dsw-border-light)',
                            borderRadius: '12px',
                            transition: 'background-color 150ms ease',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: skill.enabled ? '28px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: 'white',
                              borderRadius: '50%',
                              transition: 'left 150ms ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                      </label>

                      {/* Skill Info */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: skill.enabled ? '600' : '400',
                            color: skill.enabled ? 'var(--dsw-text-primary)' : 'var(--dsw-text-tertiary)',
                            marginBottom: '4px',
                          }}
                        >
                          {skill.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>
                          {skill.provider && (
                            <span
                              style={{
                                padding: '2px 6px',
                                background: 'var(--dsw-bg-layer-1)',
                                borderRadius: '4px',
                              }}
                            >
                              {skill.provider.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* MCP Servers Tab */}
        {activeTab === 'mcp' && !loading && (
          <>
            {mcpServers.length === 0 ? (
              <div className={css['emptyState'] ?? ''}>
                <span className={css['emptyStateIcon'] ?? ''}>🔌</span>
                <p className={css['emptyStateText'] ?? ''}>暂无 MCP 服务</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {mcpServers.map((server) => (
                  <div
                    key={server.id}
                    style={{
                      padding: '12px',
                      background: server.enabled ? 'var(--dsw-bg-layer-2)' : 'var(--dsw-bg-layer-1)',
                      borderRadius: '8px',
                      opacity: server.enabled ? 1 : 0.6,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Toggle Switch */}
                      <label style={{ position: 'relative', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          onChange={(e) => handleToggleMcpServer(server.id, e.target.checked)}
                          style={{
                            position: 'absolute',
                            opacity: 0,
                            width: '100%',
                            height: '100%',
                            cursor: 'pointer',
                          }}
                          aria-label={`启用 ${server.name}`}
                        />
                        <div
                          style={{
                            width: '44px',
                            height: '24px',
                            background: server.enabled ? 'var(--lute-brand)' : 'var(--dsw-border-light)',
                            borderRadius: '12px',
                            transition: 'background-color 150ms ease',
                            position: 'relative',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: server.enabled ? '28px' : '2px',
                              width: '20px',
                              height: '20px',
                              background: 'white',
                              borderRadius: '50%',
                              transition: 'left 150ms ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}
                          />
                        </div>
                      </label>

                      {/* Server Info */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: server.enabled ? '600' : '400',
                            color: server.enabled ? 'var(--dsw-text-primary)' : 'var(--dsw-text-tertiary)',
                            marginBottom: '4px',
                          }}
                        >
                          {server.name}
                        </div>
                        {server.config && (
                          <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>
                            {Object.entries(server.config)
                              .slice(0, 2)
                              .map(([key, value]) => (
                                <span key={key} style={{ marginRight: '8px' }}>
                                  {key}: {typeof value === 'string' ? `"${value}"` : String(value)}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
