import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** ADR-0299: one markdown renderer for assistant text — the durable reply and the live stream
 *  share it, so a heading or list renders identically whether it is still arriving or finished.
 *  Raw HTML is never rendered (react-markdown escapes it by default). Links render as text
 *  affordances only: navigation stays with the controlled external-link path, which is the
 *  registered follow-up. */
export function MarkdownText({ text }: { readonly text: string }): ReactNode {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      a: ({ children }) => <span className="md-link">{children}</span>,
    }}
  >{text}</ReactMarkdown>
}
