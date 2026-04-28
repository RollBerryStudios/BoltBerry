import type { ContextEnvelope, ContextTarget, MenuResolver, MenuSection } from './types'

/**
 * Per-kind registry. Each target kind owns a list of resolvers; on
 * right-click the engine invokes every resolver, concatenates their
 * sections, drops sections / items whose `show` predicate returns
 * false, and renders the result.
 *
 * Resolvers (rather than flat sections) let us register
 * cross-cutting catalogues — e.g. an "in-room" resolver attached to
 * the token kind that walks `env.under` for room entries and emits
 * room actions only when one is found.
 */
const resolvers: Partial<Record<ContextTarget['kind'], MenuResolver[]>> = {}

export function registerMenu(kind: ContextTarget['kind'], resolver: MenuResolver): void {
  if (!resolvers[kind]) resolvers[kind] = []
  resolvers[kind]!.push(resolver)
}

/** Test / hot-reload helper. Drops every registered resolver. */
export function clearMenuRegistry(): void {
  for (const k of Object.keys(resolvers) as Array<ContextTarget['kind']>) {
    delete resolvers[k]
  }
}

/**
 * Resolve sections for the envelope's primary kind, filter by `show`,
 * filter each section's items by `show`, drop any section that ends
 * up empty. Order: as the resolvers were registered.
 */
export function resolveSections(env: ContextEnvelope): MenuSection[] {
  const list = resolvers[env.primary.kind]
  if (!list) return []
  const out: MenuSection[] = []
  for (const resolver of list) {
    for (const section of resolver(env)) {
      if (section.show && !section.show(env)) continue
      const items = section.items.filter((it) => !it.show || it.show(env))
      if (items.length === 0) continue
      out.push({ ...section, items })
    }
  }
  return out
}
