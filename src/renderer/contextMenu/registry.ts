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
 * up empty. After the primary, walk `env.under[]` and append sections
 * for each deeper target — the layered "In Room: …" pattern from the
 * Phase 8 proposal §D.4. The first non-empty section of each under-
 * target gets an auto-generated i18n header with the entity's name,
 * so a token-inside-room right-click visually separates token actions
 * from room actions.
 */
export function resolveSections(env: ContextEnvelope): MenuSection[] {
  const out: MenuSection[] = []
  pushKind(out, env, env.primary, null)
  for (const under of env.under) {
    pushKind(out, env, under, headerForUnder(under))
  }
  return out
}

interface InjectedHeader { key: string; values?: Record<string, string | number> }

function pushKind(
  out: MenuSection[],
  env: ContextEnvelope,
  target: ContextTarget,
  injectedHeader: InjectedHeader | null,
): void {
  const list = resolvers[target.kind]
  if (!list) return
  const localEnv: ContextEnvelope = { ...env, primary: target }
  let firstSection = true
  for (const resolver of list) {
    for (const section of resolver(localEnv)) {
      if (section.show && !section.show(localEnv)) continue
      // customRender sections are passed through as-is (their content
      // is opaque to the registry); regular item sections drop items
      // whose `show` predicate fails and skip the whole section if
      // every item filtered out.
      let items: typeof section.items
      if (section.items) {
        const filtered = section.items.filter((it) => !it.show || it.show(localEnv))
        if (filtered.length === 0 && !section.customRender) continue
        items = filtered
      } else if (!section.customRender) {
        // Section has neither items nor customRender — nothing to render.
        continue
      }
      out.push({
        ...section,
        headerKey: firstSection && injectedHeader ? injectedHeader.key : section.headerKey,
        headerValues: firstSection && injectedHeader ? injectedHeader.values : section.headerValues,
        items,
      })
      firstSection = false
    }
  }
}

function headerForUnder(target: ContextTarget): InjectedHeader | null {
  switch (target.kind) {
    case 'room':
      return { key: 'contextMenu.headers.inRoom', values: { name: target.room.name } }
    default:
      return null
  }
}
