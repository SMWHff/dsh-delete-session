/**
 * dsh-delete-session client plugin: the browser half of the session
 * overflow-menu "Delete session" row. Mounts the deleteSession Remote
 * namespace, installs the DOM adapter that appends the row to every session
 * menu, and renders the product-grade RiskConfirmation dialog (with toast
 * feedback) through a dedicated React root. On success the client refreshes
 * the session baseline and clears the selection when the deleted session was
 * current.
 */
import { createRoot, type Root } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: brings the ctx.locale Context merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DELETE_SESSION_REMOTE } from './remote.ts'
import { NS, zh, en } from './locales.ts'
import { DeleteConfirmDialog, type DeleteConfirmDialogProps, type DeleteTarget } from './confirm.tsx'
import { installSessionMenu, type SessionsSource } from './session-menu.ts'

/** Required services: slots, the gateway Remote face, locale, and sessions. */
export const inject = ['slots', 'remote', 'locale', 'sessions']

/** The mounted deleteSession namespace service's callable face. */
interface DeleteSessionNamespaceFace {
  delete(sessionId: string, signal?: AbortSignal): Promise<
    { ok: true; value: { deleted: true } } | { ok: false; error: { code: string; message: string; details: object } }
  >
}

/**
 * Compose the session overflow-menu row and its confirmation surface.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-delete-session: dictionaries')

  // The mounted namespace handle resolves through the service store
  // (`ctx.reflect.get`), not through `ctx.remote.deleteSession`: the
  // generated-style dotted read walks the cordis fiber chain and stops at the
  // Loader's runtime-less internal forks between a plugin entry and the root
  // fiber (same pattern as dsh-open-in-vscode).
  let deleteSession: DeleteSessionNamespaceFace | undefined
  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(DELETE_SESSION_REMOTE)
    deleteSession = (ctx.reflect as unknown as { get(name: string): unknown })
      .get('remote.deleteSession') as DeleteSessionNamespaceFace | undefined
    if (deleteSession === undefined) {
      throw new Error('dsh-delete-session: the deleteSession Remote namespace did not mount')
    }
    return () => {
      deleteSession = undefined
      void dispose()
    }
  }, 'dsh-delete-session: remote')

  const del = async (sessionId: string): Promise<void> => {
    if (deleteSession === undefined) {
      throw new Error('dsh-delete-session: the deleteSession Remote is not mounted')
    }
    const result = await deleteSession.delete(sessionId)
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    // Upkeep: pull the fresh baseline, then drop the selection when the
    // deleted session was current (the layout falls back to the empty state).
    const sessions = ctx.sessions as unknown as SessionsSource
    await sessions.refresh()
    if (sessions.list.getSnapshot().current === sessionId) {
      sessions.clear()
    }
  }

  // The confirmation dialog owns a dedicated React root on <body>; the DOM
  // adapter only reports the resolved deletion target into it.
  const mount = document.createElement('div')
  mount.id = 'dsh-delete-session-root'
  document.body.appendChild(mount)
  const root: Root = createRoot(mount)
  let target: DeleteTarget | null = null
  const render = (): void => {
    root.render(
      <DeleteConfirmDialog
        target={target}
        t={ctx.locale.bind(NS) as DeleteConfirmDialogProps['t']}
        onClose={() => {
          target = null
          render()
        }}
        onConfirm={del}
      />,
    )
  }
  render()

  ctx.effect(() => {
    const sessions = ctx.sessions as unknown as SessionsSource
    const dispose = installSessionMenu({
      sessions,
      workspaceT: ctx.locale.bind('workspace'),
      rowT: ctx.locale.bind(NS),
      onDeleteRequest: (next) => {
        target = next
        render()
      },
    })
    return () => {
      dispose()
      root.unmount()
      mount.remove()
    }
  }, 'dsh-delete-session: session menu')
}
