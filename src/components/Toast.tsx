import { useEffect, useState } from 'react'

let push: (m: string) => void = () => {}

/** Show a short message at the bottom of the screen. */
export const toast = (message: string) => push(message)

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: number | undefined
    push = (m) => {
      setMsg(m)
      window.clearTimeout(t)
      t = window.setTimeout(() => setMsg(null), 3200)
    }
    return () => {
      push = () => {}
      window.clearTimeout(t)
    }
  }, [])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}
