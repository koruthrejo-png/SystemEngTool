import { useState } from 'react'
import type { CreateModuleInput } from '../../../../types'

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
    <form onSubmit={handleSubmit} className="p-2 space-y-1 bg-gray-50 border-t border-gray-100">
      <input autoFocus placeholder="Module name" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
      <div className="flex gap-1">
        <input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)}
          className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
          title="ID digit count" className="w-14 text-sm px-2 py-1 border border-gray-300 rounded" />
      </div>
      <div className="flex gap-1">
        <button type="submit" className="flex-1 text-sm py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Add</button>
        <button type="button" onClick={onCancel} className="flex-1 text-sm py-1 border border-gray-300 rounded hover:bg-gray-100">Cancel</button>
      </div>
    </form>
  )
}
