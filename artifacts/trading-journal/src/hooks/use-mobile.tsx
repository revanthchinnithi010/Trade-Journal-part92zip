import * as React from "react"

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(orientation: portrait)").matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => getIsMobile())

  React.useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)")
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
