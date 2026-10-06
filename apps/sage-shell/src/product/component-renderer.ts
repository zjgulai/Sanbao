import type { SageMatterViewState } from './view-state.js'
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

const STAGE_TRACK: ReadonlyArray<{
  readonly stage: SageMatterViewState['matter']['stage']
  readonly label: string
}> = [
  { stage: 'created', label: STAGE_LABELS.created },
  { stage: 'evidence', label: STAGE_LABELS.evidence },
  { stage: 'clarification', label: STAGE_LABELS.clarification },
  { stage: 'running', label: STAGE_LABELS.running },
  { stage: 'artifact-receipt', label: STAGE_LABELS['artifact-receipt'] },
  { stage: 'failed-retry', label: STAGE_LABELS['failed-retry'] },
]

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

function renderMatterStageTrack(currentStage: SageMatterViewState['matter']['stage'] | undefined): string {
  return STAGE_TRACK.map(({ stage, label }, index) => {
    const current = stage === currentStage
    return `
      <li class="sage-matter-stage-item${current ? ' is-current' : ''}" id="matter-stage-${stage}" data-matter-stage="${stage}" data-stage-state="${current ? 'current' : 'idle'}" aria-current="${current ? 'step' : 'false'}">
        <span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><strong>${label}</strong>
      </li>
    `
  }).join('')
}

/**
 * Keep the first UI slice framework-free and deterministic. The surrounding document owns the
 * transport bridge; this module owns only the visible component tree and local navigation hooks.
 */
export function renderSageWorkspace(viewState: SageMatterViewState | null = null): string {
  const projectionSource = viewState?.projectionSource ?? 'unavailable'
  const projectionLabel = viewState === null
    ? 'projection unavailable'
    : viewState.projectionSource === 'fixture' ? 'fixture projection' : 'live projection'
  const stageLabel = viewState === null ? '未读取' : STAGE_LABELS[viewState.matter.stage]
  const actionabilityLabel = viewState === null ? '已阻断' : ACTIONABILITY_LABELS[viewState.actionability]
  const goal = escapeHtml(viewState?.matter.goal ?? '当前没有可用的事项投影')
  const matterId = escapeHtml(viewState?.matter.matterId ?? '—')
  const revisionId = escapeHtml(viewState?.matter.currentRevisionId ?? '—')
  const responsibleRole = escapeHtml(viewState?.matter.responsiblePartyRoleRef ?? '—')
  const evidenceCount = viewState === null ? '—' : String(viewState.matter.evidenceCount)
  const unknownCount = viewState === null ? '—' : String(viewState.matter.unknownCount)
  const dependencyCount = viewState === null ? '—' : String(viewState.matter.dependencyCount)
  const clarification = escapeHtml(
    viewState?.matter.pendingClarification?.reason
      ?? (viewState === null ? '事项投影不可用，未读取澄清状态。' : '当前没有待回答澄清。'),
  )
  const denialReason = escapeHtml(viewState?.denialReason ?? (viewState === null ? '事项投影不可用' : 'none'))
  const actionPreviews = viewState === null ? '' : viewState.actions
    .map((action) => createSageActionPreview(viewState, action.type))
    .map(renderActionPreview)
    .join('')
  return `
    <div class="sage-app" id="sage-workspace" data-sage-workspace data-projection-source="${projectionSource}" data-matter-render-state="${projectionSource}">
      <aside class="sage-sidebar" aria-label="Sage 导航">
        <div class="sage-brand" aria-label="Sage">
          <span class="sage-mark" aria-hidden="true"><span></span></span>
          <span>Sage</span>
        </div>
        <p class="sage-nav-label">工作台</p>
        <nav class="sage-nav" role="tablist" aria-label="工作台视图" aria-orientation="vertical">
          <button class="sage-nav-item is-active" type="button" id="view-matter" role="tab" aria-label="经营事项" aria-selected="true" aria-controls="panel-matter" data-view="matter" tabindex="0">
            <span class="sage-nav-icon" aria-hidden="true">◌</span><span>经营事项</span><span class="sage-nav-count" id="nav-matter-count" data-nav-count="action" aria-label="待我处理" hidden></span>
          </button>
          <button class="sage-nav-item" type="button" id="view-search" role="tab" aria-label="搜索" aria-selected="false" aria-controls="panel-search" data-view="search" tabindex="-1">
            <span class="sage-nav-icon" aria-hidden="true">⌕</span><span>搜索</span>
          </button>
          <button class="sage-nav-item" type="button" id="view-automation" role="tab" aria-label="自动化" aria-selected="false" aria-controls="panel-automation" data-view="automation" tabindex="-1">
            <span class="sage-nav-icon" aria-hidden="true">⟳</span><span>自动化</span>
          </button>
          <button class="sage-nav-item" type="button" id="view-knowledge" role="tab" aria-label="知识" aria-selected="false" aria-controls="panel-knowledge" data-view="knowledge" tabindex="-1">
            <span class="sage-nav-icon" aria-hidden="true">▤</span><span>知识</span>
          </button>
          <button class="sage-nav-item" type="button" id="view-capabilities" role="tab" aria-label="能力" aria-selected="false" aria-controls="panel-capabilities" data-view="capabilities" tabindex="-1">
            <span class="sage-nav-icon" aria-hidden="true">◇</span><span>能力</span>
          </button>
          <button class="sage-nav-item" type="button" id="view-settings" role="tab" aria-label="设置" aria-selected="false" aria-controls="panel-settings" data-view="settings" tabindex="-1">
            <span class="sage-nav-icon" aria-hidden="true">⚙</span><span>设置</span>
          </button>
        </nav>
        <section class="sage-current-context" id="matter-context" data-workbench-region="current-context" aria-labelledby="matter-context-title">
          <span class="sage-card-label" id="matter-context-title">CURRENT MATTER</span>
          <strong id="matter-context-goal">${goal}</strong>
          <span id="matter-context-id">${matterId}</span>
          <span><span id="matter-context-stage">${stageLabel}</span> · <span id="matter-context-revision">${revisionId}</span></span>
        </section>
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
            <span class="sage-fixture-pill" id="matter-projection-pill">${projectionLabel} · 不执行外部动作</span>
            <span class="sage-runtime-pill" data-runtime-badge>检查中</span>
            <div class="sage-user-menu">
              <button class="sage-user-menu-trigger" type="button" id="user-menu" aria-haspopup="true" aria-expanded="false" aria-controls="user-menu-panel">
                <span aria-hidden="true">◎</span><span id="user-menu-identity" data-identity-label>正在读取身份</span>
              </button>
              <div class="sage-user-menu-panel" id="user-menu-panel" role="group" aria-label="用户菜单" hidden>
                <p class="sage-user-menu-note">快捷外观 · 与设置页读写同一份权威值；这里每次选择即时保存。</p>
                <label class="sage-user-menu-row" for="menu-theme">主题
                  <select id="menu-theme" aria-label="主题（用户菜单）"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-language">语言
                  <select id="menu-language" aria-label="语言（用户菜单）"><option value="zh">中文</option><option value="en">English</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-density">密度/缩放
                  <select id="menu-density" aria-label="密度与缩放（用户菜单）"><option value="comfortable">宽松</option><option value="compact">紧凑</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-font-style">字体风格
                  <select id="menu-font-style" aria-label="字体风格（用户菜单）"><option value="sans">无衬线</option><option value="serif">衬线</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-content-width">内容宽度
                  <select id="menu-content-width" aria-label="内容宽度（用户菜单）"><option value="standard">标准</option><option value="wide">宽</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-terminal-theme">终端主题
                  <select id="menu-terminal-theme" aria-label="终端主题（用户菜单）"><option value="follow">跟随主题</option><option value="manual">手动调整</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-file-icons">文件图标
                  <select id="menu-file-icons" aria-label="文件图标（用户菜单）"><option value="product">产品图标</option><option value="material">Material File Icons</option></select>
                </label>
                <label class="sage-user-menu-row" for="menu-icon-appearance">图标外观
                  <select id="menu-icon-appearance" aria-label="图标外观（用户菜单）"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select>
                </label>
                <p id="menu-note" class="sage-user-menu-note" role="status" aria-live="polite"></p>
                <button class="sage-secondary-button" id="user-menu-logout" type="button" data-logout-entry hidden>退出登录</button>
                <p class="sage-user-menu-note">快捷键、语音与任务监控浮层布局本版不可配置（后置），菜单里不留入口。身份与登出取自 Electron main 的同一份投影（与设置页同一权威值）。</p>
              </div>
            </div>
          </div>
        </header>

        <section class="sage-panel is-visible" id="panel-matter" role="tabpanel" data-panel="matter" aria-labelledby="view-matter">
          <div id="sage-matter-region" data-sage-region="matter-workbench" data-matter-region-state="unavailable">
          <div class="sage-section-heading"><div><p class="sage-eyebrow">CURRENT OPERATING MATTER</p><h1>经营事项脉络</h1></div><div class="sage-section-tools"><span class="sage-fixture-pill" id="matter-panel-source">${projectionLabel}</span><button class="sage-secondary-button sage-matter-trace-toggle" id="matter-trace-toggle" type="button" aria-controls="matter-trace-rail" aria-expanded="false">查看事项脉络</button></div></div>
          <div class="sage-matter-workbench" id="matter-workbench">
            <section class="sage-card sage-matter-workbench-main" id="matter-current-work" data-workbench-region="matter-focus" aria-labelledby="matter-detail-goal">
              <div class="sage-card-head"><span class="sage-card-label">MATTER / <span id="matter-detail-id">${matterId}</span></span><span class="sage-card-index" id="matter-detail-revision">${revisionId}</span></div>
              <h2 id="matter-detail-goal">${goal}</h2>
              <section class="sage-matter-stage-track" id="matter-stage-track" data-current-stage="${viewState?.matter.stage ?? 'unavailable'}" aria-labelledby="matter-stage-track-title">
                <div class="sage-matter-stage-track-head"><span class="sage-card-label" id="matter-stage-track-title">MATTER STAGES</span><strong>只标记当前阶段，不表示左侧阶段已完成</strong></div>
                <ol>${renderMatterStageTrack(viewState?.matter.stage)}</ol>
              </section>
              <div class="sage-matter-facts">
                <div class="sage-state-row"><span>责任角色</span><strong id="matter-detail-role">${responsibleRole}</strong></div>
                <div class="sage-state-row"><span>阶段</span><strong id="matter-detail-stage">${stageLabel}</strong></div>
              </div>
              <section class="sage-matter-clarification" aria-labelledby="matter-clarification-title">
                <span class="sage-card-label" id="matter-clarification-title">CLARIFICATION</span>
                <p id="matter-clarification">${clarification}</p>
              </section>
              <section class="sage-matter-composer" id="matter-readonly-composer" aria-label="只读下一步预览">
                <div class="sage-action-preview-heading"><div><span class="sage-card-label">READ-ONLY ACTION SURFACE</span><h2>下一步动作预览</h2></div><span class="sage-fixture-pill" id="matter-action-source">不提交 · ${projectionSource}</span></div>
                <p class="sage-card-note">只读 composer：没有输入、提交或执行入口；真实动作仍由 Application Service 与 authority 决定。</p>
                <div class="sage-preview-grid" id="matter-action-previews">${actionPreviews}</div>
              </section>
            </section>
            <aside class="sage-card sage-matter-trace-rail" id="matter-trace-rail" role="complementary" data-workbench-region="matter-trace" data-drawer-open="false" aria-labelledby="matter-trace-title" aria-hidden="false" aria-modal="false" tabindex="-1">
              <div class="sage-trace-rail-head"><div><span class="sage-card-label">EVIDENCE &amp; EXECUTION TRACE</span><h2 id="matter-trace-title">事实脉络</h2></div><button class="sage-secondary-button sage-matter-trace-close" id="matter-trace-close" type="button">关闭</button></div>
              <div class="sage-matter-metrics" aria-label="事项事实计数">
                <div><strong id="matter-metric-evidence">${evidenceCount}</strong><span>证据</span></div>
                <div><strong id="matter-metric-unknown">${unknownCount}</strong><span>未知</span></div>
                <div><strong id="matter-metric-dependency">${dependencyCount}</strong><span>依赖</span></div>
              </div>
              <div class="sage-trace-state"><span>动作性</span><strong class="is-blocked" id="matter-detail-actionability">${actionabilityLabel}</strong></div>
              <div class="sage-trace-state"><span>阻断原因</span><strong class="is-blocked" id="matter-detail-denial">${denialReason}</strong></div>
              <section class="sage-matter-trace-group" aria-labelledby="matter-decision-title"><div class="sage-trace-group-head"><h3 id="matter-decision-title">决定</h3><span id="matter-decision-count">—</span></div><ol id="matter-decision-rows"></ol></section>
              <section class="sage-matter-trace-group" aria-labelledby="matter-attempt-title"><div class="sage-trace-group-head"><h3 id="matter-attempt-title">执行尝试</h3><span id="matter-attempt-count">—</span></div><ol id="matter-attempt-rows"></ol></section>
              <section class="sage-matter-trace-group" aria-labelledby="matter-artifact-title"><div class="sage-trace-group-head"><h3 id="matter-artifact-title">产物</h3><span id="matter-artifact-count">—</span></div><ol id="matter-artifact-rows"></ol></section>
              <section class="sage-matter-trace-group" aria-labelledby="matter-receipt-title"><div class="sage-trace-group-head"><h3 id="matter-receipt-title">回执</h3><span id="matter-receipt-count">—</span></div><ol id="matter-receipt-rows"></ol></section>
            </aside>
          </div>
          </div>
          <div class="sage-support-heading"><span class="sage-card-label">CONNECTED SURFACES</span><h2>已接线操作面</h2><p>以下入口沿用既有 Application Service 合同；它们不属于上方只读 composer。</p></div>
                    <section class="sage-matter-list-section" aria-label="事项列表">
            <article class="sage-card sage-matter-list-card" id="sage-region-matter-list" data-sage-region="matter-list" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">MATTER LIST · ACTION NEED</span><span class="sage-card-index">D0</span></div>
              <h2>事项列表（按行动需求分区）</h2>
              <p class="sage-card-note">分区由 Application Service 从既有事实推导、按最近更新排序（renderer 不自判、不缓存）。“待我处理”逐项标注原因；“待验收”只显示计数——验收与完成语义尚未收口，本版不定义。归档不在默认展开。</p>
              <label class="sage-user-menu-row"><span>筛选</span><input type="checkbox" id="matter-list-all"><span>显示归档（事实来源：本版归档记录；完成语义未收口）</span></label>
              <p id="matter-list-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <div class="sage-state-row"><span>待我处理</span><strong id="matter-count-action" data-matter-count="action">—</strong></div>
              <ul class="sage-roster-list" id="matter-rows-action"></ul>
              <div class="sage-state-row"><span>进行中</span><strong id="matter-count-progress" data-matter-count="progress">—</strong></div>
              <ul class="sage-roster-list" id="matter-rows-progress"></ul>
              <div class="sage-state-row"><span>待验收</span><strong id="matter-count-acceptance" data-matter-count="acceptance">—</strong></div>
              <p id="matter-acceptance-note" class="sage-card-note"></p>
            </article>
          </section>
                    <section class="sage-draft-section" aria-label="草案与建项">
            <article class="sage-card sage-draft-card" id="sage-region-draft" data-sage-region="draft" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">DRAFT · DEVICE-LOCAL</span><span class="sage-card-index">D1</span></div>
              <h2>首页输入 → 草案整理 → 建项确认</h2>
              <p class="sage-card-note">草案只保存在当前设备：登出后加密锁定、期间不读不写，不自动同步、不换机接续。目标、交付、责任三项必填；项目可选且最多一个。整理只把输入留作前史，<strong>不会自动写入交付或责任</strong>。</p>
              <div class="sage-state-row"><span>草案状态</span><strong id="draft-lock" data-draft-fact>正在读取</strong></div>
              <span class="sage-card-label">站点起步模板（只读：名称与来源；选择只填入本次草案输入——不建站、不写配置、无远端效果）</span>
              <p id="site-template-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="site-template-rows"></ul>
              <textarea class="sage-draft-input" id="draft-input" rows="2" aria-label="输入你的需求"></textarea>
              <button class="sage-secondary-button" id="draft-send" type="button">发送并形成草案</button>
              <p id="draft-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <div id="draft-detail" hidden>
                <div class="sage-state-row"><span>目标（必填）</span><input class="sage-row-input" id="draft-goal" type="text" aria-label="目标"></div>
                <div class="sage-state-row"><span>预期交付（必填）</span><input class="sage-row-input" id="draft-deliverable" type="text" aria-label="预期交付"></div>
                <div class="sage-state-row"><span>责任（必填）</span><input class="sage-row-input" id="draft-responsibility" type="text" aria-label="责任"></div>
                <p id="draft-responsibility-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <div class="sage-state-row"><span>项目（可选，最多一个）</span><input class="sage-row-input" id="draft-project" type="text" aria-label="项目"></div>
                <div class="sage-state-row"><span>澄清（可选）</span><textarea class="sage-draft-input" id="draft-clarification" rows="2" aria-label="澄清"></textarea></div>
                <button class="sage-secondary-button" id="draft-save" type="button">保存草案</button>
                <ul class="sage-roster-list" id="draft-history"></ul>
                <p id="draft-history-note" class="sage-card-note">前史默认不随建项带走；勾选的片段才会进入创建请求，未勾选的留在本地草案里可回看。</p>
                <button class="sage-primary-button" id="draft-confirm" type="button" disabled>确认建项</button>
                <p id="draft-attempt" class="sage-card-note" role="status" aria-live="polite"></p>
                <button class="sage-secondary-button" id="draft-reconcile" type="button" hidden>核对同一请求</button>
                <button class="sage-secondary-button" id="draft-cancel" type="button" hidden>取消未提交的确认</button>
                <div class="sage-draft-confirmation" id="draft-confirmation" role="group" aria-label="执行前确认（单张卡）" hidden>
                  <p class="sage-draft-confirmation-title">执行前确认 · 单张卡</p>
                  <ul class="sage-draft-confirmation-facts">
                    <li>对象：<span id="confirm-target">—</span></li>
                    <li>动作：<span id="confirm-action">—</span></li>
                    <li>范围：<span id="confirm-scope">—</span></li>
                    <li>资源：<span id="confirm-resources">—</span></li>
                    <li>时间：<span id="confirm-time">—</span></li>
                    <li>前提：<span id="confirm-prerequisites">—</span></li>
                    <li>费用影响预估：<span id="confirm-cost">—</span></li>
                  </ul>
                  <p class="sage-card-note" id="confirm-note" role="status" aria-live="polite">确认只兑现这次派发的必要条件；确认不等于外部效果已发生——结果按回执三态呈现。范围、前提或版本变化会使确认失效，需要重新确认。</p>
                  <button class="sage-primary-button" id="draft-confirm-execute" type="button">确认执行</button>
                  <button class="sage-secondary-button" id="draft-confirm-cancel" type="button">取消确认</button>
                </div>
                <p id="draft-result" class="sage-card-note" role="status" aria-live="polite"></p>
                <ul class="sage-roster-list" id="draft-matters"></ul>
              </div>
            </article>
          </section>
          <section class="sage-session-section" aria-label="事项主对话">
            <article class="sage-card sage-session-card" id="sage-region-session" data-sage-region="session" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">MAIN CONVERSATION · ACK ≠ EXECUTION</span><span class="sage-card-index">D3</span></div>
              <h2>事项主对话</h2>
              <p class="sage-card-note">发出输入后基座先回执"已受理"——<strong>回执只表示进了队列，不表示模型已开始工作</strong>；执行中与否只看会话日志里有没有未结束的一轮。流断了会自动按历史重新对账，最终文本以历史为准；重开只读历史，不会重复发送。</p>
              <div class="sage-state-row"><span>会话</span><strong id="session-id">正在读取</strong></div>
              <div class="sage-state-row"><span>受理</span><strong id="session-send-state" data-session-fact>尚未发送</strong></div>
              <div class="sage-state-row"><span>发送方式</span><select class="sage-row-input" id="session-mode" aria-label="发送方式"><option value="queue">排队（本轮结束后处理）</option><option value="steer">步骤边界转向（不打断当前步骤）</option></select></div>
              <div class="sage-state-row"><span>执行</span><strong id="session-execution" data-session-fact>—</strong></div>
              <span class="sage-card-label">模型排队（服务事实投影：排队等待 / 重试进行中 / 已恢复；与错误三态分开，不提供界面倒计时）</span>
              <p id="model-queue-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="model-queue-rows"></ul>
              <span class="sage-card-label">集成终端（只读运行观察：面板内打开/关闭不影响执行；输出不进对话历史、不作产物；不接收操作输入）</span>
              <p id="terminal-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="terminal-rows"></ul>
              <pre id="terminal-output" class="sage-plan-preview" hidden></pre>
              <p id="terminal-output-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <textarea class="sage-draft-input" id="session-input" rows="2" aria-label="发给事项主对话的输入"></textarea>
              <button class="sage-secondary-button" id="session-send" type="button">发送</button>
              <button class="sage-secondary-button" id="session-stop" type="button">停止</button>
              <button class="sage-secondary-button" id="session-resume" type="button">继续（派发待继续项）</button>
              <span class="sage-card-label">引用（只读清单：来自实际挂载；选择只随下一次发送携带，不改变启用状态）</span>
              <p id="selection-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="selection-skills"></ul>
              <ul class="sage-roster-list" id="selection-plugins"></ul>
              <ul class="sage-roster-list" id="selection-chips"></ul>
              <span class="sage-card-label">模式（目标=执行；计划=只出方案。状态来自服务投影；切换经具名请求，回执后才显示为新模式；不写任何默认值）</span>
              <div class="sage-mode-bar" id="plan-mode-bar">
                <button class="sage-row-button" id="plan-mode-goal" data-plan-mode="goal" type="button">目标模式</button>
                <button class="sage-row-button" id="plan-mode-plan" data-plan-mode="plan" type="button">计划模式</button>
              </div>
              <p id="plan-mode-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <div class="sage-attachment-block" aria-label="附件">
                <span class="sage-card-label">ATTACHMENTS · PICK → UPLOAD → SEND</span>
                <p class="sage-card-note">附件只随消息走：选择文件只产生候选（不读取、不上传）；确认上传后走运行时流式上传——回执内容摘要与本地封存一致才算内容核验通过，<strong>上传成功不等于模型已读取</strong>。已上传未发送的附件随下一条消息发出；重开事项沿历史回看、不重跑上传；本版没有独立附件面板与跨消息复用。</p>
                <button class="sage-secondary-button" id="attachment-pick" type="button">选择文件…</button>
                <p id="attachment-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <ul class="sage-roster-list" id="attachment-items"></ul>
              </div>
              <p id="session-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="session-transcript"></ul>
              <span class="sage-card-label">回复操作（只提供已核实动作：复制、引用、仅确定失败时重试；未知只给核对）</span>
              <div id="reply-actions"></div>
              <p id="reply-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <span class="sage-card-label">后续建议（点击只填入输入区，不自动发送）</span>
              <p id="suggestion-note" class="sage-card-note"></p>
              <ul class="sage-roster-list" id="suggestion-chips"></ul>
              <p id="pending-note" class="sage-card-note"></p>
              <ul class="sage-roster-list" id="pending-rows"></ul>
              <p class="sage-card-note">会话内队列（只读快照 + 逐项修改；本版没有定时或循环自动化入口）。</p>
              <p id="queue-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="queue-rows"></ul>
              <p class="sage-card-note">澄清问答（提问来自运行中的提问工具；<strong>回答前不派发依赖该答案的后续步骤</strong>；候选项与自定义回答同权，一次只提交所属会话——答案不写成事项事实或交付字段）。</p>
              <p id="clarification-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="clarification-cards"></ul>
              <ul class="sage-roster-list" id="clarification-deferred"></ul>
              <ul class="sage-roster-list" id="clarification-receipts"></ul>
              <span class="sage-card-label">外部授权（等待中：未批准也未失败；撤回是具名动作；失效需重新申请）</span>
              <p id="approval-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="approval-cards"></ul>
              <ul class="sage-roster-list" id="approval-lapsed"></ul>
              <ul class="sage-roster-list" id="approval-receipts"></ul>
              <p class="sage-card-note">消息锚点（轮次跳转：读取只走纯历史接点——<strong>不整段载入正文、不激活执行</strong>；点击锚点先给短预览，再显式定位；hover 不提交任何命令）。</p>
              <button class="sage-secondary-button" id="anchor-read" type="button">读取锚点（最近轮次）</button>
              <p id="anchor-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="anchor-rows"></ul>
              <div id="anchor-preview" hidden>
                <span class="sage-card-label">锚点短预览（有界；定位只读一页窗口）</span>
                <p id="anchor-preview-text"></p>
                <button class="sage-row-button" id="anchor-locate" type="button">定位到此轮消息</button>
                <button class="sage-row-button" id="anchor-preview-close" type="button">关闭预览</button>
              </div>
              <p class="sage-card-note">编辑与重发（<strong>原消息不被改写</strong>：编辑产生新版本并保留原版本与提交关系；重发以新版本内容走同一发送入口——重复点击不并行发起、原消息不重复派发；结果未知只给「核对同一操作」，不自动重试）。</p>
              <div class="sage-state-row"><span>正在编辑</span><strong id="edit-target">（从下方会话记录里选一条已发消息）</strong></div>
              <textarea class="sage-draft-input" id="edit-input" rows="2" aria-label="编辑已发送消息的新版本"></textarea>
              <button class="sage-secondary-button" id="edit-save" type="button">保存为新版本</button>
              <p id="edit-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="edit-rows"></ul>
              <p class="sage-card-note">历史运行（纯历史接点读取：<strong>打开历史不激活执行、不重复发送、不重跑上传</strong>；默认只展开最近一次；两次运行对照后置）。</p>
              <button class="sage-secondary-button" id="history-read" type="button">读取历史运行</button>
              <button class="sage-secondary-button" id="history-more" type="button" hidden>加载更早运行</button>
              <p id="history-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="history-rows"></ul>
              <div id="history-detail" hidden>
                <p id="history-detail-model" class="sage-card-note"></p>
                <p id="history-detail-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <ul class="sage-roster-list" id="history-detail-users"></ul>
                <ul class="sage-roster-list" id="history-detail-clarifications"></ul>
                <pre id="history-detail-output" class="sage-tool-text"></pre>
              </div>
            </article>
          </section>
          <section class="sage-side-chat-section" aria-label="侧聊">
            <article class="sage-card sage-side-chat-card" id="sage-region-side-chats" data-sage-region="side-chats" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">SIDE CHATS · FORKED CHILD SESSIONS</span><span class="sage-card-index">D5</span></div>
              <h2>侧聊（派生会话）</h2>
              <p class="sage-card-note">侧聊从该事项主对话的<strong>已完成轮</strong>派生一条独立子会话：有自己的上下文与历史，<strong>不写入主对话流</strong>；事项仍只关联主对话，这里只列出派生记录并可单独回看。内容不因同属一个事项就默认进入主对话或对他人开放；把结论带回主对话必须走显式动作（沿主对话同一发送路径，受理≠执行），没有自动合并。在途运行也可派生（截到最后一个完成轮）；无已完成轮或锚点落在未完成轮时如实拒绝。</p>
              <button class="sage-secondary-button" id="side-chat-create" type="button">新建侧聊（派生当前主对话）</button>
              <p id="side-chat-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="side-chat-rows"></ul>
              <div id="side-chat-view" hidden>
                <span class="sage-card-label" id="side-chat-view-label">侧聊内容</span>
                <ul class="sage-roster-list" id="side-chat-transcript"></ul>
                <div class="sage-state-row"><span>侧聊输入</span><input class="sage-row-input" id="side-chat-input" type="text" aria-label="侧聊输入"></div>
                <button class="sage-secondary-button" id="side-chat-send" type="button">发送到侧聊</button>
                <button class="sage-secondary-button" id="side-chat-return" type="button">带回主对话（显式）</button>
                <button class="sage-secondary-button" id="side-chat-view-close" type="button">收起</button>
                <p id="side-chat-view-note" class="sage-card-note" role="status" aria-live="polite"></p>
              </div>
            </article>
          </section>
          <section class="sage-artifact-section" aria-label="产物卡与侧面预览">
            <article class="sage-card sage-artifact-card" id="sage-region-artifacts" data-sage-region="artifacts" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">ARTIFACTS · CARD FIRST, OPEN ON CLICK</span><span class="sage-card-index">D4</span></div>
              <h2>产物卡与侧面预览</h2>
              <p class="sage-card-note">卡片只展示本次运行观察到的文件变化（线索经一次 stat 核验后给出"就绪"版本），<strong>卡片出现不会创建或加载任何预览</strong>。点击卡片才按该版本读取内容，并在 main 管理的右侧容器中打开；预览失败可对<strong>同一版本</strong>重试——不静默切到最新版本、不重跑生成。Office 原格式本版不内置预览、不自动转换，也不把"可下载"写成"可预览"。</p>
              <button class="sage-secondary-button" id="artifact-observe" type="button">观察本次运行的文件变化</button>
              <p id="artifact-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="artifact-cards"></ul>
              <div id="artifact-preview" class="sage-artifact-preview" data-preview-state="closed">
                <span class="sage-card-label">SIDE PREVIEW · NON-PRIVILEGED CONTAINER</span>
                <p id="artifact-preview-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <button class="sage-secondary-button" id="artifact-expand" type="button" hidden>全屏查看（离线）</button>
                <button class="sage-secondary-button" id="artifact-window" type="button" hidden>在独立窗口打开（同一版本）</button>
                <button class="sage-secondary-button" id="artifact-retry" type="button" hidden>重试同一版本</button>
                <button class="sage-secondary-button" id="artifact-close" type="button" hidden>关闭预览</button>
                <p class="sage-card-note">预览在独立非特权容器中打开（独立会话、无 preload、无特权通道、离线交互）；关闭预览不停止执行、不动对话与输入。</p>
              </div>
            </article>
          </section>
          <section class="sage-link-section" aria-label="事项与工作区关联">
            <article class="sage-card sage-link-card" id="sage-region-link" data-sage-region="link" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">MATTER ↔ WORKSPACE · NAMED OPS</span><span class="sage-card-index">D2</span></div>
              <h2>事项 ↔ 工作区关联</h2>
              <p class="sage-card-note">关联由你在事项侧显式建立和解除，每次操作都会写进下面的操作记录（谁、何时、对哪个工作区做了哪一步）。关联只引用已采纳的工作区，<strong>不读取、不上传任何资料内容</strong>；解除只解除关联——既有引用仍指向原来源版本，也不会把执行环境静默换成别的工作区。</p>
              <div class="sage-state-row"><span>事项</span><select id="link-matter" aria-label="选择事项"></select></div>
              <div class="sage-state-row"><span>工作区</span><select id="link-workspace" aria-label="选择工作区"></select></div>
              <button class="sage-secondary-button" id="link-add" type="button">关联</button>
              <button class="sage-secondary-button" id="link-remove" type="button">解除</button>
              <button class="sage-secondary-button" id="link-default" type="button">设为默认执行环境</button>
              <p id="link-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="link-rows"></ul>
              <ul class="sage-roster-list" id="link-trail"></ul>
            </article>
          </section>
          <section class="sage-action-items-section" aria-label="行动项与项目">
            <article class="sage-card sage-action-items-card" id="sage-region-action-items" data-sage-region="action-items" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">ACTION ITEMS · CORRECTIONS · PROJECTS</span><span class="sage-card-index">D6</span></div>
              <h2>行动项、要求更正与项目汇总</h2>
              <p class="sage-card-note">行动项是事项内的可分派工作记录——<strong>不等同交付项、待办请求、工具调用或一次运行</strong>；「标记完成」只是状态变更，不构成交付验收、也不代表执行成功。执行记录冻结登记当时的依据版本。更正以<strong>关联原要求的新消息</strong>表达：原要求原样保留、不重放；回执分已接收／待应用／已生效三态，只有队列的消费读数才显示已生效。归属项目只做分组与汇总：<strong>不改变主责、可见范围或事项事实</strong>；记录只存在于本次运行。本版不做分派给他人、跨项目批量改属或项目级权限继承。</p>
              <p id="action-item-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <div class="sage-state-row"><span>新行动项</span><input class="sage-row-input" id="action-item-title" type="text" aria-label="行动项标题"></div>
              <div class="sage-state-row"><span>说明（可选）</span><input class="sage-row-input" id="action-item-body" type="text" aria-label="行动项说明"></div>
              <button class="sage-secondary-button" id="action-item-create" type="button">新建行动项（归属所选事项）</button>
              <ul class="sage-roster-list" id="action-item-rows"></ul>
              <p id="action-record-note" class="sage-card-note"></p>
              <ul class="sage-roster-list" id="action-record-rows"></ul>
              <div class="sage-action-correction-block" aria-label="另补要求更正">
                <span class="sage-card-label">CORRECTION · LINKED TO THE ORIGINAL</span>
                <div class="sage-state-row"><span>原要求（已发送消息）</span><select id="correction-original" aria-label="选择原要求"></select></div>
                <div class="sage-state-row"><span>更正副本</span><textarea class="sage-draft-input" id="correction-text" rows="3" aria-label="更正副本"></textarea></div>
                <button class="sage-secondary-button" id="correction-submit" type="button">提交更正（关联原要求的新消息）</button>
                <p id="correction-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <ul class="sage-roster-list" id="correction-rows"></ul>
              </div>
              <div class="sage-action-project-block" aria-label="项目归属与汇总">
                <span class="sage-card-label">PROJECT · GROUPING ONLY</span>
                <div class="sage-state-row"><span>新项目</span><input class="sage-row-input" id="project-name" type="text" aria-label="项目名称"></div>
                <button class="sage-secondary-button" id="project-create" type="button">新建项目</button>
                <div class="sage-state-row"><span>项目</span><select id="project-select" aria-label="选择项目"></select></div>
                <button class="sage-secondary-button" id="project-assign" type="button">把所选事项归属到该项目</button>
                <button class="sage-secondary-button" id="project-unassign" type="button">解除所选事项的项目归属</button>
                <p id="project-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <ul class="sage-roster-list" id="project-rows"></ul>
              </div>
            </article>
          </section>
          <section class="sage-matter-admin-section" aria-label="事项管理">
            <article class="sage-card sage-matter-admin-card" id="sage-region-matter-admin" data-sage-region="matter-admin" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">MATTER ADMIN · ARCHIVE · RENAME · BATCH</span><span class="sage-card-index">D7</span></div>
              <h2>事项管理：归档、重命名与逐项批量</h2>
              <p class="sage-card-note">归档是可恢复的列表退役：退出活动列表、<strong>保留事实与回执</strong>，可随时恢复——恢复只回列表呈现，不自动恢复执行、也不把已完成改成运行中。<strong>归档≠停止执行（在跑的运行不受影响）、≠隐藏</strong>；归档不解除未结责任、不扩大读取权限；真正删除是独立受控流程，这里没有入口。重命名经服务裁决，显示的是<strong>回读的实际生效值</strong>（请求值不冒充生效值）。批量<strong>逐项返回</strong>结果与拒绝原因，没有「整体成功」。本版归档依据是声明（已完成／已停止——验收读数未收口，不冒充核验）。</p>
              <div class="sage-state-row"><span>归档依据（声明）</span><select id="matter-admin-ground" aria-label="归档依据"><option value="completed">已完成（声明）</option><option value="stopped">已停止（声明）</option></select></div>
              <button class="sage-secondary-button" id="matter-admin-archive" type="button">归档所选（逐项）</button>
              <button class="sage-secondary-button" id="matter-admin-restore" type="button">恢复所选（逐项）</button>
              <p id="matter-admin-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="matter-admin-rows"></ul>
              <ul class="sage-roster-list" id="matter-admin-batch-rows"></ul>
              <div class="sage-state-row"><span>重命名（所选事项）</span><input class="sage-row-input" id="matter-admin-rename-title" type="text" aria-label="新的名称"></div>
              <button class="sage-secondary-button" id="matter-admin-rename" type="button">重命名（服务裁决并回读）</button>
              <p id="matter-admin-rename-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="matter-admin-trail"></ul>
            </article>
          </section>
          <section class="sage-matter-groups-section" aria-label="任务分组">
            <article class="sage-card sage-matter-groups-card" id="sage-region-matter-groups" data-sage-region="matter-groups" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">TASK GROUPS · SAGE-OWNED ORGANIZATION</span><span class="sage-card-index">D12</span></div>
              <h2>任务分组：建立、改名与移除（只改变列表组织）</h2>
              <p class="sage-card-note">分组是 Sage 自有的组织对象：建立、改名、移除都是具名命令，各有回执与回读，<strong>不隐式产生</strong>（对未知分组的操作被拒绝，不会自动建组）。分组<strong>只改变列表组织方式</strong>：不改变事项事实、可见范围、责任或权限；<strong>移除分组≠删除事项</strong>。成员批量<strong>逐项返回</strong>结果与拒绝原因，没有「整体成功」。本版分组是本机组织记录：不做共享与协作语义、不做按分组批量授权、不跨设备同步。</p>
              <p id="matter-groups-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <div class="sage-state-row"><span>新分组名称</span><input class="sage-row-input" id="matter-groups-name" type="text" aria-label="新分组名称"></div>
              <button class="sage-secondary-button" id="matter-groups-create" type="button">建立分组（所选事项入组，逐个回执）</button>
              <ul class="sage-roster-list" id="matter-groups-rows"></ul>
              <ul class="sage-roster-list" id="matter-groups-list"></ul>
              <div class="sage-state-row"><span>改名（所选分组）</span><input class="sage-row-input" id="matter-groups-rename-title" type="text" aria-label="分组新名称"></div>
              <button class="sage-secondary-button" id="matter-groups-rename" type="button">改名（回读生效值）</button>
              <button class="sage-secondary-button" id="matter-groups-remove" type="button">移除分组（只移除组织，≠删除事项）</button>
              <button class="sage-secondary-button" id="matter-groups-add" type="button">加入所选事项（逐项）</button>
              <button class="sage-secondary-button" id="matter-groups-remove-members" type="button">移出所选事项（逐项）</button>
              <p id="matter-groups-readback" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="matter-groups-batch-rows"></ul>
              <ul class="sage-roster-list" id="matter-groups-trail"></ul>
            </article>
          </section>
          <section class="sage-run-monitor-section" aria-label="运行监控">
            <article class="sage-card sage-run-monitor-card" id="sage-region-run-monitor" data-sage-region="run-monitor" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">RUN MONITOR · FOUR AXES · LOG READ-ONLY</span><span class="sage-card-index">D8</span></div>
              <h2>运行监控、用量与运行日志</h2>
              <p class="sage-card-note">四轴<strong>各自独立</strong>呈现、不合成单一「运行状态」：步骤来自会话的同一投影；预算／用量分<strong>预留／消耗／最终账单</strong>三态，来源未接线时为「未知」——<strong>不以零代替未知</strong>。设备<strong>离线不等于运行取消、也不等于被其他设备接管</strong>。后台执行主体在 Host 侧：<strong>折叠或关闭这个面板不会取消运行</strong>（面板只是本地视图状态）。上下文用量与压缩只读呈现；压缩是否发生由执行侧决定，本版没有压缩读数、也没有压缩触发入口；任何压缩都不得把私有侧聊带入主对话或扩大外传。运行日志<strong>只读、有界续读</strong>，不进入普通对话同步；导出需独立核权（本版无导出入口）。</p>
              <button class="sage-secondary-button" id="monitor-toggle" type="button">收起面板</button>
              <div id="monitor-body">
                <div class="sage-state-row"><span>步骤（同一会话投影）</span><strong id="monitor-steps" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>预算 · 预留</span><strong id="monitor-budget-reserved" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>预算 · 消耗</span><strong id="monitor-budget-consumed" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>预算 · 最终账单</span><strong id="monitor-budget-billed" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>设备</span><strong id="monitor-device" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>后台</span><strong id="monitor-background" data-monitor-fact>—</strong></div>
                <div class="sage-state-row"><span>上下文 / 压缩</span><strong id="monitor-context" data-monitor-fact>—</strong></div>
                <div class="sage-run-log-block" aria-label="运行日志">
                  <span class="sage-card-label">RUN LOG · READ-ONLY · BOUNDED CURSOR</span>
                  <div class="sage-state-row"><span>日志文件（工作区内相对路径）</span><input class="sage-row-input" id="run-log-path" type="text" value="logs/run.log" aria-label="日志文件相对路径"></div>
                  <button class="sage-secondary-button" id="run-log-open" type="button">读取运行日志</button>
                  <button class="sage-secondary-button" id="run-log-continue" type="button">继续读取（游标）</button>
                  <p id="run-log-note" class="sage-card-note" role="status" aria-live="polite"></p>
                  <ul class="sage-roster-list" id="run-log-rows"></ul>
                </div>
              </div>
            </article>
          </section>
          <section class="sage-plan-section" aria-label="方案预览">
            <article class="sage-card sage-plan-card" id="sage-region-plans" data-sage-region="plans" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">PLAN · DELIVERABLE · STEP READINESS</span><span class="sage-card-index">D9</span></div>
              <h2>方案预览、步骤就绪与执行确认</h2>
              <p class="sage-card-note">方案是本次交付：<strong>接受方案不等于执行方案</strong>——接受只记录回执，不派发、不铸确认卡、不碰会话。执行必须针对<strong>明确动作</strong>：每个步骤先「准备执行确认卡」（单张卡，衔接执行前确认）；确认执行才携带一次性凭据派发。步骤就绪按<strong>动作前提</strong>显示——<strong>安全或权限未知呈现为阻断而非失败，且不就绪项不被派发</strong>（不显示执行入口）。</p>
              <div class="sage-state-row"><span>方案标题</span><input class="sage-row-input" id="plan-title" type="text" aria-label="方案标题"></div>
              <div class="sage-state-row"><span>步骤（每行一条）</span><textarea class="sage-draft-input" id="plan-steps" rows="3" aria-label="方案步骤"></textarea></div>
              <button class="sage-secondary-button" id="plan-create" type="button">形成方案（归属所选事项）</button>
              <p id="plan-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="plan-rows"></ul>
              <div id="plan-step-detail" hidden>
                <p id="plan-step-note" class="sage-card-note"></p>
                <ul class="sage-roster-list" id="plan-step-rows"></ul>
                <div class="sage-draft-confirmation" id="plan-step-card" role="group" aria-label="步骤执行确认（单张卡）" hidden>
                  <p class="sage-draft-confirmation-title">执行前确认 · 单张卡（步骤）</p>
                  <ul class="sage-draft-confirmation-facts">
                    <li>对象：<span id="plan-step-target">—</span></li>
                    <li>动作：<span id="plan-step-action">—</span></li>
                    <li>范围：<span id="plan-step-scope">—</span></li>
                    <li>资源：<span id="plan-step-resources">—</span></li>
                    <li>时间：<span id="plan-step-time">—</span></li>
                    <li>前提：<span id="plan-step-prereq">—</span></li>
                    <li>费用影响预估：<span id="plan-step-cost">—</span></li>
                  </ul>
                  <p class="sage-card-note">确认只兑现这次派发的必要条件；确认不等于效果已发生——结果按回执三态呈现。</p>
                  <button class="sage-primary-button" id="plan-step-execute" type="button">确认执行（携带凭据）</button>
                  <button class="sage-secondary-button" id="plan-step-cancel" type="button">取消确认</button>
                </div>
                <p id="plan-step-result" class="sage-card-note" role="status" aria-live="polite"></p>
              </div>
            </article>
          </section>
          <section class="sage-tool-results-section" aria-label="工具结果（typed 呈现）">
            <article class="sage-card sage-tool-results-card" id="sage-region-tool-results" data-sage-region="tool-results" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">TOOL RESULTS · SAGE-OWNED COMPONENTS</span><span class="sage-card-index">D10</span></div>
              <h2>工具结果（typed 数据，Sage 组件呈现）</h2>
              <p class="sage-card-note">结果按声明类型经严格解析后由 Sage 自有组件呈现——<strong>不支持的类型明确拒绝，不用替代内容渲染</strong>；结果内不执行脚本、不接受权威动作输入；敏感字段以已脱敏显示，原始载荷不透传。链接只在显式点击下经校验交给系统浏览器（不自动联网）；图片结果按权限解析到本运行的就绪产物，打开仍按版本读取；没有批注入口。</p>
              <p id="tool-result-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="tool-result-rows"></ul>
            </article>
          </section>
          <section class="sage-sites-section" aria-label="网页成果（本机目录）">
            <article class="sage-card sage-sites-card" id="sage-region-sites" data-sage-region="sites" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">WEB DELIVERABLES · LOCAL CATALOG</span><span class="sage-card-index">D11</span></div>
              <h2>网页成果目录（只读）</h2>
              <p class="sage-card-note">本目录只读浏览本次运行观察到的网页型成果，显示同源版本与访问限制——<strong>已托管/可预览不等于网站上线</strong>：本版没有发布、部署或托管入口；预览沿离线容器打开，外链沿系统浏览器显式入口。</p>
              <ul class="sage-roster-list" id="site-rows"></ul>
              <p id="site-note" class="sage-card-note" role="status" aria-live="polite"></p>
            </article>
          </section>
        </section>

        <section class="sage-panel" id="panel-search" role="tabpanel" data-panel="search" aria-labelledby="view-search" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">SEARCH</p><h1>搜索</h1></div><span class="sage-fixture-pill">只读命中</span></div>
          <section class="sage-search-section" aria-label="搜索">
            <article class="sage-card sage-search-card" id="sage-region-search" data-sage-region="search" data-region-state="unavailable">
              <div class="sage-card-head"><span class="sage-card-label">SEARCH · MATTERS LOCAL + SESSION CONTENT</span><span class="sage-card-index">D0</span></div>
              <h2>搜索</h2>
              <p class="sage-card-note">一次输入两区：<strong>事项</strong>在 Sage 本地记录按标题与属性匹配；<strong>会话</strong>走运行时检索（只读、有界、只含可见会话，内部分页）。命中都是只读文本——<strong>不打开会话、不激活执行、不加载正文</strong>；全文检索与统一排序后置；运行时没有检索引擎时会话区如实显示「不可用」。</p>
              <div class="sage-state-row"><span>关键词</span><input class="sage-row-input" id="search-input" type="text" aria-label="搜索关键词"></div>
              <button class="sage-secondary-button" id="search-run" type="button">搜索</button>
              <p id="search-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <span class="sage-card-label">事项（本地匹配）</span>
              <ul class="sage-roster-list" id="search-matter-rows"></ul>
              <span class="sage-card-label">会话（运行时检索）</span>
              <p id="search-session-state" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="search-session-rows"></ul>
            </article>
          </section>
        </section>

        <section class="sage-panel" id="panel-automation" role="tabpanel" data-panel="automation" aria-labelledby="view-automation" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">AUTOMATIONS</p><h1>自动化</h1></div><span class="sage-fixture-pill">未接线</span></div>
          <article class="sage-card sage-automation-card">
            <div class="sage-card-head"><span class="sage-card-label">AUTOMATIONS · NOT WIRED</span><span class="sage-card-index">01</span></div>
            <h2>定时与触发式运行</h2>
            <strong class="sage-state-tag is-blocked" id="automation-state">未接线</strong>
            <p class="sage-card-note">本版没有定时、周期或事件触发的自动化入口；所有运行都由你在当前事项里显式发起。这里不提供创建、启停或运行记录——「没接线」不写成「已停用」。</p>
          </article>
        </section>

        <section class="sage-panel" id="panel-knowledge" role="tabpanel" data-panel="knowledge" aria-labelledby="view-knowledge" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">KNOWLEDGE</p><h1>知识</h1></div><span class="sage-fixture-pill">只读呈现</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-knowledge-card">
              <div class="sage-card-head"><span class="sage-card-label">KNOWLEDGE &amp; REFERENCES · READ-ONLY</span><span class="sage-card-index">01</span></div>
              <h2>知识与引用</h2>
              <p class="sage-card-note">知识条目与引用条目在这里只读呈现来源、版本与可达性；点开才按需读取并重核（取用在「能力」页的本地引用卡上进行）。本页没有创建、编辑、发布或退役知识条目的入口。</p>
              <strong class="sage-state-tag is-blocked" id="knowledge-state">未接线</strong>
              <p id="knowledge-note" class="sage-card-note"></p>
              <ul class="sage-roster-list" id="knowledge-rows"></ul>
            </article>
          </div>
        </section>

        <section class="sage-panel" id="panel-capabilities" role="tabpanel" data-panel="capabilities" aria-labelledby="view-capabilities" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">CAPABILITY SURFACE</p><h1>能力与接线状态</h1></div><span class="sage-fixture-pill" id="sage-region-capability-source" data-sage-region="capability" data-region-state="unavailable">来源：等待运行时清单</span></div>
          <div class="sage-capability-grid">
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">01</span><h2>运行时</h2><p>当前唯一真实接线是 Sage Host 的受控状态读取与恢复动作。</p><strong class="sage-state-tag">runtime projection</strong></article>
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">02</span><h2>外部能力</h2><p>外部能力目录与市场还没有可核验的来源；界面不把"没接线"说成"已停用"。</p><strong class="sage-state-tag is-blocked">未接线 · 无 provider</strong></article>
            <article class="sage-card sage-capability-card"><span class="sage-capability-glyph">03</span><h2>业务 Adapter</h2><p>能力适配器只返回安全投影；真实 ActionIntent 进入下一批 Application Service。</p><strong class="sage-state-tag">contract runway</strong></article>
          </div>
          <article class="sage-card sage-capability-roster" id="sage-region-capability" data-sage-region="capability" data-region-state="unavailable">
            <div class="sage-card-head"><span class="sage-card-label">AGENT PRESETS · READ-ONLY</span><span class="sage-card-index">04</span></div>
            <h2>已配置的 Agent 运行时</h2>
            <p class="sage-card-note">这里只显示 Electron main 观察到的运行时清单：已配置不等于已启用，已启用也不等于可用。安装、启用、停用与撤销在本页没有入口。</p>
            <ul class="sage-roster-list" id="capability-rows"></ul>
            <p id="capability-note" class="sage-card-note" role="status" aria-live="polite"></p>
          </article>
          <article class="sage-card sage-model-config" id="sage-region-model-config" data-sage-region="model-config" data-region-state="unavailable">
            <div class="sage-card-head"><span class="sage-card-label">MODEL CONFIG · READ-ONLY</span><span class="sage-card-index">05</span></div>
            <h2>模型配置</h2>
            <p class="sage-card-note">只显示结构、层级与凭据是否已设置：不显示任何配置值，也无编辑入口。保存过配置不等于这个供应商可用——「已保存」与「连通性」是两回事。</p>
            <ul class="sage-roster-list" id="model-rows"></ul>
            <p id="model-test" class="sage-card-note"></p>
            <p id="model-note" class="sage-card-note" role="status" aria-live="polite"></p>
          </article>
          <article class="sage-card sage-workspace-adoption">
            <div class="sage-card-head"><span class="sage-card-label">WORKSPACE · ADOPT · MANAGE</span><span class="sage-card-index">06</span></div>
            <h2>采纳并管理已有目录</h2>
            <p class="sage-card-note">只采纳已经在磁盘上的目录；本页没有新建目录的入口，取消选择不会产生任何记录。列表里的「移除登记」是解除 Sage 对目录的登记，不等于删除目录——目录和其中的文件都留在磁盘上。</p>
            <button class="sage-secondary-button" id="adopt-workspace" type="button">选择已有目录</button>
            <p id="workspace-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <ul class="sage-roster-list" id="workspace-rows"></ul>
            <p id="workspace-list-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <p id="workspace-mutation-note" class="sage-card-note" role="status" aria-live="polite"></p>
          </article>
          <article class="sage-card sage-file-references">
            <div class="sage-card-head"><span class="sage-card-label">LOCAL REFERENCE · LIVE RECHECK</span><span class="sage-card-index">07</span></div>
            <h2>本地引用</h2>
            <p class="sage-card-note">引用只记录来源与建立时的版本号；建立引用不读取文件内容，取用时先重核版本——版本变了就阻断，不会改读新内容，也不会换来源。引用记录只存在于本次运行。</p>
            <div class="sage-state-row"><span>工作区</span><select id="file-workspace" aria-label="引用所在的工作区"></select></div>
            <div class="sage-state-row"><span>相对路径</span><input class="sage-row-input" id="file-path" type="text" value="" aria-label="工作区内的相对路径"></div>
            <button class="sage-secondary-button" id="file-list" type="button">列出候选</button>
            <ul class="sage-roster-list" id="file-candidates"></ul>
            <p id="file-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <ul class="sage-roster-list" id="file-references"></ul>
            <p id="file-use-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <pre id="file-preview" class="sage-file-preview" hidden></pre>
          </article>
          <article class="sage-card sage-edit-draft-card">
            <div class="sage-card-head"><span class="sage-card-label">EDIT DRAFT · DIFF · WRITEBACK</span><span class="sage-card-index">08</span></div>
            <h2>事项修改稿、Diff 与回写</h2>
            <p class="sage-card-note">修改稿基于已采纳工作区文件的<strong>某一版本</strong>生成：生成只读取、不改写——<strong>修改稿存在不等于共享文件已更新</strong>。Diff 由 Sage 从内容按所依据版本逐行比较（<strong>不依赖 Git</strong>）。回写是独立具名动作：需单独确认并预览目标版本与影响；<strong>回写能力未接线时不写入</strong>，确认不等于已回写——只有收到回写回执才显示「已回写」。下载与导出没有回写效果。</p>
            <p id="edit-draft-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <ul class="sage-roster-list" id="edit-draft-rows"></ul>
            <div id="edit-draft-detail" hidden>
              <div class="sage-state-row"><span>基于版本</span><strong id="edit-draft-version" data-edit-draft-fact>—</strong></div>
              <div class="sage-state-row"><span>源状态</span><strong id="edit-draft-source-state" data-edit-draft-fact>—</strong></div>
              <div class="sage-state-row"><span>修改稿内容</span><textarea class="sage-draft-input" id="edit-draft-proposed" rows="6" aria-label="修改稿内容"></textarea></div>
              <button class="sage-secondary-button" id="edit-draft-save" type="button">保存修改稿</button>
              <button class="sage-secondary-button" id="edit-draft-diff" type="button">查看 Diff（按所依据版本）</button>
              <pre id="edit-draft-diff-view" class="sage-file-preview" hidden></pre>
              <p id="edit-draft-diff-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <button class="sage-primary-button" id="edit-draft-prepare" type="button">准备回写（需单独确认）</button>
              <div class="sage-draft-confirmation" id="edit-draft-writeback-card" role="group" aria-label="回写确认（单张卡）" hidden>
                <p class="sage-draft-confirmation-title">回写确认 · 单张卡</p>
                <ul class="sage-draft-confirmation-facts">
                  <li>对象：<span id="writeback-target">—</span></li>
                  <li>动作：<span id="writeback-action">—</span></li>
                  <li>目标版本：<span id="writeback-version">—</span></li>
                  <li>当前源版本：<span id="writeback-current">—</span></li>
                  <li>影响：<span id="writeback-impact">—</span></li>
                  <li>费用影响预估：<span id="writeback-cost">—</span></li>
                </ul>
                <p class="sage-card-note" id="writeback-note">确认只兑现这次回写的必要条件；确认不等于文件已回写——只有收到回写回执才显示「已回写」。</p>
                <button class="sage-primary-button" id="edit-draft-writeback-now" type="button">确认回写</button>
                <button class="sage-secondary-button" id="edit-draft-writeback-cancel" type="button">取消确认</button>
              </div>
              <p id="edit-draft-result" class="sage-card-note" role="status" aria-live="polite"></p>
            </div>
          </article>
        </section>

        <section class="sage-panel" id="panel-settings" role="tabpanel" data-panel="settings" aria-labelledby="view-settings" hidden>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">SETTINGS</p><h1>设置</h1></div><span class="sage-fixture-pill">外观可保存 · 系统只读</span></div>
          <article class="sage-card sage-preferences-card" id="settings-appearance" data-settings-writable="appearance">
            <div class="sage-card-head"><span class="sage-card-label">APPEARANCE · EIGHT ITEMS · ONE AUTHORITATIVE VALUE</span><span class="sage-card-index">01</span></div>
            <h2>外观（可保存）</h2>
            <p class="sage-card-note">八个可持久化外观项（主题／语言／密度缩放／字体风格／内容宽度／终端主题／文件图标／图标外观）由同一份设备偏好持有；本页与顶栏用户菜单读写同一份权威值，不各存一份。保存失败不会显示为已生效；本页不做主题 token 全量审计与视觉对比度验收。</p>
            <div class="sage-state-row"><span>主题</span><select id="pref-theme" aria-label="主题"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
            <div class="sage-state-row"><span>语言</span><select id="pref-language" aria-label="语言"><option value="zh">中文</option><option value="en">English</option></select></div>
            <div class="sage-state-row"><span>密度/缩放</span><select id="pref-density" aria-label="密度与缩放"><option value="comfortable">宽松</option><option value="compact">紧凑</option></select></div>
            <div class="sage-state-row"><span>字体风格</span><select id="pref-font-style" aria-label="字体风格"><option value="sans">无衬线</option><option value="serif">衬线</option></select></div>
            <div class="sage-state-row"><span>内容宽度</span><select id="pref-content-width" aria-label="内容宽度"><option value="standard">标准</option><option value="wide">宽</option></select></div>
            <div class="sage-state-row"><span>终端主题</span><select id="pref-terminal-theme" aria-label="终端主题"><option value="follow">跟随主题</option><option value="manual">手动调整</option></select></div>
            <div class="sage-state-row"><span>文件图标</span><select id="pref-file-icons" aria-label="文件图标"><option value="product">产品图标</option><option value="material">Material File Icons</option></select></div>
            <div class="sage-state-row"><span>图标外观</span><select id="pref-icon-appearance" aria-label="图标外观"><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
            <button class="sage-secondary-button" id="pref-save" type="button">保存这八项</button>
            <p id="pref-note" class="sage-card-note" role="status" aria-live="polite"></p>
            <div class="sage-appearance-deferred" id="appearance-deferred" data-deferred-appearance>
              <span class="sage-card-label">不在本版清单 · 不可配置</span>
              <ul class="sage-roster-list">
                <li class="sage-roster-row" data-deferred-item="shortcuts"><strong>快捷键</strong><span class="sage-roster-tag">不可配置</span><span>自定义快捷键后置，本版不提供录制或编辑入口。</span></li>
                <li class="sage-roster-row" data-deferred-item="voice"><strong>语音</strong><span class="sage-roster-tag">不可配置</span><span>语音转写与麦克风设置后置，本版不提供入口。</span></li>
                <li class="sage-roster-row" data-deferred-item="task-monitor-layout"><strong>任务监控浮层布局</strong><span class="sage-roster-tag">不可配置</span><span>浮层与布局偏好后置，本版不提供入口，也不冒充已保存。</span></li>
                <li class="sage-roster-row" data-deferred-item="terminal-links"><strong>终端链接使用内置浏览器</strong><span class="sage-roster-tag">不迁入</span><span>D-036 已定使用系统浏览器，本版不提供该类开关。</span></li>
              </ul>
            </div>
          </article>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">IDENTITY</p><h2>身份</h2></div><span class="sage-fixture-pill">只读投影</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-governance-card">
              <span class="sage-card-label">当前登录身份</span>
              <h2>身份与登出</h2>
              <div class="sage-state-row"><span>显示名</span><strong id="profile-identity" data-identity-label>正在读取身份</strong></div>
              <p>身份与登出入口取自 Electron main 的一份权威投影；界面不自报身份，不可核验时也不回填占位名或上一次的姓名。</p>
              <p id="profile-status-note" role="status" aria-live="polite"></p>
              <button class="sage-secondary-button" id="profile-logout" type="button" data-logout-entry hidden>退出登录</button>
            </article>
            <article class="sage-card sage-governance-card"><span class="sage-card-label">不在本视图</span><h2>组织岗位与授权</h2><p>岗位、AuthoritySnapshot、可见范围与成员管理属于后置治理面，设置页不推断这些事实；外观八项与顶栏用户菜单读写同一份权威值。</p></article>
          </div>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">RUNTIME STATE</p><h2>运行状态</h2></div><span class="sage-fixture-pill">只读</span></div>
          <section class="sage-card sage-runtime-card" aria-labelledby="state-title">
            <div class="sage-card-head"><span class="sage-card-label">RUNTIME</span><span class="sage-card-index">01</span></div>
            <div class="sage-card-icon" aria-hidden="true">↗</div>
            <h2 id="state-title">正在检查</h2>
            <p id="state-message" role="status" aria-live="polite">正在读取 Sage 的受控状态。</p>
            <button class="sage-secondary-button" id="retry" type="button" hidden>重新检查</button>
            <p class="sage-card-note" id="command-note" role="status" aria-live="polite"></p>
            <button class="sage-secondary-button" id="reconcile" type="button" hidden>核对同一操作</button>
            <div class="sage-state-row"><span>当前身份</span><strong id="auth-name" data-identity-label></strong></div>
            <button class="sage-secondary-button" id="login" type="button" hidden>登录</button>
            <button class="sage-secondary-button" id="logout" type="button" data-logout-entry hidden>退出登录</button>
            <p class="sage-card-note">这里只反映当前能力运行时状态，不等于业务授权或外部能力可用。</p>
          </section>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">ACCOUNTABILITY &amp; GOVERNANCE</p><h2>行动边界</h2></div><span class="sage-fixture-pill">fail closed</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-governance-card"><span class="sage-card-label">当前规则</span><h2>事实、授权与可用性分开</h2><p>Host ready、工具可见、版本相同或 fixture equivalent 都不能单独变成业务授权。</p></article>
            <article class="sage-card sage-governance-card"><span class="sage-card-label">下一道门</span><h2>Application Service</h2><p>真实业务动作必须经 ViewState / ActionIntent、权限、兼容性、可用性和 Adapter 预检的固定顺序。</p></article>
          </div>
          <section class="sage-exit-guide-env" aria-label="退出检查、引导与环境">
            <article class="sage-card sage-exit-card">
              <div class="sage-card-head"><span class="sage-card-label">EXIT CHECK · IMPACT LIST</span><span class="sage-card-index">P2</span></div>
              <h2>退出前检查</h2>
              <p class="sage-card-note">退出前先看清影响：进行中的任务、待继续输入与未保存草案逐项列出并说明后果。关闭窗口不等于退出（后台继续）；<strong>停止并退出只停止派发新动作并对已知结果收口——已发出的外部操作不能承诺撤回，未确认的操作保留结果待核实，退出成功不等于远端效果已知</strong>。</p>
              <button class="sage-secondary-button" id="exit-check-open" type="button">退出 Sage…（先看影响清单）</button>
              <div id="exit-dialog" hidden>
                <ul class="sage-roster-list" id="exit-impact-rows"></ul>
                <p id="exit-note" class="sage-card-note" role="status" aria-live="polite"></p>
                <button class="sage-secondary-button" id="exit-cancel" type="button">取消（保持后台运行）</button>
                <button class="sage-secondary-button" id="exit-stop" type="button">停止进行中的任务并标记可退出</button>
              </div>
            </article>
            <article class="sage-card sage-guide-card">
              <div class="sage-card-head"><span class="sage-card-label">ONBOARDING · READ-ONLY</span><span class="sage-card-index">P1</span></div>
              <h2>首版引导（只读讲解）</h2>
              <p class="sage-card-note">引导只作讲解、三个要点：①从首页输入形成草案，确认建项后事项进入列表；②执行仍要逐动作确认（执行前确认卡），<strong>接受方案或完成引导都不触发执行</strong>；③外部能力要先登录并获准——<strong>引导不替代登录与授权、不自动修改任何配置</strong>；实验与演示入口与生产功能分开，<strong>实验不直通生产</strong>（本版没有实验入口）。</p>
              <button class="sage-secondary-button" id="guide-toggle" type="button">展开要点</button>
              <ul class="sage-roster-list" id="guide-rows" hidden>
                <li class="sage-roster-row">输入 → 草案 → 确认建项：建项回执区分已接收/已生效/待核实。</li>
                <li class="sage-roster-row">动作执行：每个外部效果动作都有自己的确认卡；接受方案≠执行方案。</li>
                <li class="sage-roster-row">登录与授权：引导阅读不跳过身份门；配置与授权不被引导改写。</li>
              </ul>
            </article>
            <article class="sage-card sage-env-card">
              <div class="sage-card-head"><span class="sage-card-label">LOCAL RUNTIME ENV · READ-ONLY</span><span class="sage-card-index">P3</span></div>
              <h2>本地运行环境（只读）</h2>
              <p class="sage-card-note">只显示当前环境及其来源：调度、工具进程与文件操作的运行位置在本机（D-042）；事项的默认执行环境来自关联事实并在派发前逐次核验（D-091）。<strong>环境装配、跨设备占用与远端执行后置——这里没有这些入口</strong>；远端环境不会在本地不可用时自动接替。</p>
              <div class="sage-state-row"><span>运行时</span><strong id="env-runtime" data-env-fact>—</strong></div>
              <div class="sage-state-row"><span>事项默认执行环境</span><strong id="env-matter-ref" data-env-fact>—</strong></div>
              <div class="sage-state-row"><span>工作区折叠（环境存在性来源）</span><strong id="env-fold" data-env-fact>—</strong></div>
            </article>
          </section>
          <section id="settings-leaf-section" aria-label="叶子页只读组">
            <div class="sage-section-heading"><div><p class="sage-eyebrow">LEAF PAGES · READ-ONLY</p><h2>叶子页（只读）</h2></div><span class="sage-fixture-pill">零写入口</span></div>
            <p class="sage-card-note">这一版把 11 张叶子设置页做成只读呈现：每页标出来源（观察／配置事实／无 provider）与不可用原因，<strong>没有任何启用、启停、导入、连接或重建的入口</strong>。"没接线"一律写成"没接线"，不写成"已停用"。</p>
            <div class="sage-governance-grid" id="settings-leaf-grid"></div>
          </section>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">VISIBLE SCOPE</p><h2>可见范围</h2></div><span class="sage-fixture-pill">只读</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-visibility-card">
              <div class="sage-card-head"><span class="sage-card-label">VISIBLE SCOPE · READ-ONLY</span><span class="sage-card-index">01</span></div>
              <h2>当前可见范围</h2>
              <p class="sage-card-note">这里只列已核验的范围事实。本页没有邀请成员、指定协作管理人、开放历史范围或主责交接的入口；列表里出现某人也不表示其获得了读取权。</p>
              <div class="sage-state-row"><span>组织范围</span><strong id="visibility-org" data-visibility-fact>正在读取</strong></div>
              <div class="sage-state-row"><span>获准主责</span><strong id="visibility-owner" data-visibility-fact>正在读取</strong></div>
              <p id="visibility-note" class="sage-card-note" role="status" aria-live="polite"></p>
            </article>
          </div>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">PLUGINS</p><h2>插件与扩展</h2></div><span class="sage-fixture-pill">只读观察</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-plugins-card">
              <div class="sage-card-head"><span class="sage-card-label">PLUGINS &amp; EXTENSIONS · READ-ONLY</span><span class="sage-card-index">02</span></div>
              <h2>插件与扩展</h2>
              <p class="sage-card-note">只显示实际存在的两份事实：安装时证据（名称、版本、来源摘要）与本次启动的一次观察。自报、进程存在、工具数量与连接成功都只是局部观察，不合成兼容或可用结论；未核验一律按未核验显示，不改写成停用结论。</p>
              <ul class="sage-roster-list" id="plugin-rows"></ul>
              <p id="plugin-observation" class="sage-card-note"></p>
              <p id="plugin-note" class="sage-card-note" role="status" aria-live="polite"></p>
            </article>
          </div>
          <div class="sage-section-heading"><div><p class="sage-eyebrow">ABOUT &amp; DIAGNOSTICS</p><h2>关于与诊断</h2></div><span class="sage-fixture-pill">只读 + 反馈</span></div>
          <div class="sage-governance-grid">
            <article class="sage-card sage-diagnostics-card">
              <div class="sage-card-head"><span class="sage-card-label">ABOUT &amp; DIAGNOSTICS · READ-ONLY</span><span class="sage-card-index">03</span></div>
              <h2>关于与诊断</h2>
              <p class="sage-card-note">版本与构建标识取自能力运行时的自报快照（启动时已按 pin 核对摘要），不由界面自报；本页不提供更新检查与一键更新的入口，也不以旧发布链的结果充当更新能力。</p>
              <div class="sage-state-row"><span>运行时版本</span><strong id="diagnostics-harness">正在读取</strong></div>
              <div class="sage-state-row"><span>协议版本</span><strong id="diagnostics-protocol">正在读取</strong></div>
              <div class="sage-state-row"><span>Profile 世代</span><strong id="diagnostics-generation">正在读取</strong></div>
              <div class="sage-state-row"><span>Manifest 摘要</span><strong id="diagnostics-manifest">正在读取</strong></div>
              <div class="sage-state-row"><span>数据根</span><strong id="diagnostics-dataroot">正在读取</strong></div>
              <p id="diagnostics-error" class="sage-card-note"></p>
              <span class="sage-card-label">反馈（只提交你写的文本与结构化诊断 code/stage/correlation；不自动附日志、堆栈、机器路径或凭据）</span>
              <textarea class="sage-draft-input" id="feedback-text" rows="3" aria-label="反馈文本"></textarea>
              <div class="sage-state-row"><span>诊断码（可选）</span><input class="sage-row-input" id="feedback-code" type="text" aria-label="诊断码"></div>
              <div class="sage-state-row"><span>阶段（可选）</span><input class="sage-row-input" id="feedback-stage" type="text" aria-label="阶段"></div>
              <button class="sage-secondary-button" id="feedback-submit" type="button">提交反馈（文本＋结构化诊断）</button>
              <p id="feedback-note" class="sage-card-note" role="status" aria-live="polite"></p>
              <ul class="sage-roster-list" id="feedback-receipts"></ul>
            </article>
          </div>
        </section>

        <footer class="sage-footer"><span>Sage · self-owned product surface</span><span>本页不发送信息，不连接外部业务系统。</span></footer>
      </main>
    </div>
  `
}
