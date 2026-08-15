/**
 * The dsh-delete-session host Remote service (`ctx.deleteSession`, wire
 * namespace `deleteSession`). Services are discovered defensively: the DSH
 * core renamed services across versions (session vs sessions, workspace vs
 * workspaceRegistry, session-persistence-jsonl vs sessionPersistence), so
 * this runtime tries every known candidate name at call time and degrades
 * gracefully when a face is absent, instead of failing cordis injection.
 *
 * Deletion is layered, from safest to most destructive:
 *   1. Reject while an agent is running on the session.
 *   2. Flush and detach a live (idle) in-memory instance.
 *   3. Remove the durable log directory (via the persistence service's
 *      findLog, whose ids are segment-encoded by the core — no traversal).
 *   4. Detach the id from every workspace record.
 *   5. If neither the live store nor the durable log knew the id, refuse.
 */
import { rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** Try each candidate service name; return the first one present, or undefined. */
function pick(ctx: Context, names: string[]): unknown {
  for (const name of names) {
    try {
      const service = ctx.get(name)
      if (service !== undefined) return service
    } catch {
      // not mounted under this name; try the next candidate
    }
  }
  return undefined
}

interface AgentLike {
  status?: 'idle' | 'running'
}

interface SessionLike {
  id: string
}

interface SessionsLike {
  get(id: string): SessionLike | undefined
  flush?(session: SessionLike): Promise<unknown>
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

/** Delete-session service: one session per call, no resurrection path. */
export class DeleteSessionRuntime extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'deleteSession')
  }

  private sessionsFace(): SessionsLike | undefined {
    return pick(this.ctx, ['sessions', 'session']) as SessionsLike | undefined
  }

  private persistenceFace(): PersistenceLike | undefined {
    return pick(this.ctx, ['session-persistence-jsonl', 'sessionPersistence']) as PersistenceLike | undefined
  }

  private agentsFace(): { get(id: string): AgentLike | undefined } | undefined {
    return pick(this.ctx, ['agents', 'agent']) as { get(id: string): AgentLike | undefined } | undefined
  }

  private workspaceFace(): WorkspaceRegistryLike | undefined {
    return pick(this.ctx, ['workspaceRegistry', 'workspace']) as WorkspaceRegistryLike | undefined
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

    // 1. A running agent owns an in-flight turn: deleting underneath it would
    //    strand appends and resurrect the log. Refuse loudly instead.
    const agent = this.agentsFace()?.get(sessionId)
    if (agent !== undefined && agent.status === 'running') {
      throw new Error('会话正在运行，无法删除。请等待其完成后再试。')
    }

    // 2. Idle live instance: flush buffered events, then detach. The detach
    //    capability is a private store entry; address it defensively so a core
    //    refactor degrades to a cold-session delete instead of a crash.
    const sessions = this.sessionsFace()
    const live = sessions?.get(sessionId)
    if (live !== undefined) {
      if (typeof sessions?.flush === 'function') await sessions.flush(live)
      sessions?.store?.get(sessionId)?.detach?.()
    }

    // 3. Durable log: locate the artifact and remove its whole session
    //    directory (log plus any sibling artifacts). The core persistence
    //    service segment-encodes ids, so no traversal is possible here.
    const logPath = await this.persistenceFace()?.findLog?.(sessionId, signal)
    if (signal?.aborted === true) {
      throw new Error('删除请求已中止')
    }
    if (logPath !== undefined) {
      await rm(dirname(logPath), { recursive: true, force: true })
    }

    // 4. Workspace accounting: the id leaves every record that references it.
    const workspace = this.workspaceFace()
    if (workspace !== undefined) {
      for (const entity of workspace.list()) {
        if (entity.sessionIds.includes(sessionId)) {
          await entity.detachSession(sessionId)
        }
      }
    }

    // 5. Neither the live store nor the durable log knew this id: refuse
    //    instead of reporting a deletion that deleted nothing.
    if (live === undefined && logPath === undefined) {
      throw new Error('会话不存在')
    }

    return { deleted: true }
  }
}
