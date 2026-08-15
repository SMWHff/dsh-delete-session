/**
 * The client-side Typert Remote contribution for the dsh-delete-session host
 * service: mounts the shared strict descriptors into `ctx.remote.deleteSession`.
 * The descriptors and codecs come from the shared contract module, so the
 * browser bundle and the host manifest stay on one wire definition.
 */
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { DELETE_SESSION_INVOCATIONS } from '../contract.ts'

/** The deleteSession Remote namespace's client contribution. */
export const DELETE_SESSION_REMOTE: TypertRemoteContribution = {
  package: 'dsh-delete-session',
  descriptors: DELETE_SESSION_INVOCATIONS,
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  // Typed face of the mounted namespace. Runtime access is NOT the dotted
  // `ctx.remote.deleteSession` read — the plugin resolves the namespace
  // service through `ctx.reflect.get('remote.deleteSession')` instead.
  /** The `deleteSession` namespace face mounted under `ctx.remote.deleteSession`. */
  interface TypertRemoteNamespace$64656c65746553657373696f6e {
    delete: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<{ deleted: true }>>
  }
  interface TypertRemoteMap {
    'deleteSession/delete': (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<{ deleted: true }>>
  }
  interface TypertRemoteNamespaceMap {
    deleteSession: TypertRemoteNamespace$64656c65746553657373696f6e
  }
}
