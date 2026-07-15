import { useState } from 'react'
import type { CreateModuleInput, ModuleKind } from '../../../../types'
import { Button, Input, SectionLabel } from '../ui'

interface Props {
  projectId: number
  parentId: number | null
  onSubmit: (input: CreateModuleInput) => Promise<void>
  onCancel: () => void
}

export default function NewModuleForm({ projectId, parentId, onSubmit, onCancel }: Props): JSX.Element {
  const [kind, setKind] = useState<ModuleKind>('module')
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [padding, setPadding] = useState(4)
  const isFolder = kind === 'folder'

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    if (!isFolder && !prefix.trim()) return
    await onSubmit({
      projectId,
      parentId,
      kind,
      name: name.trim(),
      idPrefix: isFolder ? '' : prefix.trim().toUpperCase(),
      idPadding: padding
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 bg-workspace border-t border-line">
      <div className="flex rounded border border-line overflow-hidden text-xs">
        {([['folder', 'Folder'], ['module', 'Module']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`flex-1 px-2 py-1 ${kind === k ? 'bg-action text-white' : 'bg-white text-ink-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Input autoFocus placeholder={isFolder ? 'Folder name' : 'Module name'} value={name}
        onChange={(e) => setName(e.target.value)} className="!py-1.5" />
      {!isFolder && (
        <div className="flex gap-2">
          <Input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="flex-1 !py-1.5" />
          <label className="flex items-center gap-1.5 shrink-0">
            <SectionLabel>Digits</SectionLabel>
            <Input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
              title="ID digit count (prefix SRS + 4 digits = SRS-0001)" className="!w-14 !py-1.5" />
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 !py-1.5">Add</Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 !py-1.5">Cancel</Button>
      </div>
    </form>
  )
}
