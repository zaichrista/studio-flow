import { describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { applySorted, clientNamed, deleteClient, emptyData, markPaid, saveProject, sendInvoice } from './actions'
import { clientStats } from './stats'
import { upgrade } from './store'

const monday8 = new Date(2026, 9, 19, 8, 0)

describe('clients', () => {
  it('turns the client names on older projects into clients', () => {
    const old = {
      ...emptyData(),
      clients: undefined,
      projects: [
        { id: 'p1', name: 'Logo', client: 'Maya', pay: 800, color: '#000', archived: false },
        { id: 'p2', name: 'Menu', client: 'maya ', pay: 200, color: '#000', archived: false },
        { id: 'p3', name: 'Zine', client: '', pay: 0, color: '#000', archived: false },
      ],
    } as unknown as AppData
    const d = upgrade(old)
    expect(d.clients.map((c) => c.name)).toEqual(['Maya'])
    expect(d.projects.map((p) => p.clientId)).toEqual([d.clients[0].id, d.clients[0].id, null])
    expect(d.projects[0]).not.toHaveProperty('client')
    // Upgrading again changes nothing.
    expect(upgrade(d).clients).toHaveLength(1)
  })

  it('files a sorted dump under the client it names', () => {
    const d = applySorted(emptyData(), { projects: [{ name: 'Café logo', client: 'Maya', tasks: [{ title: 'Moodboard' }] }] }, monday8)
    expect(d.clients.map((c) => c.name)).toEqual(['Maya'])
    expect(d.projects[0].clientId).toBe(d.clients[0].id)
    const again = clientNamed(d, 'MAYA')
    expect(again.id).toBe(d.clients[0].id)
    expect(again.data.clients).toHaveLength(1)
  })

  it("adds up a client's projects, money and waiting invoices", () => {
    let { data: d, id } = clientNamed(emptyData(), 'Maya')
    d = saveProject(d, { name: 'Logo', pay: 800, clientId: id })
    d = saveProject(d, { name: 'Menu', pay: 200, clientId: id })
    d = markPaid(d, d.projects[0].id, '2026-10-12')
    d = sendInvoice(d, d.projects[1].id, { sentOn: '2026-10-15', termsDays: 14 })
    const st = clientStats(d, id)
    expect(st.projects).toHaveLength(2)
    expect(st.paid).toBe(800)
    expect(st.waiting).toBe(200)
  })

  it('keeps projects when a client is removed', () => {
    let { data: d, id } = clientNamed(emptyData(), 'Maya')
    d = saveProject(d, { name: 'Logo', clientId: id })
    d = deleteClient(d, id)
    expect(d.clients).toHaveLength(0)
    expect(d.projects[0].clientId).toBeNull()
  })
})
