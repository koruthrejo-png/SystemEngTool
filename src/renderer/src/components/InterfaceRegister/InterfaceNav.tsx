import { useStore } from '../../store'
import { SectionLabel } from '../ui'

export default function InterfaceNav(): JSX.Element {
  const { architectures, interfaceArchFilter, setInterfaceArchFilter } = useStore() as any

  const rowCls = (active: boolean): string =>
    `px-3 py-1.5 text-sm rounded cursor-pointer truncate ${active ? 'bg-white border border-line text-ink' : 'text-ink-muted hover:bg-white/60'}`

  return (
    <div className="flex flex-col h-full w-56 shrink-0 border-r border-line bg-workspace">
      <div className="px-4 pt-4 pb-2">
        <SectionLabel>Architectures</SectionLabel>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        <div className={rowCls(interfaceArchFilter === 'all')} onClick={() => setInterfaceArchFilter('all')}>
          All architectures
        </div>
        {architectures.map((a: any) => (
          <div key={a.id} className={rowCls(interfaceArchFilter === a.id)} onClick={() => setInterfaceArchFilter(a.id)}>
            {a.name}
          </div>
        ))}
      </div>
    </div>
  )
}
