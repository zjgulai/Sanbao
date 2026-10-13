import { useState, type ReactNode } from 'react'

import { EXPERT_REGISTRY, type ExpertRecord } from './expert-registry.generated.js'
import { Icon } from './icons.js'

const KIND_LABEL: Record<ExpertRecord['roleKind'], string> = { MGT: '管理身份', AGT: '岗位专家' }

// Catalogue metadata is not an active Preset, organization membership or execution grant.
export function ExpertsPage(): ReactNode {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | ExpertRecord['roleKind']>('all')
  const q = query.trim().toLocaleLowerCase()
  const experts = EXPERT_REGISTRY.experts.filter(expert => {
    if (kind !== 'all' && expert.roleKind !== kind) return false
    return [expert.id, expert.alias, expert.title, expert.mission, expert.group]
      .some(value => value?.toLocaleLowerCase().includes(q))
  })
  const { managers, agents, total } = EXPERT_REGISTRY.counts
  const filters = [
    { kind: 'all', label: `全部 ${total}` },
    { kind: 'MGT', label: `管理身份 ${managers}` },
    { kind: 'AGT', label: `岗位专家 ${agents}` },
  ] as const
  return <section className="experts-page" aria-label="专家">
    <header className="experts-header">
      <div><h1>专家</h1><p>浏览管理身份与岗位专家，了解各自的使命与工作方式。</p></div>
      <span className="experts-count">内置专家 {total}</span>
    </header>
    <div className="experts-tools">
      <div className="experts-filters" role="group" aria-label="专家类别">
        {filters.map(filter => <button key={filter.kind} type="button" className="text-button"
          aria-pressed={kind === filter.kind} onClick={() => setKind(filter.kind)}>{filter.label}</button>)}
      </div>
      <label className="experts-search">
        <span>搜索专家</span>
        <input type="search" aria-label="搜索专家" placeholder="搜索名称、使命或岗位"
          value={query} onChange={event => setQuery(event.currentTarget.value)} />
      </label>
    </div>
    <p id="expert-catalogue-note" className="expert-catalogue-note">设计目录 · 来源：AI 组织变革。目录不授予数据或工具权限，暂不支持新建或对话。</p>
    <p className="experts-result-count" role="status" aria-live="polite">显示 {experts.length} 位专家</p>
    {experts.length === 0
      ? <div className="experts-empty"><p>没有匹配的专家。</p><button type="button" className="text-button"
        aria-label="清空搜索" onClick={() => setQuery('')}>清空搜索</button></div>
      : <ul className="experts-grid" aria-label="专家目录">
        <li className="expert-create-card">
          <button type="button" className="expert-create-button" disabled aria-label="新建专家" aria-describedby="expert-catalogue-note">
            <span className="expert-create-icon" aria-hidden="true"><Icon name="plus" size={24} /></span>
            <strong>新建专家</strong>
            <span>尚未开放</span>
          </button>
        </li>
        {experts.map(expert => <li className="expert-card" key={expert.id} data-expert-id={expert.id} data-role-kind={expert.roleKind}>
          <img className="expert-avatar" src={expert.avatar} alt="" width={64} height={64} />
          <h2 className="expert-alias">{expert.alias}</h2>
          <span className="expert-title">{KIND_LABEL[expert.roleKind]} · {expert.title}</span>
          <p className="expert-mission">{expert.mission}</p>
          <p className="expert-personality">{expert.personality}</p>
          <div className="expert-actions">
            <button type="button" className="text-button" disabled aria-label={`与 ${expert.alias} 对话`}
              aria-describedby="expert-catalogue-note">对话</button>
          </div>
        </li>)}
      </ul>}
  </section>
}
