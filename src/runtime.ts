/**
 * The dsh-delete-session host Remote service (`ctx.deleteSession`, wire
 * namespace `deleteSession`). The deletion is layered, from safest to most
 * destructive:
 *
 *   1. Reject while an agent is running on the session.
 *   2. Flush and detach a live (idle) in-memory instance. The detach publishes
 *      `session/disposed`, which the host API proxy relays to connected
 *      clients as `host/session-removed` — the session disappears from every
 *      open list without a manual refresh.
 *   3. Remove the durable log directory (the whole `sessions/<project>/<id>`
 *      directory, found through `sessionPersistence.findLog`).
 *   4. Detach the id from every workspace record (`host/workspace-changed`
 *      frames follow from the domain write).
 */
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** Minimal structural faces for the core services this plugin touches. */
interface AgentLike {
  status?: 'idle' | 'running'
}

interface SessionLike {
  id: string
}

interface SessionsLike {
  get(id: string): SessionLike | undefined
  flush(session: SessionLike): Promise<unknown>
  /** Private single-shot detach capability, addressed defensively. */
  store?: Map<string, { detach?: () => void }>
}

interface PersistenceLike {
  findLog?(id: string, signal?: AbortSignal): Promise<string | undefined>
}

interface WorkspaceEntityLike {
  sessionIds: readonly string[]
  detachSession(sessionId: string): Promise<unknown>
}

interface WorkspaceRegistryLike {
  list(): WorkspaceEntityLike[]
}

interface HostFaces {
  agents: { get(id: string): AgentLike | undefined }
  sessions: SessionsLike
  sessionPersistence: PersistenceLike
  workspaceRegistry: WorkspaceRegistryLike
}

/** Delete-session service: one session per call, no resurrection path. */
export class DeleteSessionRuntime extends TypertRemoteService {
  /**
   * Register the service under the `deleteSession` key (the wire namespace).
   * @param ctx - owning cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, 'deleteSession')
  }

  /**
   * Delete one session — durable log, workspace accounting, and idle live
   * instance — in the layered order described on the class.
   * @param sessionId - the session to delete.
   * @param signal - caller lifetime; an abort before the file removal rejects.
   * @returns fulfillment once the deletion is accepted.
   */
  @Remote
  async delete(sessionId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new Error('无效的会话 ID')
    }
    if (signal?.aborted === true) {
      throw new Error('删除请求已中止')
    }
    const faces = this.ctx as unknown as HostFaces

    // 1. A running agent owns an in-flight turn: deleting underneath it would
    //    strand appends and resurrect the log. Refuse loudly instead.
    const agent = faces.agents.get(sessionId)
    if (agent !== undefined && agent.status === 'running') {
      throw new Error('会话正在运行，无法删除。请等待其完成后再试。')
    }

    // 2. Idle live instance: flush buffered events, then detach. The detach
    //    capability is a private store entry; address it defensively so a core
    //    refactor degrades to a cold-session delete instead of a crash.
    const session = faces.sessions.get(sessionId)
    if (session !== undefined) {
      await faces.sessions.flush(session)
      faces.sessions.store?.get(sessionId)?.detach?.()
    }

    // 3. Durable log: locate the artifact and remove its whole session
    //    directory (log plus any sibling artifacts).
    const logPath = await faces.sessionPersistence.findLog?.(sessionId, signal)
    if (signal?.aborted === true) {
      throw new Error('删除请求已中止')
    }
    if (logPath !== undefined) {
      await rm(dirname(logPath), { recursive: true, force: true })
    }

    // 4. Workspace accounting: the id leaves every record that references it.
    //    Each write publishes `domain/changed`, relayed as workspace-changed
    //    frames to connected clients.
    for (const entity of faces.workspaceRegistry.list()) {
      if (entity.sessionIds.includes(sessionId)) {
        await entity.detachSession(sessionId)
      }
    }

    return { deleted: true }
  }
}
