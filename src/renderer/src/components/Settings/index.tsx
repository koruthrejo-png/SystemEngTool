import { useStore } from '../../store'
import { SectionLabel, Button, Input } from '../ui'
import { SWATCHES } from '../ArchitectureCanvas/swatches'
import type { AidKey } from '../ArchitectureCanvas/canvasAids'

// Order + labels for the Canvas display toggles.
const AID_ROWS: [AidKey, string][] = [
  ['connectionNames', 'Interface name'],
  ['connectionIds', 'Interface ID'],
  ['nested', '"Nested" badge'],
  ['contains', '"Contains" count'],
  ['connectionCount', 'Connection count (⇆)'],
  ['objectId', 'Object ID'],
  ['objectName', 'Object name']
]

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { colourByType, setColourByType, canvasAids, setCanvasAid, elementTypes, updateElementType, me, setMe, users, project } = useStore()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40" onClick={onClose}>
      <div
        className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-96 flex flex-col gap-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <SectionLabel>Settings</SectionLabel>
          <button aria-label="Close settings" onClick={onClose} className="text-ink-faint hover:text-ink text-base leading-none">×</button>
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel>You</SectionLabel>
          <p className="text-xs text-ink-faint">Stamped on requirements you create or edit.</p>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink">Name</span>
            <Input
              defaultValue={me?.displayName ?? ''}
              aria-label="Your name"
              onBlur={(e) => { if (e.target.value.trim() !== me?.displayName) setMe({ displayName: e.target.value }) }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink">Email</span>
            <Input
              type="email"
              defaultValue={me?.email ?? ''}
              aria-label="Your email"
              placeholder="optional"
              onBlur={(e) => { if ((e.target.value.trim() || null) !== me?.email) setMe({ email: e.target.value }) }}
            />
          </label>
        </section>

        {project && (
          <section className="flex flex-col gap-2">
            <SectionLabel>People</SectionLabel>
            <p className="text-xs text-ink-faint">Everyone who has edited this project.</p>
            {users.length === 0
              ? <p className="text-sm text-ink-faint">No edits recorded yet.</p>
              : users.map((u) => (
                <div key={u.id} className="flex items-baseline gap-2 text-sm">
                  <span className="text-ink">{u.displayName}</span>
                  {u.uuid === me?.uuid && <span className="text-xs text-ink-faint">(you)</span>}
                  {u.email && <span className="ml-auto text-xs text-ink-faint">{u.email}</span>}
                </div>
              ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel>Preferences</SectionLabel>
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-ink">Type colours</summary>
            <div className="flex flex-col gap-2 pl-4 pt-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={colourByType}
                  onChange={(e) => setColourByType(e.target.checked)}
                />
                Colour objects by type
              </label>
              <p className={`text-xs ${colourByType ? 'text-ink-faint' : 'text-ink-faint/50'}`}>
                {colourByType ? 'Objects inherit their type’s border colour.' : 'Turn on “Colour objects by type” to apply these.'}
              </p>
              {elementTypes.map((t) => (
                <div key={t.id} className="flex items-center gap-1.5">
                  <span className="w-20 shrink-0 truncate text-sm text-ink">{t.name}</span>
                  <button
                    type="button"
                    aria-label={`${t.name} None`}
                    title="None"
                    onClick={() => updateElementType(t.id, { color: null })}
                    className="h-4 w-4 shrink-0 rounded border border-line text-[9px] leading-none text-ink-faint hover:border-ink-faint"
                  >
                    ✕
                  </button>
                  {SWATCHES.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      aria-label={`${t.name} ${s.name}`}
                      title={s.name}
                      onClick={() => updateElementType(t.id, { color: s.border })}
                      style={{ background: s.border }}
                      className={`h-4 w-4 shrink-0 rounded border hover:border-ink-faint ${t.color === s.border ? 'border-ink ring-1 ring-ink' : 'border-line'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </details>
          <details className="text-sm">
            <summary className="cursor-pointer select-none text-ink">Canvas display</summary>
            <div className="flex flex-col gap-2 pl-4 pt-2">
              {AID_ROWS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={canvasAids[key]}
                    onChange={(e) => setCanvasAid(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        </section>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}
