/**
 * Outputs Panel - P2 Implementation
 */

import React, { useEffect, useState } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { outputsApi, type OutputItem } from '../api/outputs-api'

export interface OutputsPanelProps {
  onClose: () => void
}

export function OutputsPanel({ onClose }: OutputsPanelProps): JSX.Element {
  const [items, setItems] = useState<OutputItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedType, setSelectedType] = useState<string>('all')

  useEffect(() => {
    loadItems()
  }, [])

  const loadItems = async () => {
    setLoading(true)
    try {
      const data = await outputsApi.list()
      setItems(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load outputs:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('确定要删除这个产出吗？')) {
      await outputsApi.delete(id)
      loadItems()
    }
  }

  const filteredItems = selectedType === 'all' ? items : items.filter((item) => item.type === selectedType)

  const formatSize = (size?: number): string => {
    if (!size) return '-'
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (date: Date): string => {
    const diff = Date.now() - date.getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return '刚刚'
    if (hours < 24) return `${hours}小时前`
    return date.toLocaleDateString()
  }

  const getTypeIcon = (type: OutputItem['type']): string => {
    switch (type) {
      case 'document':
        return '📄'
      case 'code':
        return '💻'
      case 'report':
        return '📊'
      case 'image':
        return '🖼️'
      default:
        return '📦'
    }
  }

  const getTypeColor = (type: OutputItem['type']): string => {
    switch (type) {
      case 'document':
        return '#3b82f6'
      case 'code':
        return '#10b981'
      case 'report':
        return '#f59e0b'
      case 'image':
        return '#ec4899'
      default:
        return '#6b7280'
    }
  }

  const types = ['all', 'document', 'code', 'report', 'image', 'other']

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>产出</h2>
        <button type="button" className={css['panelClose'] ?? ''} onClick={onClose} aria-label="关闭">✕</button>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Type Filter */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                padding: '6px 12px',
                background: selectedType === type ? 'var(--lute-brand)' : 'var(--dsw-bg-layer-2)',
                color: selectedType === type ? 'white' : 'var(--dsw-text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                transition: 'all 150ms ease',
              }}
            >
              {type === 'all' ? '全部' : type}
            </button>
          ))}
        </div>

        {/* Stats */}
        {items.length > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--dsw-text-secondary)', marginBottom: '12px' }}>
            共 {filteredItems.length} 个产出
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        )}

        {/* Items List */}
        {filteredItems.length === 0 ? (
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>📦</span>
            <p className={css['emptyStateText'] ?? ''}>暂无产出</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredItems.map((item) => (
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

                    {item.description && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--dsw-text-secondary)',
                          marginBottom: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.description}
                      </div>
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

                      {/* Size */}
                      {item.size && (
                        <span style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)' }}>
                          📦 {formatSize(item.size)}
                        </span>
                      )}

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
                        ⏱️ {formatDate(item.updatedAt)}
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
