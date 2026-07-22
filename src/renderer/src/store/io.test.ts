import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './index'

describe('importCsv', () => {
  beforeEach(() => {
    useStore.setState({ project: { id: 7 } as any, selectedModuleId: 3, requirements: [], lastError: null })
  })
  it('re-syncs the module list after a successful import and reports skipped rows', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 1 } as any])
    ;(globalThis as any).window = { api: {
      io: { importCsv: vi.fn().mockResolvedValue({ created: 2, updated: 1, skipped: 1, errors: ['bad'] }) },
      requirements: { list }
    } }
    await useStore.getState().importCsv(3)
    expect(list).toHaveBeenCalledWith(3)
    expect(useStore.getState().requirements).toHaveLength(1)
    expect(useStore.getState().lastError).toMatch(/skipped/i)
  })
  it('does nothing on a cancelled dialog (null result)', async () => {
    const list = vi.fn()
    ;(globalThis as any).window = { api: {
      io: { importCsv: vi.fn().mockResolvedValue(null) }, requirements: { list }
    } }
    await useStore.getState().importCsv(3)
    expect(list).not.toHaveBeenCalled()
  })
})

describe('exportCsv', () => {
  it('calls the io bridge with the project id and module scope', async () => {
    const exportCsv = vi.fn().mockResolvedValue({ path: '/x.csv', count: 3 })
    ;(globalThis as any).window = { api: { io: { exportCsv } } }
    useStore.setState({ project: { id: 7 } as any })
    await useStore.getState().exportCsv(null)
    expect(exportCsv).toHaveBeenCalledWith(7, null)
  })
})
