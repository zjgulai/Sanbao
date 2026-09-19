/**
 * TODO API - P1 Implementation
 * 
 * Data source: localStorage for demo, can be extended to file-based storage
 * in production (e.g., ~/.dsh/profiles/<profile>/todos.jsonl)
 */

export interface TodoTask {
  id: string
  title: string
  description?: string
  completed: boolean
  dueDate?: Date
  priority: 'low' | 'medium' | 'high'
  createdAt: number
}

export interface TodoApi {
  list(): Promise<TodoTask[]>
  toggle(id: string): Promise<void>
  add(title: string, options?: { description?: string; dueDate?: Date; priority?: 'low' | 'medium' | 'high' }): Promise<TodoTask>
  delete(id: string): Promise<void>
  clearCompleted(): Promise<void>
}

// Storage key for localStorage
const STORAGE_KEY = 'dsh-right-sidebar:todos'

// Generate unique ID
function generateId(): string {
  return `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Load todos from storage
function loadTodos(): TodoTask[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    const parsed = JSON.parse(data)
    // Convert string dates back to Date objects
    return parsed.map((t: any) => ({
      ...t,
      dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
      createdAt: new Date(t.createdAt).getTime(),
    }))
  } catch {
    return []
  }
}

// Save todos to storage
function saveTodos(todos: TodoTask[]): void {
  try {
    const serialized = todos.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch (error) {
    console.error('[dsh-right-sidebar] Failed to save todos:', error)
  }
}

// Real implementation
export const todoApi: TodoApi = {
  list: async (): Promise<TodoTask[]> => {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10))
    return loadTodos()
  },

  toggle: async (id: string): Promise<void> => {
    const todos = loadTodos()
    const index = todos.findIndex((t) => t.id === id)
    if (index !== -1) {
      todos[index].completed = !todos[index].completed
      saveTodos(todos)
    }
  },

  add: async (
    title: string,
    options?: { description?: string; dueDate?: Date; priority?: 'low' | 'medium' | 'high' },
  ): Promise<TodoTask> => {
    const todos = loadTodos()
    const newTodo: TodoTask = {
      id: generateId(),
      title,
      description: options?.description,
      completed: false,
      dueDate: options?.dueDate,
      priority: options?.priority || 'medium',
      createdAt: Date.now(),
    }
    todos.unshift(newTodo) // Add to beginning
    saveTodos(todos)
    return newTodo
  },

  delete: async (id: string): Promise<void> => {
    const todos = loadTodos()
    const filtered = todos.filter((t) => t.id !== id)
    saveTodos(filtered)
  },

  clearCompleted: async (): Promise<void> => {
    const todos = loadTodos()
    const filtered = todos.filter((t) => !t.completed)
    saveTodos(filtered)
  },
}
