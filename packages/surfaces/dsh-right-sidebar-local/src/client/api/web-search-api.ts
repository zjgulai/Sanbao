/**
 * Web Search API - P2 Implementation
 * 
 * Data source: localStorage for demo, can be extended to browser history API
 * or file-based storage in production.
 */

export interface WebSearchRecord {
  id: string
  url: string
  title: string
  snippet?: string
  timestamp: number
  tags: string[]
}

export interface WebSearchApi {
  list(limit?: number): Promise<WebSearchRecord[]>
  delete(id: string): Promise<void>
  clear(): Promise<void>
  add(url: string, title: string, snippet?: string, tags?: string[]): Promise<WebSearchRecord>
}

// Storage key for localStorage
const STORAGE_KEY = 'dsh-right-sidebar:web-search-history'

// Generate unique ID
function generateId(): string {
  return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Load records from storage
function loadRecords(): WebSearchRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch {
    return []
  }
}

// Save records to storage
function saveRecords(records: WebSearchRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (error) {
    console.error('[dsh-right-sidebar] Failed to save web search history:', error)
  }
}

// Real implementation
export const webSearchApi: WebSearchApi = {
  list: async (limit = 50): Promise<WebSearchRecord[]> => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    const records = loadRecords()
    return records.slice(0, limit)
  },

  delete: async (id: string): Promise<void> => {
    const records = loadRecords()
    const filtered = records.filter((r) => r.id !== id)
    saveRecords(filtered)
  },

  clear: async (): Promise<void> => {
    saveRecords([])
  },

  add: async (
    url: string,
    title: string,
    snippet?: string,
    tags: string[] = [],
  ): Promise<WebSearchRecord> => {
    const records = loadRecords()
    const newRecord: WebSearchRecord = {
      id: generateId(),
      url,
      title,
      snippet,
      tags,
      timestamp: Date.now(),
    }
    records.unshift(newRecord) // Add to beginning
    // Limit to 100 records
    if (records.length > 100) {
      records.pop() // Remove oldest
    }
    saveRecords(records)
    return newRecord
  },
}

// Demo data for development
const DEMO_RECORDS: WebSearchRecord[] = [
  {
    id: 'demo_1',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    title: 'JavaScript | MDN',
    snippet: 'JavaScript is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.',
    timestamp: Date.now() - 3600000, // 1 hour ago
    tags: ['javascript', 'documentation'],
  },
  {
    id: 'demo_2',
    url: 'https://react.dev/reference/react',
    title: 'React API Reference',
    snippet: 'Learn how to use React components, hooks, and other core features of the library.',
    timestamp: Date.now() - 7200000, // 2 hours ago
    tags: ['react', 'frontend'],
  },
  {
    id: 'demo_3',
    url: 'https://www.typescriptlang.org/docs/',
    title: 'TypeScript Documentation',
    snippet: 'TypeScript is a superset of JavaScript that compiles to plain JavaScript.',
    timestamp: Date.now() - 86400000, // 1 day ago
    tags: ['typescript', 'types'],
  },
]

// Initialize with demo data if empty
if (loadRecords().length === 0) {
  saveRecords(DEMO_RECORDS)
}
