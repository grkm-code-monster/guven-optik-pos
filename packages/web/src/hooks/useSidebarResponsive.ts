import { useCallback, useEffect, useState, type CSSProperties } from 'react'

export const MOBILE_BREAKPOINT_PX = 768

export function useIsMobile(breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [mobil, setMobil] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const onChange = () => setMobil(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpointPx])

  return mobil
}

function readDesktopOpen(storageKey: string): boolean {
  return localStorage.getItem(storageKey) !== 'false'
}

export function useSidebarResponsive(storageKey: string) {
  const [mobil, setMobil] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
  })

  const [sidebarAcik, setSidebarAcik] = useState(() => {
    if (typeof window === 'undefined') return true
    const isMobil = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
    if (isMobil) return false
    return readDesktopOpen(storageKey)
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const onChange = () => {
      const isMobil = mq.matches
      setMobil(isMobil)
      if (isMobil) {
        setSidebarAcik(false)
      } else {
        setSidebarAcik(readDesktopOpen(storageKey))
      }
    }
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [storageKey])

  const toggleSidebar = useCallback(() => {
    setSidebarAcik((v) => {
      const next = !v
      if (!window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches) {
        localStorage.setItem(storageKey, String(next))
      }
      return next
    })
  }, [storageKey])

  const closeSidebar = useCallback(() => {
    setSidebarAcik(false)
  }, [])

  return { mobil, sidebarAcik, toggleSidebar, closeSidebar }
}

export function hamburgerButtonStyle(extra?: CSSProperties): CSSProperties {
  return {
    border: 'none',
    background: 'rgba(255,255,255,0.15)',
    color: 'inherit',
    borderRadius: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
    flexShrink: 0,
    ...extra,
  }
}
