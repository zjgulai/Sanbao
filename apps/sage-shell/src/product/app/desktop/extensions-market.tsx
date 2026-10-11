import { useState, type ReactNode } from 'react'

/** Loop-Q R11 line A: the extension market shell (QDR.P04.market.*). The observed headings,
 *  subtitles, 热门/最新 sort pair and the 全部 category row are structure only — no market
 *  provider exists, so the data area shows the named not-wired reason and never entries, cards,
 *  recommendation slots, add entries or install buttons. */
export const MARKET_KINDS = ['插件', '技能', '连接器'] as const
export type MarketKind = (typeof MARKET_KINDS)[number]

const MARKET_HEADINGS: Record<MarketKind, readonly [string, string]> = {
  插件: ['发现 Plugins', '聚焦 编码、数据分析、设计。'],
  技能: ['发现 Skills', '聚焦 效率提升、内容创作、官方精选。'],
  连接器: ['发现 Connectors', '聚焦 内容创作、知识研究。'],
}

export function ExtensionsMarketView({ kind, onKind, onBack }: {
  readonly kind: MarketKind
  readonly onKind: (next: MarketKind) => void
  readonly onBack: () => void
}): ReactNode {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'热门' | '最新'>('热门')
  const [category, setCategory] = useState<'全部'>('全部')
  const [refreshNote, setRefreshNote] = useState('')
  const [title, subtitle] = MARKET_HEADINGS[kind]
  return <>
    <div className="page-tools" aria-label="市场工具">
      <button type="button" className="text-button" aria-label="已安装" onClick={onBack}>已安装</button>
      <div className="page-tabs" role="tablist" aria-label="扩展类型">
        {MARKET_KINDS.map((label) => <button key={label} type="button" role="tab" aria-label={label}
          aria-selected={kind === label} className={kind === label ? 'active' : ''}
          onClick={() => onKind(label)}>{label}</button>)}
      </div>
      <button type="button" className="text-button" aria-label="刷新市场"
        onClick={() => setRefreshNote('刷新尚未接通：市场服务未建立；未取得任何读数。')}>刷新市场</button>
      <input aria-label="搜索市场" placeholder="搜索名称/说明/标签" value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </div>
    <h1>{title}</h1>
    <p className="page-note">{subtitle}</p>
    <div className="page-tools" aria-label="市场排序">
      {(['热门', '最新'] as const).map((label) => <button key={label} type="button"
        aria-pressed={sort === label} className={sort === label ? 'active' : ''}
        onClick={() => setSort(label)}>{label}</button>)}
    </div>
    <div className="page-tools" aria-label="市场类别">
      <button type="button" aria-pressed={category === '全部'} className={category === '全部' ? 'active' : ''}
        onClick={() => setCategory('全部')}>全部</button>
    </div>
    {refreshNote !== '' ? <p className="page-note" role="status">{refreshNote}</p> : null}
    <div className="extensions-empty" role="status">市场服务未接通（market-provider-unavailable）</div>
  </>
}
