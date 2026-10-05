import { useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { DesktopPage } from './page.js'
import { SAGE_DESKTOP_CSS } from './styles.js'

function DesktopMount({ container }: { readonly container: HTMLElement }): ReactNode {
  useEffect(() => {
    container.dataset.sageDesktopMounted = 'true'
    return () => { delete container.dataset.sageDesktopMounted }
  }, [container])
  return <DesktopPage />
}

const container = document.getElementById('sage-desktop-root')
if (container) {
  const style = document.createElement('style')
  style.dataset.sageDesktopStyles = 'true'
  style.textContent = SAGE_DESKTOP_CSS
  document.head.append(style)
  createRoot(container).render(<DesktopMount container={container} />)
}
