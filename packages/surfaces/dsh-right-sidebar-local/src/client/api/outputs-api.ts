/**
 * Outputs API - P2 Implementation
 * 
 * Data source: File system scan or database in production.
 * This demo uses localStorage for simplicity.
 */

export interface OutputItem {
  id: string
  title: string
  type: 'document' | 'code' | 'report' | 'image' | 'other'
  path: string
  size?: number
  createdAt: Date
  updatedAt: Date
  tags: string[]
  description?: string
}

export interface OutputsApi {
  list(limit?: number, typeFilter?: string): Promise<OutputItem[]>
  delete(id: string): Promise<void>
  get(id: string): Promise<OutputItem | undefined>
  add(item: Omit<OutputItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<OutputItem>
}

// Storage key for localStorage
const STORAGE_KEY = 'dsh-right-sidebar:outputs'

// Generate unique ID
function generateId(): string {
  return `output_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Load items from storage
function loadItems(): OutputItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    const parsed = JSON.parse(data)
    // Convert string dates back to Date objects
    return parsed.map((item: any) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    }))
  } catch {
    return []
  }
}

// Save items to storage
function saveItems(items: OutputItem[]): void {
  try {
    const serialized = items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch (error) {
    console.error('[dsh-right-sidebar] Failed to save outputs:', error)
  }
}

// Demo data for development
const DEMO_OUTPUTS: OutputItem[] = [
  {
    id: 'demo_1',
    title: 'ADR-0140.md',
    type: 'document',
    path: '/Users/lute/project/Magpie-Horch/docs/adr/ADR-0140.md',
    size: 8456,
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 3600000),
    tags: ['adr', 'architecture'],
    description: '右边侧边栏重构架构决策记录',
  },
  {
    id: 'demo_2',
    title: 'sidebar-entry.ts',
    type: 'code',
    path: '/Users/lute/project/Magpie-Horch/packages/surfaces/dsh-right-sidebar-local/src/client/sidebar-entry.ts',
    size: 5234,
    createdAt: new Date(Date.now() - 7200000),
    updatedAt: new Date(Date.now() - 1800000),
    tags: ['typescript', 'sidebar'],
    description: '侧边栏条目注入核心逻辑',
  },
  {
    id: 'demo_3',
    title: 'performance-report.pdf',
    type: 'report',
    path: '/Users/lute/project/Magpie-Horch/reports/performance-report.pdf',
    size: 245678,
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
    tags: ['report', 'performance'],
    description: 'Q3 性能分析报告',
  },
]

// Initialize with demo data if empty
if (loadItems().length === 0) {
  saveItems(DEMO_OUTPUTS)
}

// Real implementation
export const outputsApi: OutputsApi = {
  list: async (limit = 50, typeFilter?: string): Promise<OutputItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    let items = loadItems()
    if (typeFilter) {
      items = items.filter((item) => item.type === typeFilter)
    }
    return items.slice(0, limit)
  },

  delete: async (id: string): Promise<void> => {
    const items = loadItems()
    const filtered = items.filter((item) => item.id !== id)
    saveItems(filtered)
  },

  get: async (id: string): Promise<OutputItem | undefined> => {
    const items = loadItems()
    return items.find((item) => item.id === id)
  },

  add: async (item: Omit<OutputItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<OutputItem> => {
    const items = loadItems()
    const newItem: OutputItem = {
      ...item,
      id: generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    items.unshift(newItem)
    // Limit to 100 items
    if (items.length > 100) {
      items.pop()
    }
    saveItems(items)
    return newItem
  },
}
