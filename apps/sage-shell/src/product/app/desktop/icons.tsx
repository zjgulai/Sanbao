import type { ReactNode } from 'react'

// Sanbao b861d04, src/components/Controls.tsx:5–37. Only desktop-used paths are copied.
const paths = {
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.6 4.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M12 20V4m-6 6 6-6 6 6" />,
  down: <path d="m7 10 5 5 5-5" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  folder: <path d="M3 7V5h7l2 2h9v13H3Z" />,
  chat: <path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  book: <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-5 0h10" /></>,
  file: <><path d="M5 2h9l5 5v15H5Zm9 0v6h5" /><path d="M8 13h8m-8 4h6" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-7Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m10 2-1 3-3 1-3 1 1 4-1 4 3 2 3 1 1 4h4l1-4 3-1 3-2-1-4 1-4-3-1-3-1-1-3Z" /></>,
} satisfies Record<string, ReactNode>

export type DesktopIconName = keyof typeof paths

export function Icon({ name, size = 17 }: { readonly name: DesktopIconName; readonly size?: number }): ReactNode {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[name]}
  </svg>
}

// ProductPages.tsx:39–40: decorative geometry only; CSS consumes Sage tokens, not source colors.
export function TreeStamp(): ReactNode {
  return <div className="tree-stamp" aria-hidden="true"><svg viewBox="0 0 140 150" focusable="false">
    <rect className="tree-paper" x="8" y="8" width="124" height="132" fill="currentColor" />
    <rect className="tree-edge" x="8" y="8" width="124" height="132" fill="none" stroke="currentColor" strokeDasharray="2 5" strokeWidth="7" />
    <path className="tree-trunk" d="M71 105V48m0 34-22-17m22 8 22-20" stroke="currentColor" strokeWidth="5" />
    <path className="tree-leaves" d="M25 60C20 37 42 25 57 31 73 11 96 29 98 40c24-2 26 29 9 34 1 19-31 24-40 13-19 10-42 3-42-13Z" fill="currentColor" />
    <g className="tree-fruit" fill="currentColor"><circle cx="44" cy="54" r="4" /><circle cx="88" cy="45" r="4" /><circle cx="76" cy="70" r="4" /><circle cx="99" cy="68" r="4" /></g>
    <path className="tree-trunk" d="M33 110c27-8 54-8 78 0" stroke="currentColor" fill="none" />
    <text x="70" y="127" textAnchor="middle" fill="currentColor" fontSize="8" letterSpacing="2">A LITTLE GROWTH</text>
  </svg></div>
}
