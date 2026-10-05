import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopRead } from './client.js'
import { submitDesktopSession, type DesktopSessionContext, type DesktopSessionAction } from './session.js'

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
    return result
  }, [readState, publish])

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
      const freshRead = await refresh('background')
      if (!mounted.current || startedEpoch !== epoch.current) return
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
  const uncertain = uncertaintyRevision >= 0 && (session === undefined
    ? uncertainMatters.current.size > 0 : uncertainMatters.current.has(session.context.matterRef))
  return { state, session, draft, changeDraft, notice, setNotice, busy, uncertain, retry, actOnSession }
}
