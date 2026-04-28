import type { MenuResolver, MenuSection } from './types'
import { registerMenu } from './registry'

/**
 * Sidebar list-row context menu (Phase 8 §E.Sidebar list rows). Each
 * sidebar list (maps, bestiary entries, character sheets, …) passes
 * its own action callbacks via `payload`; the resolver builds a
 * generic menu shape on top of them. Avoids per-list resolver
 * boilerplate while keeping every sidebar right-click on the same
 * <ContextMenu> primitive.
 *
 * The shape of `payload` is checked at runtime since `ContextTarget`
 * declares `payload: unknown` — list authors must hand the resolver
 * the items they want and the resolver renders them verbatim.
 */
export interface ListRowPayload {
  /** Optional menu sections to render. The resolver passes them
   *  through unchanged so the row's closure-scoped callbacks
   *  (e.g. `setRenaming(true)`) bind correctly. */
  sections: MenuSection[]
}

const listRowResolver: MenuResolver = (env) => {
  if (env.primary.kind !== 'list-row') return []
  const payload = env.primary.payload as ListRowPayload | undefined
  if (!payload || !Array.isArray(payload.sections)) return []
  return payload.sections
}

let registered = false
export function registerListRowMenu(): void {
  if (registered) return
  registered = true
  registerMenu('list-row', listRowResolver)
}
