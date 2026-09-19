/**
 * Environment Info Panel - P1 Implementation
 */

import React, { useEffect, useState, useCallback } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { gitApi, type GitStatus } from '../api/git-api'

export interface EnvInfoPanelProps {
  onClose: () => void
}

export function EnvInfoPanel({ onClose }: EnvInfoPanelProps): JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Load status on mount
  useEffect(() => {
    loadStatus()
  }, [])

  // Auto-refresh every 5 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || loading) return

    const interval = setInterval(async () => {
      await loadStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh, loading])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const data = await gitApi.getStatus()
      setStatus(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load git status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = useCallback(async () => {
    await loadStatus()
  }, [])

  if (!status) {
    return (
      <div className={css['panelRoot'] ?? ''}>
        <div className={css['panelHeader'] ?? ''}>
          <h2 className={css['panelTitle'] ?? ''}>环境信息</h2>
          <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className={css['panelBody'] ?? ''}>
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>🌍</span>
            <p className={css['emptyStateText'] ?? ''}>无法读取 Git 仓库</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>环境信息</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            style={{
              padding: '6px 12px',
              background: loading ? 'var(--dsw-bg-layer-1)' : 'transparent',
              color: 'var(--dsw-text-secondary)',
              border: '1px solid var(--dsw-border-light)',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              transition: 'all 150ms ease',
            }}
            title="刷新状态"
          >
            🔄 {loading ? '更新中...' : '刷新'}
          </button>

          {/* Close Button */}
          <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
        </div>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Branch Info */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '24px' }}>🌿</span>
            <span style={{ fontSize: '14px', color: 'var(--dsw-text-secondary)' }}>当前分支</span>
          </div>
          <div
            style={{
              padding: '12px',
              background: 'var(--dsw-bg-layer-2)',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '16px',
              color: 'var(--lute-brand)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {status.branch}
            {status.branch === 'error' && <span style={{ fontSize: '12px', color: 'var(--dsw-text-tertiary)' }}>(非 Git 仓库)</span>}
          </div>
        </div>

        {/* Sync Status */}
        {(status.ahead !== undefined || status.behind !== undefined) && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <span style={{ fontSize: '14px', color: 'var(--dsw-text-secondary)' }}>同步状态</span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {status.behind !== undefined && status.behind > 0 && (
                <div
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>⬇️</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>{status.behind}</div>
                  <div style={{ fontSize: '11px', color: '#78350f' }}>落后远程</div>
                </div>
              )}
              {status.ahead !== undefined && status.ahead > 0 && (
                <div
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#dbeafe',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>⬆️</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af' }}>{status.ahead}</div>
                  <div style={{ fontSize: '11px', color: '#1e3a8a' }}>领先本地</div>
                </div>
              )}
              {status.behind === 0 && status.ahead === 0 && (
                <div
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#d1fae5',
                    borderRadius: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>✅</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#065f46' }}>同步</div>
                  <div style={{ fontSize: '11px', color: '#064e3b' }}>与远程一致</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Changes Summary */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>📊</span>
            <span style={{ fontSize: '14px', color: 'var(--dsw-text-secondary)' }}>变更统计</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                padding: '12px',
                background: status.stagedChanges > 0 ? '#eff6ff' : 'var(--dsw-bg-layer-1)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#1d4ed8' }}>{status.stagedChanges}</div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>已暂存</div>
            </div>
            <div
              style={{
                padding: '12px',
                background: status.unstagedChanges > 0 ? '#fff7ed' : 'var(--dsw-bg-layer-1)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#ea580c' }}>{status.unstagedChanges}</div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>未暂存</div>
            </div>
            <div
              style={{
                padding: '12px',
                background: status.untrackedFiles.length > 0 ? '#f3e8ff' : 'var(--dsw-bg-layer-1)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#7c3aed' }}>{status.untrackedFiles.length}</div>
              <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>未跟踪</div>
            </div>
          </div>
        </div>

        {/* Recent Commits */}
        {status.recentCommits.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px' }}>📝</span>
              <span style={{ fontSize: '14px', color: 'var(--dsw-text-secondary)' }}>最近提交</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {status.recentCommits.map((commit, index) => (
                <div
                  key={commit.hash}
                  style={{
                    padding: '10px 12px',
                    marginBottom: '8px',
                    background: index === 0 ? 'var(--dsw-bg-layer-2)' : 'var(--dsw-bg-layer-1)',
                    borderRadius: '6px',
                    borderLeft: index === 0 ? `3px solid var(--lute-brand)` : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <code
                      style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        background: 'var(--dsw-bg-layer-1)',
                        borderRadius: '4px',
                        color: 'var(--dsw-text-secondary)',
                      }}
                    >
                      {commit.hash}
                    </code>
                    <span style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)' }}>
                      {commit.date.toLocaleDateString()} {commit.date.toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--dsw-text-primary)', marginBottom: '4px' }}>{commit.message}</div>
                  <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>👤 {commit.author}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Untracked Files (if any) */}
        {status.untrackedFiles.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px' }}>📁</span>
              <span style={{ fontSize: '14px', color: 'var(--dsw-text-secondary)' }}>未跟踪文件 ({status.untrackedFiles.length})</span>
            </div>
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {status.untrackedFiles.slice(0, 20).map((file, index) => (
                <div
                  key={index}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--dsw-text-secondary)',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--dsw-bg-layer-1)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                  }}
                >
                  {file}
                </div>
              ))}
              {status.untrackedFiles.length > 20 && (
                <div style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)', textAlign: 'center', marginTop: '8px' }}>
                  +{status.untrackedFiles.length - 20} more...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Auto-refresh Toggle */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--dsw-border-light)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--dsw-text-secondary)' }}>自动刷新 (每 5 秒)</span>
          </label>
        </div>
      </div>
    </div>
  )
}
