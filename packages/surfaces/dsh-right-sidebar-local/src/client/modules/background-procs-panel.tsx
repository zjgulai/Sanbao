/**
 * Background Processes Panel - P2 Implementation
 */

import React, { useEffect, useState, useCallback } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { backgroundProcsApi, type ProcessInfo } from '../api/background-procs-api'

export interface BackgroundProcsPanelProps {
  onClose: () => void
}

export function BackgroundProcsPanel({ onClose }: BackgroundProcsPanelProps): JSX.Element {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadProcesses()
  }, [])

  // Auto-refresh every 3 seconds if enabled
  useEffect(() => {
    if (!autoRefresh || loading) return

    const interval = setInterval(async () => {
      await loadProcesses()
    }, 3000)

    return () => clearInterval(interval)
  }, [autoRefresh, loading])

  const loadProcesses = async () => {
    setLoading(true)
    try {
      const data = await backgroundProcsApi.list()
      setProcesses(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load processes:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = useCallback(async (id: string) => {
    if (window.confirm('确定要停止这个进程吗？')) {
      await backgroundProcsApi.stop(id)
      loadProcesses()
    }
  }, [])

  const handlePause = useCallback(async (id: string) => {
    await backgroundProcsApi.pause(id)
    loadProcesses()
  }, [])

  const handleResume = useCallback(async (id: string) => {
    await backgroundProcsApi.resume(id)
    loadProcesses()
  }, [])

  const formatDuration = (startTime: Date): string => {
    const diff = Date.now() - startTime.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`
    return `${minutes}分钟`
  }

  const getStatusColor = (status: ProcessInfo['status']): string => {
    switch (status) {
      case 'running':
        return '#10b981' // green
      case 'paused':
        return '#f59e0b' // amber
      case 'stopped':
        return '#ef4444' // red
      default:
        return '#6b7280' // gray
    }
  }

  const runningCount = processes.filter((p) => p.status === 'running').length
  const pausedCount = processes.filter((p) => p.status === 'paused').length
  const stoppedCount = processes.filter((p) => p.status === 'stopped').length

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>后台进程</h2>
        <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Stats Bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div
            style={{
              flex: 1,
              padding: '10px',
              background: '#d1fae5',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#065f46' }}>{runningCount}</div>
            <div style={{ fontSize: '11px', color: '#064e3b' }}>运行中</div>
          </div>
          <div
            style={{
              flex: 1,
              padding: '10px',
              background: '#fef3c7',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#92400e' }}>{pausedCount}</div>
            <div style={{ fontSize: '11px', color: '#78350f' }}>已暂停</div>
          </div>
          <div
            style={{
              flex: 1,
              padding: '10px',
              background: '#fee2e2',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#991b1b' }}>{stoppedCount}</div>
            <div style={{ fontSize: '11px', color: '#7f1d1d' }}>已停止</div>
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={loadProcesses}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '16px',
            background: loading ? 'var(--dsw-bg-layer-1)' : 'var(--dsw-bg-layer-2)',
            color: 'var(--dsw-text-secondary)',
            border: '1px solid var(--dsw-border-light)',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            transition: 'all 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          🔄 {loading ? '更新中...' : '刷新列表'}
        </button>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        )}

        {/* Process List */}
        {processes.length === 0 ? (
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>⚙️</span>
            <p className={css['emptyStateText'] ?? ''}>暂无后台进程</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {processes.map((proc) => (
              <div
                key={proc.id}
                style={{
                  padding: '12px',
                  background: 'var(--dsw-bg-layer-2)',
                  borderRadius: '8px',
                  transition: 'all 150ms ease',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  {/* Status Indicator */}
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: getStatusColor(proc.status),
                      animation: proc.status === 'running' ? 'pulse 2s infinite' : 'none',
                    }}
                  />

                  {/* Process Name and PID */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: 'var(--dsw-text-primary)', fontSize: '14px' }}>
                      {proc.name} <span style={{ color: 'var(--dsw-text-secondary)', fontSize: '12px' }}>(PID: {proc.pid})</span>
                    </div>
                    {proc.command && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--dsw-text-secondary)',
                          fontFamily: 'monospace',
                          marginTop: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {proc.command}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {proc.status === 'running' ? (
                      <>
                        <button
                          onClick={() => handlePause(proc.id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            background: 'var(--dsw-bg-layer-1)',
                            color: 'var(--dsw-text-secondary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                          }}
                          title="暂停"
                        >
                          ⏸️
                        </button>
                        <button
                          onClick={() => handleStop(proc.id)}
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                            background: '#fee2e2',
                            color: '#991b1b',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                          }}
                          title="停止"
                        >
                          ⛔
                        </button>
                      </>
                    ) : proc.status === 'paused' ? (
                      <button
                        onClick={() => handleResume(proc.id)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                        }}
                        title="恢复"
                      >
                        ▶️
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Resource Usage */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                  {/* CPU Usage */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>CPU</span>
                      <div
                        style={{
                          flex: 1,
                          height: '6px',
                          background: 'var(--dsw-bg-layer-1)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(proc.cpuUsage, 100)}%`,
                            height: '100%',
                            background: proc.cpuUsage > 80 ? '#ef4444' : proc.cpuUsage > 50 ? '#f59e0b' : '#10b981',
                            borderRadius: '3px',
                            transition: 'width 300ms ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)', minWidth: '35px', textAlign: 'right' }}>
                        {proc.cpuUsage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Memory Usage */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>MEM</span>
                      <div
                        style={{
                          flex: 1,
                          height: '6px',
                          background: 'var(--dsw-bg-layer-1)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min((proc.memoryUsage / 1000) * 100, 100)}%`,
                            height: '100%',
                            background: '#3b82f6',
                            borderRadius: '3px',
                            transition: 'width 300ms ease',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)', minWidth: '35px', textAlign: 'right' }}>
                        {proc.memoryUsage.toFixed(1)} MB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Runtime Info */}
                <div style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⏱️ 运行时长</span>
                  <span style={{ fontWeight: '500', color: 'var(--dsw-text-secondary)' }}>{formatDuration(proc.startTime)}</span>
                  <span>•</span>
                  <span style={{ color: getStatusColor(proc.status), fontWeight: '500' }}>
                    {proc.status === 'running' ? '运行中' : proc.status === 'paused' ? '已暂停' : '已停止'}
                  </span>
                </div>
              </div>
            ))}
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
            <span style={{ fontSize: '13px', color: 'var(--dsw-text-secondary)' }}>自动刷新 (每 3 秒)</span>
          </label>
        </div>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
