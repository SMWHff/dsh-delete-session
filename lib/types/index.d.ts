/** dsh-delete-session host plugin entry (cordis plugin face). */
export const name: string
/** Required services: typert, agents, sessions, sessionPersistence, workspaceRegistry. */
export const inject: string[]
/** Mount the deleteSession Typert Remote service and its strict manifest. */
export function apply(ctx: unknown): void
