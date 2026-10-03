/** Ticket 015 (US-032~037/040/042): the one side-preview — open by exact version, guarded against
 *  late results, torn down on close.
 *
 * The container contract is ADR-0178 D3 / design ADR-0001: an independent non-privileged surface
 * (its own session, no preload, no privileged channel) that runs artifact HTML offline. This module
 * owns the state machine and the preview documents; the Electron view factory is injected, so the
 * whole chain is testable without an app run.
 *
 * The invariants the acceptance names:
 *
 * - a card render never creates the container — only an explicit open does, and close destroys it;
 * - every open runs under a generation token: a late completion from an earlier selection is
 *   dropped, and a late completion after close can never resurrect a preview;
 * - an open reads the card's exact version; when the fresh stat disagrees it fails with its own
 *   code and retry re-reads the SAME version — it never silently advances to the newest one, and
 *   nothing ever re-runs a generator.
 */
import type { ArtifactFullscreenOutcome, ArtifactKind, ArtifactOpenOutcome, ArtifactPreviewState, ArtifactWindowOutcome } from '../appservice/contracts.js'
import type { ArtifactRecord } from './artifacts.js'
import { buildCsvDocument, buildCsvEmptyDocument, CSV_PREVIEW_CAPS, parseCsv } from './csv.js'
import type { BridgeCaller } from './workspace-adoption.js'

/** What the container is asked to show. `artifact-html` is the artifact's own offline page. */
export type PreviewLoad =
  | { readonly kind: 'document', readonly body: string }
  | { readonly kind: 'pdf', readonly data: string }
  | { readonly kind: 'artifact-html', readonly body: string }

export interface PreviewContainer {
  /** Load one prepared preview; resolves when the container accepted it, rejects with a code. */
  readonly load: (input: PreviewLoad) => Promise<void>
  /** Ticket 033: switch the SAME document between side-panel and full-view layout. */
  readonly setExpanded?: (on: boolean) => void
  /** Release every resource (view, in-memory protocol map); the next open builds a fresh one. */
  readonly destroy: () => void
}

export interface ArtifactPreviewDeps {
  readonly callBridge: BridgeCaller
  /** Called only from an open that has passed every guard; a refusal means no preview surface. */
  readonly createContainer: () => PreviewContainer | { readonly failed: string }
  /** Ticket 044: the separate-window factory. Absent = the surface is a named 未就绪. */
  readonly createWindowContainer?: () => PreviewContainer | { readonly failed: string }
  readonly now: () => string
}

export interface ArtifactPreview {
  readonly open: (record: ArtifactRecord) => Promise<ArtifactOpenOutcome>
  readonly close: () => { readonly state: 'closed' }
  /** Same-version retry: re-runs the open flow for the failed selection, never a new version. */
  readonly retry: () => Promise<ArtifactOpenOutcome>
  /** Ticket 033: move the same loaded document between panel and full view — no reload. */
  readonly setExpanded: (on: boolean) => ArtifactFullscreenOutcome
  /** Ticket 044: open the separate window over the ALREADY-loaded version (explicit action only). */
  readonly openWindow: () => Promise<ArtifactWindowOutcome>
  /** Ticket 044: close the separate window — back to the panel layout; the run is never touched. */
  readonly closeWindow: () => ArtifactWindowOutcome
  readonly state: () => ArtifactPreviewState
}

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

/** A self-contained, script-free viewer document for one text-family page. */
export function buildTextDocument(input: {
  readonly name: string
  readonly kind: ArtifactKind
  readonly text: string
  readonly lines: number
  readonly eof: boolean
  readonly bytes: number | null
}): string {
  const kindLabel = input.kind === 'markdown' ? 'Markdown（以源文本查看）'
    : input.kind === 'code' ? '代码' : '纯文本'
  const pageNote = input.eof ? '' : `本页到第 ${String(input.lines)} 行；更后内容未显示（分页后置）。`
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(input.name)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
body { margin: 0; padding: 1.2rem 1.4rem; background: #111a18; color: #f2f4ef; font: 13px/1.6 -apple-system, "SF Mono", ui-monospace, monospace; }
header { display: flex; gap: .6rem; align-items: baseline; padding-bottom: .6rem; border-bottom: 1px solid rgb(160 185 173 / 18%); }
h1 { font-size: .82rem; margin: 0; font-weight: 600; }
span { color: #9ba8a2; font-size: .72rem; }
pre { margin: .9rem 0 0; white-space: pre-wrap; word-break: break-word; }
.note { margin-top: .8rem; color: #9ba8a2; font-size: .72rem; }
</style></head>
<body>
<header><h1>${escapeHtml(input.name)}</h1><span>${kindLabel} · ${input.bytes === null ? '字节数未知' : String(input.bytes) + ' 字节'} · 按卡片版本读取</span></header>
<pre>${escapeHtml(input.text)}</pre>
${pageNote === '' ? '' : `<p class="note">${pageNote}</p>`}
</body></html>`
}

/** A self-contained viewer document for one image, embedded as a data URL (no local reads).
 *  Ticket 033 (US-173): zoom and pan are pure viewer UI — a CSS-only radio switch scales the
 *  image and the stage pans by native scrolling. No script runs here (the CSP keeps
 *  `default-src 'none'` without a script source), nothing is written, and there is no annotation
 *  surface (批注绑定版本与权限，后置). */
export function buildImageDocument(input: {
  readonly name: string
  readonly mime: string
  readonly data: string
  readonly bytes: number
}): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(input.name)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
body { margin: 0; padding: 1.2rem; background: #111a18; color: #f2f4ef; font: 12px/1.6 -apple-system, sans-serif; display: grid; gap: .8rem; }
header { color: #9ba8a2; }
.zoom { display: flex; gap: .5rem; align-items: center; color: #9ba8a2; }
.zoom input { position: absolute; opacity: 0; pointer-events: none; }
.zoom label { padding: .25rem .7rem; border: 1px solid rgb(160 185 173 / 30%); border-radius: 6px; cursor: pointer; }
.zoom input:checked + label { border-color: #9ec9b6; color: #f2f4ef; }
.zoom input:focus-visible + label { outline: 2px solid #9ec9b6; outline-offset: 1px; }
.stage { overflow: auto; max-height: calc(100vh - 9rem); border: 1px solid rgb(160 185 173 / 24%); border-radius: 6px; }
.stage img { display: block; width: 100%; height: auto; }
#zi100:checked ~ .stage img { width: 100%; }
#zi150:checked ~ .stage img { width: 150%; max-width: none; }
#zi200:checked ~ .stage img { width: 200%; max-width: none; }
.note { color: #9ba8a2; font-size: .72rem; }
</style></head>
<body>
<header>${escapeHtml(input.name)} · 图像 · ${String(input.bytes)} 字节 · 按卡片版本读取</header>
<input type="radio" name="zoom" id="zi100" checked><input type="radio" name="zoom" id="zi150"><input type="radio" name="zoom" id="zi200">
<div class="zoom"><span>缩放</span><label for="zi100">100%</label><label for="zi150">150%</label><label for="zi200">200%</label><span>放大后用滚动平移</span></div>
<figure class="stage" style="margin:0"><img src="data:${input.mime};base64,${input.data}" alt="${escapeHtml(input.name)}"></figure>
<p class="note">查看为纯 UI：缩放与平移不写文件、不修改内容；本版没有批注入口。</p>
</body></html>`
}

const IMAGE_MIME: Readonly<Record<string, string>> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
}

export function createArtifactPreview(deps: ArtifactPreviewDeps): ArtifactPreview {
  let generation = 0
  let container: PreviewContainer | null = null
  let windowContainer: PreviewContainer | null = null
  let state: ArtifactPreviewState = { state: 'closed' }
  let lastFailed: ArtifactRecord | null = null
  /** Ticket 044: the ONE prepared document of the current selection — the window loads this exact
   *  reference (no re-stat, no re-read, no generator), so both surfaces share one version value. */
  let lastLoad: PreviewLoad | null = null

  const openRecord = async (record: ArtifactRecord): Promise<ArtifactOpenOutcome> => {
    if (record.kind === 'office') {
      // US-040: the accurate-version file card stands; the original-format preview does not exist
      // in this release, and nothing is auto-converted.
      return { state: 'refused', code: 'artifact-format-deferred' }
    }
    if (record.kind === 'binary') return { state: 'refused', code: 'artifact-format-unsupported' }
    const mine = ++generation
    state = { state: 'opening', artifactId: record.artifactId, name: record.name }
    const fail = (code: string, retryable: boolean): ArtifactOpenOutcome => {
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      lastFailed = record
      state = { state: 'failed', artifactId: record.artifactId, name: record.name, code, retryable }
      return { state: 'opened', preview: state }
    }
    // 1) The exact version must still be the readable one — a moved file is a failure, never a
    //    silent switch to the newest version (US-035).
    const stat = asAnswer(await deps.callBridge('workspaceFiles/stat', [{ workspaceRoot: record.workspaceRoot, path: record.path }]))
    if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
    if (!stat.ok) {
      return fail(stat.code === 'bridge-file-not-found' ? 'artifact-source-absent' : stat.code, true)
    }
    const statVersion = isRecord(stat.result) && typeof stat.result.version === 'string' ? stat.result.version : null
    if (statVersion === null || statVersion !== record.version) return fail('artifact-version-changed', true)
    // 2) Read the content for this kind through the content port.
    let load: PreviewLoad
    if (record.kind === 'image') {
      const read = asAnswer(await deps.callBridge('workspaceFiles/readAll', [{ workspaceRoot: record.workspaceRoot, path: record.path }]))
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      if (!read.ok) return fail(read.code === 'bridge-file-too-large' ? 'artifact-too-large' : read.code, read.code === 'bridge-file-too-large')
      const data = isRecord(read.result) && typeof read.result.data === 'string' ? read.result.data : null
      const bytes = isRecord(read.result) && typeof read.result.bytes === 'number' ? read.result.bytes : record.bytes
      const version = isRecord(read.result) && typeof read.result.version === 'string' ? read.result.version : null
      if (data === null || version !== record.version) return fail('artifact-version-changed', true)
      const extension = record.name.slice(record.name.lastIndexOf('.') + 1).toLowerCase()
      load = { kind: 'document', body: buildImageDocument({ name: record.name, mime: IMAGE_MIME[extension] ?? 'application/octet-stream', data, bytes: bytes ?? 0 }) }
    } else if (record.kind === 'pdf') {
      const read = asAnswer(await deps.callBridge('workspaceFiles/readAll', [{ workspaceRoot: record.workspaceRoot, path: record.path }]))
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      if (!read.ok) return fail(read.code === 'bridge-file-too-large' ? 'artifact-too-large' : read.code, read.code === 'bridge-file-too-large')
      const data = isRecord(read.result) && typeof read.result.data === 'string' ? read.result.data : null
      const version = isRecord(read.result) && typeof read.result.version === 'string' ? read.result.version : null
      if (data === null || version !== record.version) return fail('artifact-version-changed', true)
      load = { kind: 'pdf', data }
    } else if (record.kind === 'html') {
      const read = asAnswer(await deps.callBridge('workspaceFiles/readAll', [{ workspaceRoot: record.workspaceRoot, path: record.path }]))
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      if (!read.ok) return fail(read.code === 'bridge-file-too-large' ? 'artifact-too-large' : read.code, read.code === 'bridge-file-too-large')
      const data = isRecord(read.result) && typeof read.result.data === 'string' ? read.result.data : null
      const version = isRecord(read.result) && typeof read.result.version === 'string' ? read.result.version : null
      if (data === null || version !== record.version) return fail('artifact-version-changed', true)
      // Offline interactive (design ADR-0001): the artifact's own page runs in the non-privileged
      // container; it reaches no network, no local file, no host capability.
      load = { kind: 'artifact-html', body: Buffer.from(data, 'base64').toString('utf8') }
    } else if (record.kind === 'csv') {
      // Ticket 016: the row cap is requested from the reader (+1 line, so `eof` shows the cut);
      // rows/columns/cells beyond the measured caps are counted cuts, never silent drops.
      const read = asAnswer(await deps.callBridge('workspaceFiles/read', [{
        workspaceRoot: record.workspaceRoot,
        path: record.path,
        range: { limit: CSV_PREVIEW_CAPS.maxRows + 1 },
      }]))
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      if (!read.ok) return fail(read.code === 'bridge-file-too-large' ? 'artifact-too-large' : read.code, read.code === 'bridge-file-too-large')
      const text = isRecord(read.result) && typeof read.result.text === 'string' ? read.result.text : null
      const version = isRecord(read.result) && typeof read.result.version === 'string' ? read.result.version : null
      if (text === null || version !== record.version) return fail('artifact-version-changed', true)
      const eof = isRecord(read.result) && read.result.eof === true
      const parsed = parseCsv(text, record.name.toLowerCase().endsWith('.tsv') ? '\t' : ',')
      if (parsed.state === 'parse-failed') return fail('artifact-csv-parse-failed', false)
      load = {
        kind: 'document',
        body: parsed.state === 'empty'
          ? buildCsvEmptyDocument({ name: record.name, bytes: record.bytes })
          : buildCsvDocument({ name: record.name, bytes: record.bytes, parsed, eof }),
      }
    } else {
      const read = asAnswer(await deps.callBridge('workspaceFiles/read', [{ workspaceRoot: record.workspaceRoot, path: record.path }]))
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      if (!read.ok) return fail(read.code === 'bridge-file-not-text' ? 'artifact-not-text' : read.code, false)
      const text = isRecord(read.result) && typeof read.result.text === 'string' ? read.result.text : null
      const version = isRecord(read.result) && typeof read.result.version === 'string' ? read.result.version : null
      if (text === null || version !== record.version) return fail('artifact-version-changed', true)
      const lines = isRecord(read.result) && typeof read.result.lines === 'number' ? read.result.lines : 0
      const eof = isRecord(read.result) && read.result.eof === true
      load = { kind: 'document', body: buildTextDocument({ name: record.name, kind: record.kind, text, lines, eof, bytes: record.bytes }) }
    }
    // 3) The container exists only from here on, and only for an open that got this far.
    if (container === null) {
      const created = deps.createContainer()
      if ('failed' in created) return fail(created.failed, true)
      container = created
    }
    try {
      await container.load(load)
    } catch (error) {
      if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
      const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'artifact-load-failed'
      return fail(code, true)
    }
    if (mine !== generation) return { state: 'refused', code: 'artifact-superseded' }
    lastFailed = null
    lastLoad = load
    state = { state: 'ready', artifactId: record.artifactId, name: record.name, kind: record.kind, version: record.version, expanded: false, window: false }
    return { state: 'opened', preview: state }
  }

  return {
    open: openRecord,
    close() {
      // Bump the generation first: whatever is in flight from here on is a late result, and a late
      // result must never reopen what the user closed (US-036). Then release the containers — the
      // separate window (044) shows the panel's document, so one close releases both.
      generation += 1
      lastFailed = null
      lastLoad = null
      container?.destroy()
      container = null
      windowContainer?.destroy() // separate window (044) shares this one close
      windowContainer = null
      state = { state: 'closed' }
      return { state: 'closed' }
    },
    retry() {
      if (state.state !== 'failed' || lastFailed === null) return Promise.resolve({ state: 'refused', code: 'artifact-not-failed' })
      // Same record, same version — retry re-reads it; it never advances and never regenerates.
      return openRecord(lastFailed)
    },
    setExpanded(on) {
      if (state.state !== 'ready') return { state: 'refused', code: 'artifact-preview-not-open' }
      // Layout only: the SAME document moves between panel and full view. No reload, no read.
      state = { ...state, expanded: on }
      container?.setExpanded?.(on)
      return { state: 'ok', preview: state }
    },
    async openWindow() {
      // US-205: the separate window opens ONLY on this explicit action over an already-open
      // preview — a card render, boot or the panel open never creates it.
      if (state.state !== 'ready' || lastLoad === null) return { state: 'refused', code: 'artifact-preview-not-open' }
      if (state.window) return { state: 'opened', preview: state }
      if (deps.createWindowContainer === undefined) return { state: 'refused', code: 'artifact-window-unavailable' }
      const mine = generation
      if (windowContainer === null) {
        const created = deps.createWindowContainer()
        if ('failed' in created) return { state: 'refused', code: created.failed }
        windowContainer = created
      }
      try {
        // The SAME prepared document reference: zero bridge calls, zero generator runs — the two
        // surfaces can never show two authoritative version values.
        await windowContainer.load(lastLoad)
      } catch (error) {
        windowContainer.destroy()
        windowContainer = null
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'artifact-window-load-failed'
        return { state: 'refused', code }
      }
      if (mine !== generation || state.state !== 'ready') {
        // A new selection landed while the window was loading: the stale window must never become
        // a second version value — drop it (迟到结果不覆盖当前选择).
        windowContainer.destroy()
        windowContainer = null
        return { state: 'refused', code: 'artifact-superseded' }
      }
      state = { ...state, window: true }
      return { state: 'opened', preview: state }
    },
    closeWindow() {
      // Closing the window returns to the panel layout and touches NOTHING else — the run is not
      // cancellable from here (this module's bridge surface is read-only).
      if (state.state !== 'ready') return { state: 'refused', code: 'artifact-preview-not-open' }
      if (!state.window) return { state: 'refused', code: 'artifact-window-not-open' }
      windowContainer?.destroy()
      windowContainer = null
      state = { ...state, window: false }
      return { state: 'closed', preview: state }
    },
    state: () => state,
  }
}
