/**
 * The delete-session wire contract, shared verbatim by the host manifest
 * (`ctx.typert.register` in typert.ts) and the client contribution
 * (`ctx.remote.$mount` in client/remote.ts). The single endpoint deletes one
 * session — its durable log directory, its workspace accounting, and (when
 * idle) its live in-memory instance. The session id travels as a plain JSON
 * string: the session may be cold or absent, so the `session` Typert lookup
 * (which requires a live store entry) must not be involved.
 */
import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

/** Wire codec: the session id to delete. */
export const sessionIdSchema = z.string().min(1)

/** Wire codec: the delete result — the deletion was accepted. */
export const deleteResultSchema = z.object({ deleted: z.literal(true) }).readonly()

/** The deleteSession Remote namespace's strict invocation descriptors. */
export const DELETE_SESSION_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: 'dsh-delete-session#deleteSession/delete',
    service: 'deleteSession',
    namespace: 'deleteSession',
    method: 'delete',
    invocation: { kind: 'direct' },
    parameters: [
      {
        name: 'sessionId',
        wire: 'sessionId',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-delete-session#SessionId', schema: sessionIdSchema },
      },
    ],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: 'dsh-delete-session#DeleteResult',
      schema: deleteResultSchema,
    },
  },
]
