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

/**
 * Only typert is injected declaratively (it exists under this name in every
 * current DSH profile). Every other core service is discovered defensively at
 * call time inside DeleteSessionRuntime, so a future core rename degrades one
 * layer instead of unmounting the whole plugin.
 */
export const inject = ['typert']

/**
 * Mount the delete-session service and its strict Typert manifest.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  new DeleteSessionRuntime(ctx)
  const register = (ctx as { typert?: { register(c: unknown): unknown } }).typert?.register
  if (register === undefined) return
  ctx.effect(() => {
    const dispose = register.call(ctx.typert, TYPERT_MANIFEST)
    return () => { void dispose }
  }, 'dsh-delete-session: typert manifest')
}
