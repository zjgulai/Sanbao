import { useEffect, useRef, useState, type ReactNode } from 'react'

/** ADR-0306: the add-custom-MCP form (O08) — a LOCAL UNSAVED DRAFT only.
 *
 *  Every observed state is a form-shape fact (empty form, transport field sets, dynamic rows,
 *  the JSON example, the serverName preview, the discard confirmation). Nothing here saves,
 *  installs, authorizes, previews or executes anything: 添加 MCP / 预览导入 answer the honest
 *  T10 refusal ("capability governance chain not established") and never touch configuration.
 *  Field-state loss across transport switches is NOT asserted — the observation explicitly did
 *  not verify it — the draft keeps its values and leaves that question open.
 */
export type McpTransport = 'stdio' | 'http' | 'sse'

/** The observed single mapping (sanbao-fixture → sanbao_fixture): dashes to underscores. The
 *  full normalization algorithm was NOT observed and is deliberately not invented here. */
export function serverNamePreview(name: string): string {
  return name.replaceAll('-', '_')
}

let rowId = 0
interface Row { readonly id: number; readonly name: string; readonly value: string }
const newRow = (): Row => ({ id: ++rowId, name: '', value: '' })

const JSON_EXAMPLE = `{
  "mcpServers": {
    "example": {
      "type": "streamable-http",
      "url": "https://example.com/mcp"
    }
  }
}`

export interface McpFormProps {
  /** Called only after the discard confirmation (or when nothing is unsaved). */
  readonly onClose: () => void
}

export function McpForm({ onClose }: McpFormProps): ReactNode {
  const [tab, setTab] = useState<'form' | 'json'>('form')
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<McpTransport | ''>('')
  const [url, setUrl] = useState('')
  const [command, setCommand] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [argumentRows, setArgumentRows] = useState<readonly Row[]>([])
  const [environmentRows, setEnvironmentRows] = useState<readonly Row[]>([])
  const [headerRows, setHeaderRows] = useState<readonly Row[]>([])
  const [json, setJson] = useState(JSON_EXAMPLE)
  const [notice, setNotice] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const addArgumentRef = useRef<HTMLButtonElement>(null)
  const addEnvironmentRef = useRef<HTMLButtonElement>(null)
  const addHeaderRef = useRef<HTMLButtonElement>(null)
  const keepEditingRef = useRef<HTMLButtonElement>(null)

  const dirty = name !== '' || transport !== '' || url !== '' || command !== '' || workdir !== ''
    || argumentRows.length > 0 || environmentRows.length > 0 || headerRows.length > 0
    || json !== JSON_EXAMPLE

  useEffect(() => {
    if (discardOpen) keepEditingRef.current?.focus()
  }, [discardOpen])

  const requestClose = () => { if (dirty) setDiscardOpen(true); else onClose() }
  const notWired = (what: string) => {
    setNotice(`${what}尚未接通：能力治理链未建立（T10）；本次修改不会保存或导入。`)
  }
  const rowList = (
    rows: readonly Row[], set: (next: readonly Row[]) => void, prefix: string, removePrefix: string,
    namePlaceholder: string, valuePlaceholder: string, addRef: React.RefObject<HTMLButtonElement | null>,
  ): ReactNode => <div className="mcp-rows">
    {rows.map((row, index) => <div className="mcp-row" key={row.id}>
      <input
        aria-label={`${prefix} ${String(index + 1)} 名称`}
        placeholder={namePlaceholder}
        value={row.name}
        onChange={(event) => set(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))}
      />
      <input
        aria-label={`${prefix} ${String(index + 1)} 值`}
        placeholder={valuePlaceholder}
        value={row.value}
        onChange={(event) => set(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))}
      />
      <button type="button" className="text-button" aria-label={`${removePrefix} ${String(index + 1)}`}
        onClick={() => set(rows.filter((item) => item.id !== row.id))}>移除</button>
    </div>)}
  </div>

  return <div className="mcp-form" role="region" aria-label="添加自定义 MCP">
    <header className="mcp-form-header">
      <div className="mcp-tabs" role="tablist" aria-label="配置方式">
        <button type="button" role="tab" aria-label="表单" aria-selected={tab === 'form'} className={tab === 'form' ? 'active' : ''}
          onClick={() => setTab('form')}>表单</button>
        <button type="button" role="tab" aria-label="JSON" aria-selected={tab === 'json'} className={tab === 'json' ? 'active' : ''}
          onClick={() => setTab('json')}>JSON</button>
      </div>
      <button type="button" className="icon-button" aria-label="关闭" onClick={requestClose}>✕</button>
    </header>
    {tab === 'form'
      ? <div className="mcp-form-body">
        <label className="mcp-field">名称
          <input aria-label="名称" placeholder="例如 github-search" value={name}
            onChange={(event) => setName(event.target.value)} />
        </label>
        {name !== '' ? <p className="mcp-name-preview">Agent 将看到 serverName：{serverNamePreview(name)}</p> : null}
        <label className="mcp-field">传输类型
          <select aria-label="传输类型" value={transport}
            onChange={(event) => setTransport(event.target.value as McpTransport | '')}>
            <option value="" disabled>传输类型</option>
            <option value="stdio">STDIO</option>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </label>
        {transport === 'http' || transport === 'sse'
          ? <>
            <label className="mcp-field">服务地址
              <input aria-label="服务地址" placeholder="https://example.com/mcp" value={url}
                onChange={(event) => setUrl(event.target.value)} />
            </label>
            <p className="mcp-hint">支持 HTTP/HTTPS；不要在 URL 中放入 token 或密码。</p>
            {transport === 'http'
              ? <div className="mcp-rows-section">
                {rowList(headerRows, setHeaderRows, 'Header', '移除 Header', 'Header 名称', 'Header 值', addHeaderRef)}
                <button type="button" className="text-button" aria-label="添加 Header" ref={addHeaderRef}
                  onClick={() => { setHeaderRows([...headerRows, newRow()]); addHeaderRef.current?.focus() }}>添加 Header</button>
              </div>
              : null}
          </>
          : null}
        {transport === 'stdio'
          ? <>
            <label className="mcp-field">命令
              <input aria-label="命令" placeholder="例如 npx 或 python" value={command}
                onChange={(event) => setCommand(event.target.value)} />
            </label>
            <div className="mcp-rows-section">
              {argumentRows.map((row, index) => <div className="mcp-row" key={row.id}>
                <input aria-label={`参数 ${String(index + 1)}`} placeholder="输入一个参数" value={row.value}
                  onChange={(event) => setArgumentRows(argumentRows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
                <button type="button" className="text-button" aria-label={`移除参数 ${String(index + 1)}`}
                  onClick={() => setArgumentRows(argumentRows.filter((item) => item.id !== row.id))}>移除</button>
              </div>)}
              <button type="button" className="text-button" aria-label="添加参数" ref={addArgumentRef}
                onClick={() => { setArgumentRows([...argumentRows, newRow()]); addArgumentRef.current?.focus() }}>添加参数</button>
            </div>
            <label className="mcp-field">工作目录
              <input aria-label="工作目录" placeholder="/absolute/path" value={workdir}
                onChange={(event) => setWorkdir(event.target.value)} />
            </label>
            <p className="mcp-hint">只接受绝对路径。</p>
            <div className="mcp-rows-section">
              {rowList(environmentRows, setEnvironmentRows, '环境变量', '移除环境变量', '变量名', '变量值', addEnvironmentRef)}
              <button type="button" className="text-button" aria-label="添加变量" ref={addEnvironmentRef}
                onClick={() => { setEnvironmentRows([...environmentRows, newRow()]); addEnvironmentRef.current?.focus() }}>添加变量</button>
            </div>
          </>
          : null}
      </div>
      : <div className="mcp-form-body">
        <textarea aria-label="MCP JSON" rows={10} value={json} onChange={(event) => setJson(event.target.value)} />
        <p className="mcp-hint">标准 MCP JSON 示例；预览导入不解析实际配置。</p>
      </div>}
    {notice !== '' ? <p className="mcp-notice" role="status">{notice}</p> : null}
    <footer className="mcp-form-footer">
      <button type="button" className="text-button" aria-label="取消" onClick={requestClose}>取消</button>
      {tab === 'form'
        ? <button type="button" className="send-button" aria-label="添加 MCP" onClick={() => notWired('添加 MCP')}>添加 MCP</button>
        : <button type="button" className="text-button" aria-label="预览导入" onClick={() => notWired('预览导入')}>预览导入</button>}
    </footer>
    {discardOpen
      ? <div className="mcp-discard" role="alertdialog" aria-label="放弃未保存的修改？">
        <p>放弃未保存的修改？</p>
        <p className="mcp-hint">关闭后，本次表单或 JSON 修改不会保留。</p>
        <div className="mcp-discard-actions">
          <button type="button" className="text-button" aria-label="继续编辑" ref={keepEditingRef}
            onClick={() => setDiscardOpen(false)}>继续编辑</button>
          <button type="button" className="text-button mcp-discard-confirm" aria-label="放弃修改"
            onClick={onClose}>放弃修改</button>
        </div>
      </div>
      : null}
  </div>
}
