/**
 * dsh-delete-session host plugin: mounts the `deleteSession` Typert Remote
 * service and registers its strict Typert manifest. The client half ships in
 * the same package (`./client`); the web server serves it under
 * /plugins/dsh-delete-session/client.js, and it injects the "Delete session"
 * row into every session's overflow menu.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings the `ctx.typert` Context merge into this program.
import type {} from '@deepseek-ai/dsh-typert-registry'
import { DeleteSessionRuntime } from './runtime.ts'
import { TYPERT_MANIFEST } from './typert.ts'

/** Cordis plugin name (the Loader entry and client bundle id). */
export const name = 'dsh-delete-session'

/** Services required before load: the Typert registry plus every core service the deletion touches. */
export const inject = ['typert', 'agents', 'sessions', 'sessionPersistence', 'workspaceRegistry']

/**
 * Mount the delete-session service and its strict Typert manifest.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  new DeleteSessionRuntime(ctx)
  ctx.effect(() => {
    const dispose = ctx.typert.register(TYPERT_MANIFEST)
    return () => { void dispose() }
  }, 'dsh-delete-session: typert manifest')
}
