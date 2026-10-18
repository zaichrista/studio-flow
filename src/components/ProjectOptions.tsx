import type { AppData } from '../types'

/** Project choices grouped under their clients, for any project dropdown. */
export function ProjectOptions({ data, keep }: { data: AppData; keep?: string | null }) {
  const live = data.projects.filter((p) => !p.archived || p.id === keep)
  const groups = data.clients
    .map((c) => ({ c, projects: live.filter((p) => p.clientId === c.id) }))
    .filter((g) => g.projects.length > 0)
  const loose = live.filter((p) => !p.clientId || !data.clients.some((c) => c.id === p.clientId))
  return (
    <>
      <option value="">No project</option>
      {groups.map(({ c, projects }) => (
        <optgroup key={c.id} label={c.name}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </optgroup>
      ))}
      {loose.length > 0 && (groups.length > 0 ? (
        <optgroup label="No client">{loose.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
      ) : loose.map((p) => <option key={p.id} value={p.id}>{p.name}</option>))}
    </>
  )
}
