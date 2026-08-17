/**
 * DOM adapter that injects the "Delete session" row into every session
 * overflow menu of the workspace browser. The current harness build renders
 * the session row menu from a hard-coded item list (rename / fork / archive)
 * with no session row-menu slot, so the row mounts into the portaled menu
 * through the same MutationObserver + nested-root pattern as the
 * dsh-open-in-vscode legacy adapter.
 *
 * Session identity is resolved from the sessions list snapshot: a unique
 * display title maps directly; several sessions sharing a title are
 * disambiguated by the clicked row's position among the same-named rows in
 * the live DOM ("delete the row you clicked"); only when nothing matches and
 * the row is the selected one does the resolver fall back to `current`.
 * A title that is missing or ambiguous beyond recovery leaves the row
 * uninjected rather than deleting the wrong session.
 */
import { fmt, type DeleteSessionKey } from './locales.ts'
import type { DeleteTarget } from './confirm.tsx'

/** The sessions runtime face consumed here (list snapshot + post-delete upkeep). */
export interface SessionsSource {
  list: {
    getSnapshot(): SessionListSnapshot
  }
  refresh(): Promise<unknown>
  clear(): void
}

interface SessionListSnapshot {
  ids: string[]
  byId: Record<string, SessionSummary | undefined>
  current: string | undefined
}

interface SessionSummary {
  id: string
  displayTitle?: string
  blank?: boolean
}

type Translate = (key: string, params?: Record<string, unknown>) => string
type DeleteTranslate = (key: DeleteSessionKey, params?: Record<string, unknown>) => string

export interface SessionMenuOptions {
  /** The runtime sessions service (snapshot + refresh + clear). */
  sessions: SessionsSource
  /** The workspace namespace seat, for the session row/menu recognizers. */
  workspaceT: Translate
  /** The delete-session namespace seat, for the injected row copy. */
  rowT: DeleteTranslate
  /** Ask the owner to open the confirmation dialog for one resolved target. */
  onDeleteRequest: (target: DeleteTarget) => void
}

interface ActiveMenu {
  name: string
  sessionId: string
  anchor: HTMLElement
  menu?: HTMLElement
  mount?: HTMLElement
}

const MOUNT_ATTR = 'data-dsh-delete-session-legacy'
const STYLE_ID = 'dsh-delete-session-styles'

const TRASH_ICON = `
<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
  <path d="M6.5 2.5h3M3.25 4.25h9.5M5.5 4.25v8.75h5V4.25M6.75 6.5v4M9.25 6.5v4"
    stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
</svg>`

const css = `
.dsh-delete-session-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-state-error-primary, #e5484d);
  text-align: left;
}
.dsh-delete-session-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-delete-session-row:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-delete-session-row .dsh-delete-session-icon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}
.dsh-delete-session-row .dsh-delete-session-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-delete-session-danger:not(:disabled) {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
.dsh-delete-session-status {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #666);
}
.dsh-delete-session-error {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
`

/** Inject the row stylesheet once; a second call is a no-op. */
function adoptStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  document.head.appendChild(style)
}

/** Escape one literal for a RegExp source. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build the session-row aria-label matcher from the live locale template. */
function buildRowPattern(t: Translate): RegExp {
  const template = t('actions.session.aria') // e.g. 会话“{name}”的操作
  const source = `^${escapeRegex(template).replace('\\{name\\}', '(.+)')}$`
  return new RegExp(source)
}

/** The archive menu-row labels that identify a session menu (locale + fallbacks). */
function archiveLabels(t: Translate): string[] {
  return [t('menu.archiveSession'), '归档会话', 'Archive session']
}

function isSessionMenu(menu: HTMLElement, t: Translate): boolean {
  const labels = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    .map((item) => item.textContent?.trim() ?? '')
  const archives = archiveLabels(t)
  return labels.some((label) => archives.includes(label))
}

/** Keep the portaled menu open while the pointer enters the injected row. */
function cancelPointerLeaveClose(anchor: HTMLElement): void {
  anchor.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
}

/**
 * Add the Delete session row to every session overflow menu.
 * @returns disposer removing listeners, observers, and any mounted row.
 */
export function installSessionMenu(options: SessionMenuOptions): () => void {
  adoptStyles()
  const { sessions, workspaceT, rowT, onDeleteRequest } = options
  const rowPattern = buildRowPattern(workspaceT)
  let active: ActiveMenu | undefined

  /** Resolve a session row's title from its overflow button's aria-label; non-session rows yield undefined. */
  const rowNameOf = (row: HTMLElement): string | undefined => {
    const btn = row.querySelector<HTMLButtonElement>('button[aria-label]')
    if (btn === null) return undefined
    const match = rowPattern.exec(btn.getAttribute('aria-label') ?? '')
    return match === null ? undefined : match[1]
  }

  const resolveSessionId = (anchorRow: HTMLElement, name: string): string | undefined => {
    const snap = sessions.list.getSnapshot()
    const candidates = snap.ids.filter((id) => {
      const row = snap.byId[id]
      return row !== undefined && row.blank !== true && row.displayTitle === name
    })
    // A unique title resolves unambiguously.
    if (candidates.length === 1) return candidates[0]
    // Ambiguous titles: disambiguate by the clicked row's position among the
    // same-named rows in the live DOM, so "delete the row you clicked" holds
    // even when several sessions share a display title.
    if (candidates.length > 1) {
      const sameNameRows = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')]
        .filter((row) => rowNameOf(row) === name)
      const index = sameNameRows.indexOf(anchorRow)
      if (index !== -1 && index < candidates.length) {
        return candidates[index]
      }
    }
    // Fallback: the selected row is unambiguous — it is the current session.
    if (anchorRow.getAttribute('aria-selected') === 'true' && snap.current !== undefined) {
      return snap.current
    }
    return undefined
  }

  const unmount = (): void => {
    active?.mount?.remove()
    active?.menu?.removeAttribute(MOUNT_ATTR)
    if (active !== undefined) {
      active.menu = undefined
      active.mount = undefined
    }
  }

  const close = (): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  }

  const mountIntoOpenMenu = (): void => {
    if (active === undefined || active.mount !== undefined) return
    const menus = [...document.querySelectorAll<HTMLElement>('[role="menu"]')]
      .filter((menu) => isSessionMenu(menu, workspaceT))
    const menu = menus.at(-1)
    if (menu === undefined || menu.hasAttribute(MOUNT_ATTR)) return
    const viewport = menu.querySelector<HTMLElement>(':scope > [role="presentation"]') ?? menu
    const mount = document.createElement('div')
    mount.setAttribute('role', 'presentation')
    mount.setAttribute(MOUNT_ATTR, '')
    mount.addEventListener('pointerover', () => {
      if (active !== undefined) cancelPointerLeaveClose(active.anchor)
    })
    const row = document.createElement('button')
    row.type = 'button'
    row.role = 'menuitem'
    row.className = 'dsh-delete-session-row'
    row.setAttribute('aria-label', fmt(rowT('menu.deleteSession.aria' as DeleteSessionKey), { name: active.name }))
    const icon = document.createElement('span')
    icon.className = 'dsh-delete-session-icon'
    icon.innerHTML = TRASH_ICON
    const label = document.createElement('span')
    label.className = 'dsh-delete-session-label'
    label.textContent = rowT('menu.deleteSession')
    row.append(icon, label)
    row.addEventListener('click', () => {
      const target = active
      if (target === undefined) return
      close()
      // The owner opens the product-grade RiskConfirmation dialog.
      onDeleteRequest({ name: target.name, sessionId: target.sessionId })
    })
    mount.appendChild(row)
    viewport.appendChild(mount)
    menu.setAttribute(MOUNT_ATTR, '')
    active.menu = menu
    active.mount = mount
  }

  const observer = new MutationObserver(() => {
    if (active?.menu !== undefined && !active.menu.isConnected) unmount()
    mountIntoOpenMenu()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button[aria-label]')
    if (button === null) return
    const aria = button.getAttribute('aria-label')
    if (aria === null) return
    const match = rowPattern.exec(aria)
    if (match === null) return
    const name = match[1] ?? ''
    const anchorRow = button.closest<HTMLElement>('[role="treeitem"]')
    if (anchorRow === null) return
    const sessionId = resolveSessionId(anchorRow, name)
    if (sessionId === undefined) return
    unmount()
    active = { name, sessionId, anchor: button.parentElement ?? button }
    queueMicrotask(mountIntoOpenMenu)
  }
  document.addEventListener('click', onClick, true)

  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
    unmount()
    active = undefined
  }
}
