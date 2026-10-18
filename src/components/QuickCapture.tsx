import { useEffect, useState } from 'react'
import { quickCapture } from '../lib/actions'
import { parseDump } from '../lib/parseDump'
import { useStore } from '../lib/store'
import { IconPlus } from './Icons'
import { Sheet } from './Sheet'
import { toast } from './Toast'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a capture turned into, in a few words. */
function summary(text: string): string {
  const r = parseDump(text)
  const tasks = r.projects.reduce((a, p) => a + p.tasks.length, 0) + (r.loose?.length ?? 0)
  const ideas = r.projects.reduce((a, p) => a + (p.ideas?.length ?? 0), 0) + (r.ideas?.length ?? 0)
  const spends = r.expenses?.length ?? 0
  const parts = [tasks && plural(tasks, 'task'), ideas && plural(ideas, 'idea'), spends && plural(spends, 'spend')].filter(Boolean)
  return parts.length ? `Put down: ${parts.join(', ')}.` : 'Saved.'
}

let openIt: () => void = () => {}

/** Open the capture sheet from anywhere (e.g. the side menu). */
export const openCapture = () => openIt()

/**
 * One tap from any page to get a thought out of your head. It sorts and
 * places itself straight away; Undo is there if it landed wrong.
 */
export function QuickCapture({ hidden }: { hidden: boolean }) {
  const { data, update, replaceAll } = useStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  useEffect(() => {
    openIt = () => setOpen(true)
    return () => {
      openIt = () => {}
    }
  }, [])

  const save = () => {
    if (!text.trim()) return setOpen(false)
    const before = data
    update((d) => quickCapture(d, text))
    toast(summary(text), { label: 'Undo', run: () => replaceAll(before) })
    setText('')
    setOpen(false)
  }

  return (
    <>
      {!hidden && (
        <button className="capture-fab" onClick={() => setOpen(true)} aria-label="Put something down">
          <IconPlus />
        </button>
      )}
      {open && (
        <Sheet title="Put it down" onClose={save}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
            <textarea
              className="dump quick"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              }}
              placeholder="Whatever's on your mind. It finds its own place."
              aria-label="Put something down"
              autoFocus
            />
            <div className="row">
              <button className="btn">Put it down</button>
              <span className="faint small">Closing keeps it too.</span>
            </div>
          </form>
        </Sheet>
      )}
    </>
  )
}
