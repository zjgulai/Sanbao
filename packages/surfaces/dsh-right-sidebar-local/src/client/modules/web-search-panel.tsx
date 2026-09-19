/**
 * Web Search Panel - P2 Implementation
 */

import React, { useEffect, useState } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { webSearchApi, type WebSearchRecord } from '../api/web-search-api'

export interface WebSearchPanelProps {
  onClose: () => void
}

export function WebSearchPanel({ onClose }: WebSearchPanelProps): JSX.Element {
  const [records, setRecords] = useState<WebSearchRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    setLoading(true)
    try {
      const data = await webSearchApi.list()
      setRecords(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load web search history:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    await webSearchApi.delete(id)
    loadRecords()
  }

  const handleClearAll = async () => {
    if (window.confirm('确定要清空所有历史记录吗？')) {
      await webSearchApi.clear()
      loadRecords()
    }
  }

  const filteredRecords = records.filter(
    (record) =>
      record.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const formatTimestamp = (timestamp: number): string => {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    return `${days}天前`
  }

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>网页查阅</h2>
        <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Search Bar */}
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索历史记录..."
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--dsw-border-light)',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Stats */}
        {records.length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--dsw-text-secondary)', marginBottom: '12px' }}>
            共 {records.length} 条记录
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        )}

        {/* Records List */}
        {filteredRecords.length === 0 ? (
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>🔍</span>
            <p className={css['emptyStateText'] ?? ''}>
              {searchQuery ? '没有找到匹配的记录' : '暂无网页查阅记录'}
            </p>
            {!searchQuery && (
              <p style={{ fontSize: '12px', color: 'var(--dsw-text-tertiary)', marginTop: '8px' }}>
                浏览网页时会自动保存历史记录
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredRecords.map((record) => (
              <div
                key={record.id}
                style={{
                  padding: '12px',
                  background: 'var(--dsw-bg-layer-2)',
                  borderRadius: '8px',
                  transition: 'all 150ms ease',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                  <a
                    href={record.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1,
                      fontWeight: '600',
                      color: 'var(--lute-brand)',
                      textDecoration: 'none',
                      fontSize: '14px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {record.title}
                  </a>
                  <button
                    onClick={() => handleDelete(record.id)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      color: 'var(--dsw-text-tertiary)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'all 150ms ease',
                    }}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>

                {/* URL */}
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--dsw-text-secondary)',
                    fontFamily: 'monospace',
                    marginBottom: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {record.url}
                </div>

                {/* Snippet */}
                {record.snippet && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--dsw-text-secondary)',
                      marginBottom: '8px',
                      lineHeight: '1.5',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {record.snippet}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Tags */}
                  {record.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        background: 'var(--dsw-bg-layer-1)',
                        borderRadius: '12px',
                        color: 'var(--dsw-text-secondary)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}

                  {/* Timestamp */}
                  <span style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)', marginLeft: 'auto' }}>
                    ⏱️ {formatTimestamp(record.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clear All Button */}
        {records.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              width: '100%',
              marginTop: '20px',
              padding: '10px',
              background: 'transparent',
              color: 'var(--dsw-text-secondary)',
              border: '1px solid var(--dsw-border-light)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'all 150ms ease',
            }}
          >
            清空所有记录 ({records.length})
          </button>
        )}
      </div>
    </div>
  )
}
