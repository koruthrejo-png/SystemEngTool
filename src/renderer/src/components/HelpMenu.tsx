import { useEffect, useState } from 'react'
import HeaderMenu, { MenuItem } from './HeaderMenu'
import { SectionLabel, Button } from './ui'

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl+K', 'Focus global search'],
  ['⌘Z / ⌘⇧Z', 'Undo / redo (architecture canvas)'],
  ['⌘D / Ctrl+D', 'Duplicate the selected object (canvas)'],
  ['Delete / Backspace', 'Delete the selected object or connection (canvas)'],
  ['Esc', 'Deselect / close the open panel or dialog'],
  ['Enter', 'Commit the current inline edit or dialog']
]

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40" onClick={onClose}>
      <div className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-96 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <SectionLabel>{title}</SectionLabel>
          <button aria-label="Close" onClick={onClose} className="text-ink-faint hover:text-ink text-base leading-none">×</button>
        </div>
        {children}
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </div>
  )
}

export default function HelpMenu(): JSX.Element {
  const [modal, setModal] = useState<null | 'shortcuts' | 'about'>(null)
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    if (modal === 'about') window.api.app.getVersion().then(setVersion)
  }, [modal])

  return (
    <>
      <HeaderMenu
        align="right"
        trigger={<span aria-label="Help" className="flex items-center justify-center w-6 h-6 text-white/70 hover:text-white text-base font-semibold leading-none">?</span>}
      >
        {(close) => (
          <>
            <MenuItem onClick={() => { close(); setModal('shortcuts') }}>Keyboard shortcuts</MenuItem>
            <MenuItem onClick={() => { close(); setModal('about') }}>About ReqArch</MenuItem>
          </>
        )}
      </HeaderMenu>

      {modal === 'shortcuts' && (
        <Modal title="Keyboard shortcuts" onClose={() => setModal(null)}>
          <dl className="flex flex-col gap-2 text-sm">
            {SHORTCUTS.map(([keys, desc]) => (
              <div key={keys} className="flex items-baseline justify-between gap-4">
                <dt className="font-mono text-xs text-ink whitespace-nowrap">{keys}</dt>
                <dd className="text-ink-faint text-right">{desc}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {modal === 'about' && (
        <Modal title="About ReqArch" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-1 text-sm text-ink">
            <div className="font-medium">ReqArch Suite</div>
            <div className="text-ink-faint">Version {version || '…'}</div>
          </div>
        </Modal>
      )}
    </>
  )
}
