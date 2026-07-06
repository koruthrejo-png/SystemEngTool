import type { Module } from '../../../../types'

// Orphan-safe: a module whose parent is missing (corruption) renders as top-level, never vanishes.
export function topLevelModules(modules: Module[]): Module[] {
  return modules.filter((m) => m.parentId === null || !modules.some((p) => p.id === m.parentId))
}

export function childrenOf(modules: Module[], parentId: number): Module[] {
  return modules.filter((m) => m.parentId === parentId)
}

export function descendantIds(modules: Module[], rootId: number): Set<number> {
  const ids = new Set<number>()
  const walk = (id: number): void => {
    for (const m of modules) {
      if (m.parentId === id && !ids.has(m.id)) {
        ids.add(m.id)
        walk(m.id)
      }
    }
  }
  walk(rootId)
  return ids
}

export function flattenTree(modules: Module[]): { module: Module; depth: number }[] {
  const out: { module: Module; depth: number }[] = []
  const visit = (mods: Module[], depth: number): void => {
    for (const m of mods) {
      out.push({ module: m, depth })
      visit(childrenOf(modules, m.id), depth + 1)
    }
  }
  visit(topLevelModules(modules), 0)
  return out
}
