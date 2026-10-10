import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopRead } from './client.js'
import { queryDesktopAttemptStatus, submitDesktopSession, type DesktopSessionContext, type DesktopSessionAction } from './session.js'

export type DesktopReadState = DesktopRead | { readonly kind: 'loading' }

function sameContext(left: DesktopSessionContext, right: DesktopSessionContext): boolean {
  return left.matterRef === right.matterRef && left.revisionRef === right.revisionRef
    && left.workspaceRef === right.workspaceRef && left.workspaceRoot === right.workspaceRoot
    && left.contextGeneration === right.contextGeneration && left.frameGeneration === right.frameGeneration
    && left.sessionId === right.sessionId
}

export function useDesktopSession(readState: () => Promise<DesktopRead>) {
  const [state, setState] = useState<DesktopReadState>({ kind: 'loading' })
  const stateRef = useRef<DesktopReadState>(state)
  const [draft, setDraft] = useState('')
  const draftRef = useRef({ text: '', revision: 0 })
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<symbol | null>(null)
  const uncertainMatters = useRef(new Set<string>())
  const [uncertaintyRevision, setUncertaintyRevision] = useState(0)
  const epoch = useRef(0)
  const sequence = useRef(0)
  const mounted = useRef(false)

  const changeDraft = (text: string) => {
    draftRef.current = { text, revision: draftRef.current.revision + 1 }
    setDraft(text)
  }
  // ADR-0297: one read-only reconciliation query per background read while the matter is
  // uncertain. It settles the gate ONLY on positive evidence — no active attempt answers — and
  // anything else (unavailable, another matter, still active) keeps the conservative block.
  const resolvingUncertainty = useRef(false)
  const resolveUncertainty = useCallback(async (matterRef: string): Promise<void> => {
    if (resolvingUncertainty.current) return
    resolvingUncertainty.current = true
    try {
      const status = await queryDesktopAttemptStatus()
      if (!mounted.current || status.kind !== 'read' || status.matterRef !== matterRef) return
      if (status.active !== null || !uncertainMatters.current.has(matterRef)) return
      uncertainMatters.current.delete(matterRef)
      setUncertaintyRevision(value => value + 1)
      setNotice(status.last === null
        ? '已核对：没有进行中的发送。'
        : `已核对：上一条发送已结算（${status.last.status === 'failed' ? '失败' : '成功'}），以会话记录为准。`)
    } finally {
      resolvingUncertainty.current = false
    }
  }, [])
  const publish = useCallback((next: DesktopReadState) => {
    stateRef.current = next
    setState(next)
  }, [])
  // Foreground reads (first load, explicit retry) clear the surface while they run; background
  // reads (polling, pre/post-action checks) keep the last projection so the session view is not
  // unmounted every couple of seconds. A failed read still publishes its result and withdraws the
  // previous operable context.
  const refresh = useCallback(async (mode: 'foreground' | 'background'): Promise<DesktopRead | null> => {
    const capturedEpoch = epoch.current
    const request = ++sequence.current
    if (mode === 'foreground') publish({ kind: 'loading' })
    let result: DesktopRead
    try {
      result = await readState()
    } catch {
      result = { kind: 'unavailable' }
    }
    if (!mounted.current || capturedEpoch !== epoch.current || request !== sequence.current) return null
    publish(result)
    if (result.kind === 'read' && result.session !== undefined
      && uncertainMatters.current.has(result.session.context.matterRef)) {
      void resolveUncertainty(result.session.context.matterRef)
    }
    return result
  }, [readState, publish, resolveUncertainty])

  useEffect(() => {
    mounted.current = true
    epoch.current += 1
    void refresh('foreground')
    return () => { mounted.current = false; epoch.current += 1; sequence.current += 1 }
  }, [refresh])

  // Inbox acceptance can precede turn/start, so idle bound sessions must also be observed.
  useEffect(() => {
    if (busy || state.kind !== 'read' || state.session === undefined) return
    const timer = setTimeout(() => { void refresh('background') }, 2000)
    return () => clearTimeout(timer)
  }, [state, busy, refresh])

  const retry = () => {
    if (inFlight.current !== null || stateRef.current.kind === 'loading') return
    void refresh('foreground')
  }

  const actOnSession = async (kind: DesktopSessionAction['kind']): Promise<void> => {
    if (inFlight.current !== null || (kind === 'send' && draftRef.current.text.trim() === '')) return
    const current = stateRef.current.kind === 'read' ? stateRef.current.session : undefined
    if (current === undefined) {
      setNotice('发送尚未接通：当前没有可用会话上下文，本次未发送，草稿已保留。')
      return
    }
    if (uncertainMatters.current.has(current.context.matterRef)) {
      setNotice('结果未知：仅可重新读取核对，不能重复发送；草稿已保留。')
      return
    }
    if (!current.canSubmit) {
      setNotice('当前会话不可提交操作，草稿已保留。')
      return
    }
    const operation = Symbol(kind)
    inFlight.current = operation
    setBusy(true)
    const startedEpoch = epoch.current
    const submitted = draftRef.current
    try {
      // The pre-submit freshness check must not race the 2s poll for the shared sequence guard: a
      // poll whose read started later would discard this read (null) and turn a valid context into
      // a false "context changed" refusal. Polling is suspended by busy, so read directly, guard
      // only on epoch/mount, and publish the fresh projection (including a withdrawn context) —
      // any read that completes later is at least as fresh, so last writer wins is safe here.
      let freshRead: DesktopRead
      try {
        freshRead = await readState()
      } catch {
        freshRead = { kind: 'unavailable' }
      }
      if (!mounted.current || startedEpoch !== epoch.current) return
      publish(freshRead)
      const fresh = freshRead?.kind === 'read' ? freshRead.session : undefined
      if (fresh === undefined || !sameContext(current.context, fresh.context) || !fresh.canSubmit) {
        setNotice('上下文已失效或发生变化，本次未提交，草稿已保留。')
        return
      }
      const action: DesktopSessionAction = kind === 'send' ? { kind, text: submitted.text } : { kind }
      const outcome = await submitDesktopSession(fresh, action)
      if (outcome.kind === 'unknown') uncertainMatters.current.add(current.context.matterRef)
      if (!mounted.current || startedEpoch !== epoch.current) return
      const latest = stateRef.current.kind === 'read' ? stateRef.current.session : undefined
      if (latest === undefined || !sameContext(current.context, latest.context)) return
      if (outcome.kind === 'unknown') {
        setUncertaintyRevision(value => value + 1)
        setNotice('结果未知：不能确认是否已受理，禁止重发；草稿已保留。')
      } else if (outcome.kind === 'refused') {
        setNotice(`本次操作未受理（${outcome.code}），草稿已保留。`)
      } else if (outcome.kind === 'accepted' || outcome.kind === 'deferred') {
        if (draftRef.current.revision === submitted.revision) changeDraft('')
        setNotice(outcome.kind === 'accepted' ? '已进入收件箱，执行进度以会话记录为准。' : '已保留到待继续队列，尚未派发。')
      } else {
        setNotice(outcome.interrupted ? '恢复过程中再次暂停，以最新会话状态为准。' : '已收到操作回执，正在核对最新会话状态。')
      }
      await refresh('background')
    } finally {
      if (inFlight.current === operation) {
        inFlight.current = null
        if (mounted.current) setBusy(false)
      }
    }
  }

  const session = state.kind === 'read' ? state.session : undefined
  // uncertainMatters is a ref, so re-rendering on it needs a state bump (setUncertaintyRevision);
  // the bump itself carries no value.
  const uncertain = session === undefined
    ? uncertainMatters.current.size > 0 : uncertainMatters.current.has(session.context.matterRef)
  // Logout withdraws immediately: supersede every in-flight read or submission (epoch and
  // sequence bumps) and re-pull even while the surface is loading — the retry guard above must
  // not swallow the withdrawal.
  const withdraw = () => {
    epoch.current += 1
    sequence.current += 1
    void refresh('foreground')
  }
  return { state, session, draft, changeDraft, notice, setNotice, busy, uncertain, retry, withdraw, actOnSession }
}
