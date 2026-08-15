/**
 * The hand-written host Typert manifest for the deleteSession Remote.
 * Registered through `ctx.typert.register` in the plugin body — the same path
 * generated `./typert` artifacts use — so the Host Gateway resolves and
 * invokes `deleteSession/delete` without consulting the `@Remote` marker
 * table, mirroring the dsh-open-in-vscode pattern.
 */
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry/types'
import { DELETE_SESSION_INVOCATIONS } from './contract.ts'

/** The deleteSession namespace's host manifest (strict codecs shared with the client). */
export const TYPERT_MANIFEST: TypertContribution = {
  package: 'dsh-delete-session',
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: 'deleteSession',
        exportName: 'DeleteSessionRuntime',
        description: 'Delete one session: durable log, workspace accounting, and idle live instance.',
        tags: [],
        members: [
          {
            kind: 'method',
            name: 'delete',
            signature: 'delete(sessionId: string, signal?: AbortSignal): Promise<{ deleted: true }>',
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: DELETE_SESSION_INVOCATIONS,
}
