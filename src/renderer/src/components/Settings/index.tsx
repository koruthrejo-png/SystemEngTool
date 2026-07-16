import { useStore } from '../../store'
import { SectionLabel, Button } from '../ui'
import { SWATCHES } from '../ArchitectureCanvas/swatches'

export default function Settings({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { colourByType, setColourByType, elementTypes, updateElementType } = useStore()
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
          <SectionLabel>Preferences</SectionLabel>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={colourByType}
              onChange={(e) => setColourByType(e.target.checked)}
            />
            Colour objects by type
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Type Colours</SectionLabel>
          <p className={`text-xs ${colourByType ? 'text-ink-faint' : 'text-ink-faint/50'}`}>
            {colourByType ? 'Objects inherit their type’s border colour.' : 'Turn on “Colour objects by type” to apply these.'}
          </p>
          {elementTypes.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-ink">{t.name}</span>
              <button
                type="button"
                aria-label={`${t.name} None`}
                title="None"
                onClick={() => updateElementType(t.id, { color: null })}
                className="h-5 w-5 rounded border border-line text-[10px] leading-none text-ink-faint hover:border-ink-faint"
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
                  className={`h-5 w-5 rounded border hover:border-ink-faint ${t.color === s.border ? 'border-ink ring-1 ring-ink' : 'border-line'}`}
                />
              ))}
            </div>
          ))}
        </section>

        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  )
}
