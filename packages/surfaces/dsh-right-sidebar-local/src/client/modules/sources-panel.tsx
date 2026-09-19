/**
 * Sources Panel - P2 Implementation
 */

import React, { useEffect, useState } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { sourcesApi, type SourceItem } from '../api/sources-api'

export interface SourcesPanelProps {
  onClose: () => void
}

export function SourcesPanel({ onClose }: SourcesPanelProps): JSX.Element {
  const [items, setItems] = useState<SourceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    setLoading(true)
    try {
      const data = await sourcesApi.list()
      setItems(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load sources:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除这个来源吗？')) {
      await sourcesApi.delete(id)
      loadItems()
    }
  }

  const formatDate = (date?: Date): string => {
    if (!date) return '-'
    const diff = Date.now() - date.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString()
  }

  const getTypeIcon = (type: SourceItem['type']): string => {
    switch (type) {
      case 'paper':
        return '📄'
      case 'document':
        return '📝'
      case 'link':
        return '🔗'
      case 'note':
        return '📌'
      default:
        return '📚'
    }
  }

  const getTypeColor = (type: SourceItem['type']): string => {
    switch (type) {
      case 'paper':
        return '#8b5cf6'
      case 'document':
        return '#3b82f6'
      case 'link':
        return '#10b981'
      case 'note':
        return '#f59e0b'
      default:
        return '#6b7280'
    }
  }

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>来源</h2>
        <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Stats */}
        {items.length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--dsw-text-secondary)', marginBottom: '12px' }}>
            共 {items.length} 个来源
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>📚</span>
            <p className={css['emptyStateText'] ?? ''}>暂无来源</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '12px',
                  background: 'var(--dsw-bg-layer-2)',
                  borderRadius: '8px',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Icon */}
                  <div
                    style={{
                      fontSize: '24px',
                      width: '40px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `${getTypeColor(item.type)}20`,
                      borderRadius: '8px',
                    }}
                  >
                    {getTypeIcon(item.type)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: '600',
                        color: 'var(--dsw-text-primary)',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                    </div>

                    {/* Author and Date */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '12px', color: 'var(--dsw-text-secondary)' }}>
                      {item.author && <span>👤 {item.author}</span>}
                      {item.publishedAt && <span>📅 {formatDate(item.publishedAt)}</span>}
                    </div>

                    {/* Description */}
                    {item.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--dsw-text-secondary)',
                          marginBottom: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteTime: 'nowrap',
                        }}
                      >
                        {item.description}
                      </div>
                    )}

                    {/* URL */}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '11px',
                          color: 'var(--lute-brand)',
                          textDecoration: 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'block',
                          marginBottom: '8px',
                        }}
                      >
                        {item.url}
                      </a>
                    )}

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Type Badge */}
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 8px',
                          background: `${getTypeColor(item.type)}20`,
                          color: getTypeColor(item.type),
                          borderRadius: '12px',
                          fontWeight: '500',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.type}
                      </span>

                      {/* Citation Count */}
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-secondary)' }}>
                        🔗 引用 {item.citedBy.length} 次
                      </span>

                      {/* Tags */}
                      {item.tags.map((tag) => (
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

                      {/* Time */}
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)', marginLeft: 'auto' }}>
                        ⏱️ {formatDate(item.createdAt)}
                      </span>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(item.id)}
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
