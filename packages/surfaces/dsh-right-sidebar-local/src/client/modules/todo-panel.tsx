/**
 * TODO Tasks Panel - P1 Implementation
 */

import React, { useEffect, useState, useCallback } from 'react'
import css from '../../styles/right-sidebar.module.css'
import { todoApi, type TodoTask } from '../api/todo-api'

export interface TodoPanelProps {
  onClose: () => void
}

// Priority badge colors
const PRIORITY_COLORS = {
  low: '#3b82f6', // blue
  medium: '#f59e0b', // amber
  high: '#ef4444', // red
}

export function TodoPanel({ onClose }: TodoPanelProps): JSX.Element {
  const [todos, setTodos] = useState<TodoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Load todos on mount
  useEffect(() => {
    loadTodos()
  }, [])

  const loadTodos = async () => {
    setLoading(true)
    try {
      const data = await todoApi.list()
      setTodos(data)
    } catch (error) {
      console.error('[dsh-right-sidebar] Failed to load todos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = useCallback(async (id: string) => {
    await todoApi.toggle(id)
    loadTodos()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    await todoApi.add(newTitle.trim())
    setNewTitle('')
    setShowAddForm(false)
    loadTodos()
  }

  const handleDelete = async (id: string) => {
    await todoApi.delete(id)
    loadTodos()
  }

  const handleClearCompleted = async () => {
    await todoApi.clearCompleted()
    loadTodos()
  }

  // Calculate stats
  const totalTasks = todos.length
  const completedTasks = todos.filter((t) => t.completed).length
  const pendingTasks = totalTasks - completedTasks

  return (
    <div className={css['panelRoot'] ?? ''}>
      {/* Header */}
      <div className={css['panelHeader'] ?? ''}>
        <h2 className={css['panelTitle'] ?? ''}>待办任务</h2>
        <button
          type="button"
          className={css['panelClose'] ?? ''}
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>

      {/* Stats Bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--dsw-border-light)' }}>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--dsw-text-secondary)' }}>
          <span>总计：{totalTasks}</span>
          <span style={{ color: 'var(--lute-brand)' }}>待办：{pendingTasks}</span>
          <span>完成：{completedTasks}</span>
        </div>
      </div>

      {/* Body */}
      <div className={css['panelBody'] ?? ''}>
        {/* Add Task Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} style={{ marginBottom: '16px', padding: '12px', background: 'var(--dsw-bg-layer-2)', borderRadius: '8px' }}>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="输入新任务..."
              style={{
                width: '100%',
                padding: '8px 12px',
                marginBottom: '8px',
                border: '1px solid var(--dsw-border-light)',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={{ flex: 1, padding: '6px 12px', background: 'var(--lute-brand)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                添加
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ flex: 1, padding: '6px 12px', background: 'transparent', color: 'var(--dsw-text-secondary)', border: '1px solid var(--dsw-border-light)', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
                取消
              </button>
            </div>
          </form>
        )}

        {/* Add Button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '16px',
              background: 'var(--dsw-bg-layer-2)',
              border: '2px dashed var(--dsw-border-light)',
              borderRadius: '8px',
              color: 'var(--dsw-text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 150ms ease',
            }}
          >
            + 添加新任务
          </button>
        )}

        {/* Task List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--dsw-text-secondary)' }}>
            加载中...
          </div>
        ) : todos.length === 0 ? (
          <div className={css['emptyState'] ?? ''}>
            <span className={css['emptyStateIcon'] ?? ''}>📋</span>
            <p className={css['emptyStateText'] ?? ''}>暂无待办任务</p>
            <p style={{ fontSize: '12px', marginTop: '8px', color: 'var(--dsw-text-tertiary)' }}>点击「添加新任务」开始</p>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {todos.map((todo) => (
              <li
                key={todo.id}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: todo.completed ? 'var(--dsw-bg-layer-1)' : 'var(--dsw-bg-layer-2)',
                  borderRadius: '8px',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => handleToggle(todo.id)}
                    style={{
                      marginTop: '2px',
                      cursor: 'pointer',
                      accentColor: 'var(--lute-brand)',
                    }}
                    aria-label={todo.completed ? '标记为未完成' : '标记为已完成'}
                  />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: todo.completed ? '400' : '600',
                        textDecoration: todo.completed ? 'line-through' : 'none',
                        color: todo.completed ? 'var(--dsw-text-tertiary)' : 'var(--dsw-text-primary)',
                        marginBottom: '4px',
                      }}
                    >
                      {todo.title}
                    </div>

                    {todo.description && (
                      <div style={{ fontSize: '13px', color: 'var(--dsw-text-secondary)', marginBottom: '8px' }}>
                        {todo.description}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {/* Priority Badge */}
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: `${PRIORITY_COLORS[todo.priority]}20`,
                          color: PRIORITY_COLORS[todo.priority],
                          fontWeight: '500',
                        }}
                      >
                        {todo.priority === 'low' ? '低优先级' : todo.priority === 'medium' ? '中优先级' : '高优先级'}
                      </span>

                      {/* Due Date */}
                      {todo.dueDate && (
                        <span style={{ fontSize: '12px', color: 'var(--dsw-text-tertiary)' }}>
                          📅 {todo.dueDate.toLocaleDateString()}
                        </span>
                      )}

                      {/* Created Time */}
                      <span style={{ fontSize: '11px', color: 'var(--dsw-text-tertiary)' }}>
                        ⏱️ {new Date(todo.createdAt).toLocaleTimeString()}
                      </span>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(todo.id)}
                        style={{
                          marginLeft: 'auto',
                          padding: '4px 8px',
                          fontSize: '12px',
                          color: 'var(--dsw-text-tertiary)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          transition: 'all 150ms ease',
                        }}
                        title="删除任务"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer Actions */}
        {completedTasks > 0 && (
          <button
            onClick={handleClearCompleted}
            style={{
              width: '100%',
              marginTop: '16px',
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
            清除 {completedTasks} 个已完成任务
          </button>
        )}
      </div>
    </div>
  )
}
