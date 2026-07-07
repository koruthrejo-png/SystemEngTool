import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import type { SearchResults } from '../../../../types'

export default function GlobalSearch(): JSX.Element | null {
  const { project, modules, openRequirement, selectModule, setActiveTab } = useStore()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null) // null = dropdown closed
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setResults(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    const trimmed = term.trim()
    if (!project || trimmed.length < 2) {
      setResults(null)
      return
    }
    const t = setTimeout(() => {
      window.api.search
        .query(project.id, trimmed)
        // Stale-response guard: only apply if the input still holds the term this query was issued for.
        .then((r) => {
          if (inputRef.current?.value.trim() === trimmed) setResults(r)
        })
        .catch(() => setResults(null))
    }, 200)
    return () => clearTimeout(t)
  }, [term, project?.id])

  if (!project) return null

  const moduleName = (id: number): string => modules.find((m) => m.id === id)?.name ?? ''
  const isEmpty =
    results !== null &&
    results.requirements.length === 0 && results.modules.length === 0 && results.headings.length === 0

  function go(navigate: () => void): void {
    navigate()
    setTerm('')
    setResults(null)
  }

  return (
    <div ref={rootRef} className="relative w-64">
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setResults(null)
            inputRef.current?.blur()
          }
        }}
        placeholder="Search…  ⌘K"
        aria-label="Global search"
        className="w-full text-sm px-3 py-1.5 rounded border border-white/30 bg-white/10 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
      />
      {results !== null && (
        <div
          data-testid="search-results"
          className="absolute top-full mt-1 left-0 w-80 max-h-96 overflow-auto bg-white border border-line rounded shadow-lg z-50"
        >
          {isEmpty && <div className="px-3 py-2 text-sm text-ink-faint">No matches.</div>}
          {results.requirements.length > 0 && (
            <Group label="Requirements">
              {results.requirements.map((r) => (
                <Row key={r.id} onClick={() => go(() => { openRequirement(r) })}>
                  <span className="text-xs font-mono text-ink-faint shrink-0">{r.reqId}</span>
                  <span className="text-sm text-ink truncate">{r.text || '—'}</span>
                </Row>
              ))}
            </Group>
          )}
          {results.modules.length > 0 && (
            <Group label="Modules">
              {results.modules.map((m) => (
                <Row key={m.id} onClick={() => go(() => { setActiveTab('requirements'); selectModule(m.id) })}>
                  <span className="text-sm text-ink truncate">{m.name}</span>
                </Row>
              ))}
            </Group>
          )}
          {results.headings.length > 0 && (
            <Group label="Sections">
              {results.headings.map((h) => (
                <Row key={h.id} onClick={() => go(() => { setActiveTab('requirements'); selectModule(h.moduleId) })}>
                  <span className="text-sm text-ink truncate">{h.title || 'Untitled section'}</span>
                  <span className="text-xs text-ink-faint shrink-0">{moduleName(h.moduleId)}</span>
                </Row>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-ink-faint">{label}</div>
      {children}
    </div>
  )
}

function Row({ onClick, children }: { onClick: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-baseline gap-2 px-3 py-1.5 text-left hover:bg-action-tint/20"
    >
      {children}
    </button>
  )
}
