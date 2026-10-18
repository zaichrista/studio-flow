import { useState } from 'react'
import { deleteClient, saveClient } from '../lib/actions'
import { fmtDuration } from '../lib/dates'
import { clientStats, money } from '../lib/stats'
import { useStore } from '../lib/store'
import type { Client } from '../types'
import { Sheet } from './Sheet'
import { toast } from './Toast'

/** A client's own page: who they are, how to reach them, and what you've done together. */
export function ClientSheet({ client, onClose }: { client?: Client; onClose: () => void }) {
  const { data, update } = useStore()
  const [name, setName] = useState(client?.name ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const st = client ? clientStats(data, client.id) : null

  return (
    <Sheet title={client ? client.name : 'New client'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          update((d) => saveClient(d, { id: client?.id, name: name.trim(), email: email.trim(), notes }).data)
          if (!client) toast(`${name.trim()} added. Give them a project next.`)
          onClose()
        }}
      >
        {st && (
          <div className="client-stats">
            <div><b>{st.projects.length}</b><span>{st.projects.length === 1 ? 'project' : 'projects'}</span></div>
            <div><b>{money(st.paid)}</b><span>paid so far</span></div>
            <div><b className={st.waiting ? 'neg' : ''}>{money(st.waiting)}</b><span>waiting</span></div>
            <div><b>{st.seconds ? fmtDuration(st.seconds) : '–'}</b><span>{st.rate ? `${money(Math.round(st.rate))}/hr` : 'time given'}</span></div>
          </div>
        )}
        <label className="lab">Name<input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!client} /></label>
        <label className="lab">
          Email
          <input className="field" type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="So chasing an invoice is one tap" />
        </label>
        <label className="lab">
          Notes
          <textarea className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How they like to work, their brand colours, the name of their dog…" style={{ resize: 'vertical' }} />
        </label>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn">Save</button>
          {client?.email && <a className="btn quiet" href={`mailto:${client.email}`}>Email {client.name.split(' ')[0]}</a>}
          {client && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (confirm(`Remove ${client.name}? Their projects stay, without a client.`)) {
                  update((d) => deleteClient(d, client.id))
                  onClose()
                }
              }}
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
