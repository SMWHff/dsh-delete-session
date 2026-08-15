/**
 * `delete-session` locale namespace: the session overflow-menu row copy and
 * the confirmation dialog copy. Chinese is the product copy; English mirrors it.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'menu.deleteSession': '删除会话',
  'menu.deleteSession.aria': '删除会话“{name}”',
  'confirm.title': '删除会话',
  'confirm.desc': '将永久删除会话“{name}”的全部记录，此操作不可恢复。',
  'confirm.ok': '删除',
  'confirm.pending': '正在删除会话…',
  'confirm.cancel': '取消',
  'error.failed': '删除失败：{message}',
} satisfies Record<string, string>

/** The `delete-session` namespace key union. */
export type DeleteSessionKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'menu.deleteSession': 'Delete session',
  'menu.deleteSession.aria': 'Delete session “{name}”',
  'confirm.title': 'Delete session',
  'confirm.desc': 'This permanently removes all records of “{name}”. This cannot be undone.',
  'confirm.ok': 'Delete',
  'confirm.pending': 'Deleting session…',
  'confirm.cancel': 'Cancel',
  'error.failed': 'Delete failed: {message}',
} satisfies Record<DeleteSessionKey, string>

/** Locale namespace id registered under ctx.locale. */
export const NS = 'delete-session'

/**
 * Fill one dictionary template's `{name}`-style placeholders.
 * @param template - dictionary text.
 * @param params - placeholder values; absent params replace nothing.
 * @returns the filled text.
 */
export function fmt(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => params[key] ?? `{${key}}`)
}
