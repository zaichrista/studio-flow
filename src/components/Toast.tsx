import { useEffect, useState } from 'react'

interface Action {
  label: string
  run: () => void
}

interface Msg {
  text: string
  action?: Action
}

let push: (m: Msg) => void = () => {}

/** Show a short message at the bottom of the screen, optionally with one action (e.g. Undo). */
export const toast = (message: string, action?: Action) => push({ text: message, action })

export function Toaster() {
  const [msg, setMsg] = useState<Msg | null>(null)
  useEffect(() => {
    let t: number | undefined
    push = (m) => {
      setMsg(m)
      window.clearTimeout(t)
      t = window.setTimeout(() => setMsg(null), m.action ? 6000 : 3200)
    }
    return () => {
      push = () => {}
      window.clearTimeout(t)
    }
  }, [])
  if (!msg) return null
  return (
    <div className="toast" role="status">
      {msg.text}
      {msg.action && (
        <button
          className="toast-act"
          onClick={() => {
            msg.action!.run()
            setMsg(null)
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  )
}
