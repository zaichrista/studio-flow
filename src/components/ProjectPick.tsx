import { patchTask } from '../lib/actions'
import { useStore } from '../lib/store'
import { ProjectOptions } from './ProjectOptions'
import type { Task } from '../types'

/** Move a task into a project (or out of one) after it was made. */
export function ProjectPick({ task }: { task: Task }) {
  const { data, update } = useStore()
  return (
    <label className="lab">
      Project
      <select
        className="field"
        value={task.projectId ?? ''}
        onChange={(e) => update((d) => patchTask(d, task.id, { projectId: e.target.value || null }))}
      >
        <ProjectOptions data={data} keep={task.projectId} />
      </select>
    </label>
  )
}
