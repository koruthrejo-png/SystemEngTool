import { useState, useEffect } from 'react'
import { useStore } from '../../store'
import { Button, Select, SectionLabel } from '../ui'
import { buildInterfaceRows, customFieldKeys, loadColumnVisibility, saveColumnVisibility, BUILTIN_OPTIONAL_COLUMNS } from './rows'

const BUILTIN_LABELS: Record<string, string> = { name: 'Name', type: 'Type', description: 'Description', architecture: 'Architecture' }

export default function InterfaceRegister(): JSX.Element {
  const {
    project, connections, elements, connectionTypes, projectConnectionCustomFields, architectures,
    loadInterfaces, addConnection, selectConnection
  } = useStore() as any

  const [showColumns, setShowColumns] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  useEffect(() => { loadInterfaces() }, [])

  const rows = buildInterfaceRows(connections, elements, connectionTypes, projectConnectionCustomFields, architectures)
  const customKeys = customFieldKeys(projectConnectionCustomFields)
  const [vis, setVis] = useState<Record<string, boolean>>(() => loadColumnVisibility(customKeys))

  useEffect(() => { setVis(loadColumnVisibility(customKeys)) }, [customKeys.join('|')])

  function toggleCol(col: string): void {
    const next = { ...vis, [col]: !vis[col] }
    setVis(next)
    saveColumnVisibility(next)
  }

  const optionalCols = [...BUILTIN_OPTIONAL_COLUMNS, ...customKeys].filter((c) => vis[c])

  async function createInterface(): Promise<void> {
    if (!project || !sourceId || !targetId) return
    await addConnection({ projectId: project.id, sourceId: Number(sourceId), targetId: Number(targetId) })
    await loadInterfaces()
    setShowNew(false); setSourceId(''); setTargetId('')
  }

  function cellValue(row: ReturnType<typeof buildInterfaceRows>[number], col: string): string {
    if (col === 'name') return row.name
    if (col === 'type') return row.typeName
    if (col === 'description') return row.description
    if (col === 'architecture') return row.architectureName
    return row.customValues[col] ?? ''
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0">
        <span className="text-sm text-ink-muted">{rows.length} interfaces</span>
        <div className="ml-auto flex items-center gap-2 relative">
          <Button variant="secondary" onClick={() => setShowColumns((v) => !v)}>Columns</Button>
          <Button onClick={() => setShowNew((v) => !v)}>+ New Interface</Button>
          {showColumns && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-line rounded shadow p-2 w-48">
              {[...BUILTIN_OPTIONAL_COLUMNS, ...customKeys].map((col) => (
                <label key={col} className="flex items-center gap-2 px-1 py-1 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={vis[col] ?? true} onChange={() => toggleCol(col)} />
                  {BUILTIN_LABELS[col] ?? col}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="flex items-end gap-2 px-5 py-3 border-b border-line bg-workspace shrink-0">
          <div className="flex-1">
            <SectionLabel className="block mb-1">From</SectionLabel>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Source —</option>
              {elements.map((el: any) => <option key={el.id} value={el.id}>{el.blockId} — {el.name}</option>)}
            </Select>
          </div>
          <div className="flex-1">
            <SectionLabel className="block mb-1">To</SectionLabel>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">— Target —</option>
              {elements.map((el: any) => <option key={el.id} value={el.id}>{el.blockId} — {el.name}</option>)}
            </Select>
          </div>
          <Button onClick={createInterface} disabled={!sourceId || !targetId}>Create</Button>
          <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-workspace z-[1]">
            <tr className="text-left">
              <th className="px-4 py-2"><SectionLabel>Interface ID</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>From</SectionLabel></th>
              <th className="px-4 py-2"><SectionLabel>To</SectionLabel></th>
              {optionalCols.map((col) => (
                <th key={col} className="px-4 py-2"><SectionLabel>{BUILTIN_LABELS[col] ?? col}</SectionLabel></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.connectionId}
                onClick={() => selectConnection(row.connectionId)}
                className={`cursor-pointer border-t border-line hover:bg-workspace ${i % 2 === 1 ? 'bg-workspace/40' : ''}`}
              >
                <td className="px-4 py-2 font-mono text-ink">{row.interfaceId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.fromId}</td>
                <td className="px-4 py-2 font-mono text-ink-muted">{row.toId}</td>
                {optionalCols.map((col) => (
                  <td key={col} className="px-4 py-2 text-ink-muted">{cellValue(row, col) || '—'}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3 + optionalCols.length} className="px-4 py-6 text-center text-ink-faint">No interfaces yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
