/**
 * Sources API - P2 Implementation
 * 
 * Data source: File system scan or database in production.
 * This demo uses localStorage for simplicity.
 */

export interface SourceItem {
  id: string
  title: string
  type: 'paper' | 'document' | 'link' | 'note' | 'other'
  url?: string
  path?: string
  author?: string
  publishedAt?: Date
  citedBy: string[] // IDs of outputs that cite this source
  tags: string[]
  description?: string
  createdAt: Date
}

export interface SourcesApi {
  list(limit?: number): Promise<SourceItem[]>
  delete(id: string): Promise<void>
  addCitation(sourceId: string, outputId: string): Promise<void>
  removeCitation(sourceId: string, outputId: string): Promise<void>
  add(item: Omit<SourceItem, 'id' | 'createdAt'>): Promise<SourceItem>
}

// Storage key for localStorage
const STORAGE_KEY = 'dsh-right-sidebar:sources'

// Generate unique ID
function generateId(): string {
  return `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Load items from storage
function loadItems(): SourceItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    const parsed = JSON.parse(data)
    return parsed.map((item: any) => ({
      ...item,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : undefined,
      createdAt: new Date(item.createdAt),
    }))
  } catch {
    return []
  }
}

// Save items to storage
function saveItems(items: SourceItem[]): void {
  try {
    const serialized = items.map((item) => ({
      ...item,
      publishedAt: item.publishedAt?.toISOString(),
      createdAt: item.createdAt.toISOString(),
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized))
  } catch (error) {
    console.error('[dsh-right-sidebar] Failed to save sources:', error)
  }
}

// Demo data for development
const DEMO_SOURCES: SourceItem[] = [
  {
    id: 'demo_1',
    title: 'ADR-0140: Right Sidebar Redesign',
    type: 'document',
    path: '/Users/lute/project/Magpie-Horch/docs/adr/ADR-0140.md',
    author: 'lute',
    publishedAt: new Date('2026-09-20'),
    citedBy: ['output_123'],
    tags: ['architecture', 'sidebar'],
    description: '右边侧边栏重构架构决策记录',
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'demo_2',
    title: 'TypeScript 3.0 Release Notes',
    type: 'paper',
    url: 'https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html',
    author: 'TypeScript Team',
    publishedAt: new Date('2018-10-11'),
    citedBy: ['output_456', 'output_789'],
    tags: ['typescript', 'language'],
    description: 'TypeScript 3.0 新特性介绍',
    createdAt: new Date(Date.now() - 172800000),
  },
  {
    id: 'demo_3',
    title: 'React Hooks Documentation',
    type: 'link',
    url: 'https://react.dev/reference/react',
    citedBy: ['output_abc'],
    tags: ['react', 'hooks'],
    description: 'React Hooks 官方文档',
    createdAt: new Date(Date.now() - 259200000),
  },
]

// Initialize with demo data if empty
if (loadItems().length === 0) {
  saveItems(DEMO_SOURCES)
}

// Real implementation
export const sourcesApi: SourcesApi = {
  list: async (limit = 50): Promise<SourceItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    return loadItems().slice(0, limit)
  },

  delete: async (id: string): Promise<void> => {
    const items = loadItems()
    const filtered = items.filter((item) => item.id !== id)
    saveItems(filtered)
  },

  addCitation: async (sourceId: string, outputId: string): Promise<void> => {
    const items = loadItems()
    const source = items.find((item) => item.id === sourceId)
    if (source && !source.citedBy.includes(outputId)) {
      source.citedBy.push(outputId)
      saveItems(items)
    }
  },

  removeCitation: async (sourceId: string, outputId: string): Promise<void> => {
    const items = loadItems()
    const source = items.find((item) => item.id === sourceId)
    if (source) {
      source.citedBy = source.citedBy.filter((id) => id !== outputId)
      saveItems(items)
    }
  },

  add: async (item: Omit<SourceItem, 'id' | 'createdAt'>): Promise<SourceItem> => {
    const items = loadItems()
    const newItem: SourceItem = {
      ...item,
      id: generateId(),
      createdAt: new Date(),
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
