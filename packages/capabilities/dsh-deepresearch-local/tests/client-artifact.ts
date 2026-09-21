import { runInNewContext } from 'node:vm'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { expect } from 'vitest'
import type * as Client from '../src/client/index.ts'

/** Execute the shipped loader factory; only browser/host boundaries are substitutes. */
export function materializeClient(source: string) {
  type Row = { id: string; factory: (require: (id: string) => unknown) => typeof Client }
  type Style = { tagName: string; dataset: Record<string, string>; textContent: string }
  const rows: Row[] = []
  const styles: Style[] = []
  const requests: string[] = []
  const modules = new Map<string, unknown>([
    ['react', React], ['react/jsx-runtime', jsxRuntime], ['@deepseek-ai/dsh-client-ui-primitives', primitives],
  ])
  const location = { hash: '', pathname: '/', search: '' }
  const writeUrl = (_state: unknown, _title: string, url: string) => { location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '' }
  runInNewContext(source, {
    window: {
      __ModuleLoader__: { load: (row: Row) => rows.push(row) },
      location, history: { pushState: writeUrl, replaceState: writeUrl }, addEventListener: () => undefined,
    },
    document: {
      querySelector: () => null,
      createElement: (tagName: string): Style => ({ tagName, dataset: {}, textContent: '' }),
      head: { appendChild: (style: Style) => styles.push(style) },
    },
  })
  expect(rows).toHaveLength(1)
  expect(rows[0]!.id).toBe('@deepseek-ai/dsh-deepresearch')
  const client = rows[0]!.factory(id => {
    requests.push(id)
    if (!modules.has(id)) throw new Error(`Unexpected client external: ${id}`)
    return modules.get(id)
  })
  expect([...new Set(requests)].sort()).toEqual([...modules.keys()].sort())
  return { client, styles, location }
}

/** Read the actual injected stylesheet through CSSOM, including the z-index consumers. */
export function expectModalLayers(styles: ReturnType<typeof materializeClient>['styles']) {
  const views = styles.filter(style => style.dataset.pluginCss === '@deepseek-ai/dsh-deepresearch/views.module.css')
  expect(views).toHaveLength(1)
  const tag = document.createElement('style')
  tag.textContent = views[0]!.textContent
  document.head.appendChild(tag)
  try {
    const rules = Array.from(tag.sheet!.cssRules).filter((rule): rule is CSSStyleRule => 'selectorText' in rule)
    const layer = (name: string, offset: number) => {
      const property = `--dsh-deepresearch-${name}-layer`
      const declarations = rules.filter(rule => rule.style.getPropertyValue(property) !== '')
      expect(declarations).toHaveLength(1)
      const expression = declarations[0]!.style.getPropertyValue(property).trim()
      expect(expression).toBe(`calc(2147480000 + ${offset})`)
      const consumer = rules.find(rule => rule.style.getPropertyValue('z-index').trim() === `var(${property})`)
      expect(consumer, `${property} must still control a fixed backdrop`).toBeDefined()
      expect(consumer!.style.getPropertyValue('position')).toBe('fixed')
      // JSDOM does not resolve custom-property calc() in z-index; evaluate its parsed operands.
      const terms = /^calc\((\d+) \+ (\d+)\)$/.exec(expression)!
      return Number(terms[1]) + Number(terms[2])
    }
    const modal = layer('modal', 1000)
    const confirm = layer('confirm', 1100)
    expect(modal).toBe(2147481000)
    expect(confirm).toBe(2147481100)
    expect(confirm).toBeGreaterThan(modal)
    expect(confirm).toBeLessThan(2147483001) // Settings shell's modal layer.
  } finally {
    tag.remove()
  }
}
