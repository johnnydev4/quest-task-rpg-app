import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const listener = () => setMatches(mq.matches)
    listener()
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [query])

  return matches
}

/** Breakpoint lg de Tailwind: a partir de aquí hay sidebar fija y panel lateral de detalle. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
