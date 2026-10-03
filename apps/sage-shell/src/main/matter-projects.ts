/** Ticket 028 (US-149, D-089): projects are pure grouping records for matters.
 *
 * A project holds nothing but a name and the refs of the matters grouped under it; an assignment
 * is an organizational edge with a trail, never a copy of matter facts. Nothing in this module
 * touches responsibility, visibility, execution or any other store — the only thing an
 * assignment changes is the assignment itself (最多一个项目，变更保留当时依据).
 */
import type {
  MatterProjectTrailRecord,
  MatterProjectView,
  ProjectOutcome,
  ProjectsStatus,
} from '../appservice/contracts.js'

const MAX_NAME = 100
const MAX_MATTERS = 128
const MAX_TRAIL = 256

export interface MatterProjectsDeps {
  readonly now: () => string
  readonly nextId: () => string
}

export interface MatterProjectsStore {
  readonly list: () => ProjectsStatus
  readonly create: (request: { readonly name: string }) => ProjectOutcome
  readonly assign: (request: { readonly matterRef: string, readonly projectRef: string }) => ProjectOutcome
  readonly unassign: (request: { readonly matterRef: string }) => ProjectOutcome
}

interface ProjectRecord {
  readonly projectRef: string
  readonly name: string
  readonly createdAt: string
  readonly matterRefs: string[]
}

export function createMatterProjects(deps: MatterProjectsDeps): MatterProjectsStore {
  const projects: ProjectRecord[] = []
  const trail: MatterProjectTrailRecord[] = []

  const view = (): ProjectsStatus => ({
    state: 'read',
    // The summary references the same records by ref — it never copies matter facts (US-149).
    projects: projects.map((project): MatterProjectView => ({
      projectRef: project.projectRef,
      name: project.name,
      createdAt: project.createdAt,
      matterRefs: [...project.matterRefs],
    })),
    trail: [...trail],
  })

  const projectOf = (matterRef: string): ProjectRecord | undefined =>
    projects.find((project) => project.matterRefs.includes(matterRef))

  const note = (record: Omit<MatterProjectTrailRecord, 'at'>): void => {
    trail.push({ at: deps.now(), ...record })
    if (trail.length > MAX_TRAIL) trail.shift()
  }

  return {
    list: view,

    create(request) {
      const name = request.name.trim()
      if (name === '' || name.length > MAX_NAME) return { state: 'refused', code: 'project-name-invalid' }
      projects.push({ projectRef: deps.nextId(), name, createdAt: deps.now(), matterRefs: [] })
      return { state: 'ok', projects: view() }
    },

    assign(request) {
      const project = projects.find((entry) => entry.projectRef === request.projectRef)
      if (project === undefined) return { state: 'refused', code: 'project-not-found' }
      if (project.matterRefs.length >= MAX_MATTERS) return { state: 'refused', code: 'project-full' }
      const current = projectOf(request.matterRef)
      if (current === project) return { state: 'ok', projects: view() }
      if (current !== undefined) {
        // 最多一个项目 (D-089)：re-assignment is a move — the trail keeps where it came from.
        current.matterRefs.splice(current.matterRefs.indexOf(request.matterRef), 1)
        note({ action: 'move', matterRef: request.matterRef, fromProjectRef: current.projectRef, toProjectRef: project.projectRef })
      } else {
        note({ action: 'assign', matterRef: request.matterRef, fromProjectRef: null, toProjectRef: project.projectRef })
      }
      project.matterRefs.push(request.matterRef)
      return { state: 'ok', projects: view() }
    },

    unassign(request) {
      const current = projectOf(request.matterRef)
      if (current === undefined) return { state: 'refused', code: 'assignment-not-found' }
      current.matterRefs.splice(current.matterRefs.indexOf(request.matterRef), 1)
      note({ action: 'unassign', matterRef: request.matterRef, fromProjectRef: current.projectRef, toProjectRef: null })
      return { state: 'ok', projects: view() }
    },
  }
}
