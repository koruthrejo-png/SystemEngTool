import { useState } from 'react'
import type { CreateModuleInput } from '../../../../types'
import { Button, Input } from '../ui'

interface Props {
  projectId: number
  parentId: number | null
  onSubmit: (input: CreateModuleInput) => Promise<void>
  onCancel: () => void
}

export default function NewModuleForm({ projectId, parentId, onSubmit, onCancel }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [padding, setPadding] = useState(4)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !prefix.trim()) return
    await onSubmit({ projectId, parentId, name: name.trim(), idPrefix: prefix.trim().toUpperCase(), idPadding: padding })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 bg-workspace border-t border-line">
      <Input autoFocus placeholder="Module name" value={name} onChange={(e) => setName(e.target.value)} className="!py-1.5" />
      <div className="flex gap-2">
        <Input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="flex-1 !py-1.5" />
        <Input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
          title="ID digit count" className="!w-16 !py-1.5" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 !py-1.5">Add</Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 !py-1.5">Cancel</Button>
      </div>
    </form>
  )
}
