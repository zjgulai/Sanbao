import {
  createSageFixtureViewState,
  type SageMatterViewState,
} from './view-state.js'
import {
  createSageActionPreview,
  type SageActionPreview,
} from './action-preview.js'

/** Sage-owned component markup for the first workbench slice. */

const STAGE_LABELS: Readonly<Record<SageMatterViewState['matter']['stage'], string>> = {
  created: '已创建',
  evidence: '整理证据',
  running: '执行中',
  clarification: '等待澄清',
  'artifact-receipt': '等待回执',
  'failed-retry': '失败待复核',
}

const ACTIONABILITY_LABELS: Readonly<Record<SageMatterViewState['actionability'], string>> = {
  allowed: '可提交',
  blocked: '已阻断',
  'requires-confirmation': '需要确认',
}

const ACTION_LABELS: Readonly<Record<SageActionPreview['actionType'], string>> = {
  'create-matter': '创建经营事项',
  'enter-evidence': '录入证据',
  'answer-clarification': '回答澄清',
  approve: '批准',
  reject: '拒绝',
  revoke: '撤销',
  'start-attempt': '开始执行',
  'stop-attempt': '停止执行',
  'retry-attempt': '重试执行',
  'open-artifact': '打开产物',
  'accept-receipt': '接受回执',
  'reject-receipt': '拒绝回执',
  'retry-capability': '重试能力检查',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function renderActionPreview(preview: SageActionPreview): string {
  const actionabilityLabel = ACTIONABILITY_LABELS[preview.actionability]
  const revisionId = escapeHtml(preview.revisionId ?? '服务接线后确定')
  const actionScope = escapeHtml(preview.actionScope ?? '能力恢复检查')
  const denialReason = escapeHtml(preview.denialReason ?? 'none')
  const idempotency = preview.idempotency.state === 'not-issued'
    ? '服务接线后生成'
    : preview.idempotency.key ?? '服务未返回'
  return `
    <article class="sage-action-preview-card" data-action-preview="${preview.actionType}" data-submission-state="${preview.submissionState}">
      <div class="sage-action-preview-head"><span class="sage-card-label">ACTION PREVIEW</span><strong>${ACTION_LABELS[preview.actionType]}</strong></div>
      <div class="sage-action-preview-state ${preview.actionability === 'blocked' ? 'is-blocked' : ''}">${actionabilityLabel}</div>
      <p class="sage-preview-meta"><span>revision</span><code>${revisionId}</code></p>
      <p class="sage-preview-meta"><span>scope</span><code>${actionScope}</code></p>
      <p class="sage-preview-meta"><span>权限 · 可用性 · 兼容性</span><code>${preview.authorizationState} · ${preview.availabilityState} · ${preview.compatibilityOutcome}</code></p>
      <p class="sage-preview-denial">阻断原因：<code>${denialReason}</code></p>
      <div class="sage-preview-foot"><span>幂等键：${escapeHtml(idempotency)}</span><span class="sage-preview-not-submitted">预览，不提交</span></div>
    </article>
  `
}

/**
 * Keep the first UI slice framework-free and deterministic. The surrounding document owns the
 * transport bridge; this module owns only the visible component tree and local navigation hooks.
 */
export function renderSageWorkspace(viewState: SageMatterViewState = createSageFixtureViewState()): string {
  const projectionLabel = viewState.projectionSource === 'fixture' ? 'fixture projection' : 'live projection'
  const stageLabel = STAGE_LABELS[viewState.matter.stage]
  const actionabilityLabel = ACTIONABILITY_LABELS[viewState.actionability]
  const goal = escapeHtml(viewState.matter.goal)
  const matterId = escapeHtml(viewState.matter.matterId)
  const revisionId = escapeHtml(viewState.matter.currentRevisionId ?? 'revision pending')
  const denialReason = escapeHtml(viewState.denialReason ?? 'none')
  const actionPreviews = viewState.actions
    .map((action) => createSageActionPreview(viewState, action.type))
    .map(renderActionPreview)
    .join('')
  return `
    <div class="sage-app" data-sage-workspace data-projection-source="${viewState.projectionSource}">
      <aside class="sage-sidebar" aria-label="Sage 导航">
        <div class="sage-brand" aria-label="Sage">
          <span class="sage-mark" aria-hidden="true"><span></span></span>
          <span>Sage</span>
        </div>
        <p class="sage-nav-label">工作台</p>
        <nav class="sage-nav" role="tablist" aria-label="工作台视图">
          <button class="sage-nav-item is-active" type="button" role="tab" aria-selected="true" aria-controls="panel-overview" data-view="overview">
            <span class="sage-nav-icon" aria-hidden="true">⌂</span><span>总览</span>
          </button>
          <button class="sage-nav-item" type="button" role="tab" aria-selected="false" aria-controls="panel-matter" data-view="matter">
            <span class="sage-nav-icon" aria-hidden="true">◌</span><span>经营事项</span>
          </button>
          <button class="sage-nav-item" type="button" role="tab" aria-selected="false" aria-controls="panel-capabilities" data-view="capabilities">
            <span class="sage-nav-icon" aria-hidden="true">◇</span><span>能力</span>
          </button>
          <button class="sage-nav-item" type="button" role="tab" aria-selected="false" aria-controls="panel-governance" data-view="governance">
            <span class="sage-nav-icon" aria-hidden="true">⊙</span><span>治理</span>
          </button>
        </nav>
        <div class="sage-sidebar-foot">
          <span class="sage-status-dot" data-runtime-dot aria-hidden="true"></span>
          <span data-runtime-label>正在检查运行状态</span>
        </div>
      </aside>

      <main class="sage-main">
        <header class="sage-topbar">
          <div>
            <p class="sage-kicker">SAGE WORKSPACE</p>
            <p class="sage-breadcrumb">当前工作台 <span aria-hidden="true">/</span> 经营网络</p>
          </div>
          <div class="sage-topbar-meta">
            <span class="sage-fixture-pill">${projectionLabel} · 不执行外部动作</span>
            <span class="sage-runtime-pill" data-runtime-badge>检查中</span>
          </div>
        </header>

        <section class="sage-panel is-visible" id="panel-overview" role="tabpanel" data-panel="overview" aria-labelledby="view-overview">
          <div class="sage-hero">
            <div class="sage-hero-copy">
              <p class="sage-eyebrow">SHARED OPERATING MATTER</p>
              <h1>让经营目标，<br><em>在明确边界内持续推进。</em></h1>
              <p class="sage-lead">Sage 把事实、判断、责任与回执组织在同一经营事项中。先看当前边界，再决定下一步是否值得推进。</p>
              <div class="sage-hero-actions">
                <button class="sage-primary-button" type="button" data-view-target="matter">查看经营事项</button>
                <span class="sage-muted-copy">当前只展示安全投影与演示结构</span>
              </div>
            </div>
            <div class="sage-network-card" aria-label="经营网络示意">
              <div class="sage-network-head"><span>OPERATING NETWORK</span><span class="sage-network-signal" aria-hidden="true"></span></div>
              <div class="sage-network-orbit orbit-one"><span>市场</span></div>
              <div class="sage-network-orbit orbit-two"><span>渠道</span></div>
              <div class="sage-network-orbit orbit-three"><span>供应</span></div>
              <div class="sage-network-core"><strong>经营<br>事项</strong><small>事实 · 判断 · 回执</small></div>
              <div class="sage-network-caption">一个事项连接目标、证据与责任。</div>
            </div>
          </div>

          <div class="sage-grid sage-grid-overview">
            <section class="sage-card sage-runtime-card" aria-labelledby="state-title">
              <div class="sage-card-head"><span class="sage-card-label">RUNTIME</span><span class="sage-card-index">01</span></div>
              <div class="sage-card-icon" aria-hidden="true">↗</div>
              <h2 id="state-title">正在检查</h2>
              <p id="state-message" role="status" aria-live="polite">正在读取 Sage 的受控状态。</p>
              <button class="sage-secondary-button" id="retry" type="button" hidden>重新检查</button>
              <div class="sage-state-row"><span>当前身份</span><strong id="auth-name"></strong></div>
              <button class="sage-secondary-button" id="login" type="button" hidden>登录</button>
              <button class="sage-secondary-button" id="logout" type="button" hidden>退出登录</button>
              <p class="sage-card-note">这里只反映当前能力运行时状态，不等于业务授权或外部能力可用。</p>
            </section>

            <section class="sage-card sage-matter-card" aria-labelledby="matter-card-title">
              <div class="sage-card-head"><span class="sage-card-label">CURRENT MATTER</span><span class="sage-card-index">02</span></div>
              <div class="sage-matter-status"><span class="sage-status-dot is-muted" aria-hidden="true"></span>${stageLabel}</div>
              <h2 id="matter-card-title">${goal}</h2>
              <p>当前投影来自 ${projectionLabel}，用于验证事项身份、阶段、证据和阻断位置。</p>
              <div class="sage-matter-meta"><span>${projectionLabel}</span><span>${revisionId}</span></div>
              <button class="sage-link-button" type="button" data-view-target="matter">打开事项脉络 <span aria-hidden="true">→</span></button>
            </section>
          </div>

          <section class="sage-evidence-strip" aria-label="事项脉络">
            <div class="sage-evidence-heading"><span class="sage-card-label">MATTER TRACE</span><strong>证据 → 决定 → 动作 → 产物 → 回执</strong></div>
            <ol class="sage-trace-list">
              <li class="is-current"><span>01</span><b>事实</b><small>待整理</small></li>
              <li><span>02</span><b>判断</b><small>待确认</small></li>
              <li><span>03</span><b>行动</b><small>已阻断</small></li>
              <li><span>04</span><b>回执</b><small>未发生</small></li>
            </ol>
          </section>
        </section>

        <section class="sage-panel" id="panel-matter" role="tabpanel" data-panel="matter" aria-labelledby="view-matter" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">CURRENT OPERATING MATTER</p><h1>经营事项脉络</h1></div><span class="sage-fixture-pill">${projectionLabel}</span></div>
          <div class="sage-matter-layout">
            <article class="sage-card sage-matter-main"><div class="sage-card-head"><span class="sage-card-label">MATTER / ${matterId}</span><span class="sage-card-index">${revisionId}</span></div><h2>${goal}</h2><p>这是 ViewState 的只读投影，用来验证事项身份、阶段、证据、阻断和责任位置；不读取外部业务数据。</p><div class="sage-state-row"><span>阶段</span><strong>${stageLabel}</strong></div><div class="sage-state-row"><span>动作性</span><strong class="is-blocked">${actionabilityLabel}</strong></div><div class="sage-state-row"><span>阻断原因</span><strong class="is-blocked">${denialReason}</strong></div></article>
            <aside class="sage-card sage-side-note"><span class="sage-card-label">WHY BLOCKED</span><h2>先把事实说清楚</h2><p>真实创建、审批、运行、停止、重试和回执仍必须等待 Application Service、真实 authority 与能力预检；本页只展示只读预览，不产生提交。</p><button class="sage-secondary-button" type="button" data-view-target="governance">查看边界</button></aside>
          </div>
          <section class="sage-action-preview-section" aria-label="动作预览">
            <div class="sage-action-preview-heading"><div><span class="sage-card-label">READ-ONLY ACTION SURFACE</span><h2>下一步动作预览</h2></div><span class="sage-fixture-pill">不提交 · fixture</span></div>
            <div class="sage-preview-grid">${actionPreviews}</div>
          </section>
        </section>

        <section class="sage-panel" id="panel-capabilities" role="tabpanel" data-panel="capabilities" aria-labelledby="view-capabilities" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">CAPABILITY SURFACE</p><h1>能力与接线状态</h1></div><span class="sage-fixture-pill">${projectionLabel}</span></div>
          <div class="sage-capability-grid">
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">01</span><h2>运行时</h2><p>当前唯一真实接线是 Sage Host 的受控状态读取与恢复动作。</p><strong class="sage-state-tag">runtime projection</strong></article>
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">02</span><h2>外部能力</h2><p>正式 bridge observation seam 尚未开放，插件和 MCP 保持隔离。</p><strong class="sage-state-tag is-blocked">blocked · seam pending</strong></article>
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">03</span><h2>业务 Adapter</h2><p>能力适配器只返回安全投影；真实 ActionIntent 进入下一批 Application Service。</p><strong class="sage-state-tag">contract runway</strong></article>
          </div>
        </section>

        <section class="sage-panel" id="panel-governance" role="tabpanel" data-panel="governance" aria-labelledby="view-governance" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">ACCOUNTABILITY &amp; GOVERNANCE</p><h1>行动边界</h1></div><span class="sage-fixture-pill">fail closed</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-governance-card"><span class="sage-card-label">当前规则</span><h2>事实、授权与可用性分开</h2><p>Host ready、工具可见、版本相同或 fixture equivalent 都不能单独变成业务授权。</p></article>
            <article class="sage-card sage-governance-card"><span class="sage-card-label">下一道门</span><h2>Application Service</h2><p>真实业务动作必须经 ViewState / ActionIntent、权限、兼容性、可用性和 Adapter 预检的固定顺序。</p></article>
          </div>
        </section>

        <footer class="sage-footer"><span>Sage · self-owned product surface</span><span>本页不发送信息，不连接外部业务系统。</span></footer>
      </main>
    </div>
  `
}
