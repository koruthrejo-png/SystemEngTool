import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BlockNode, { type BlockNodeData } from './BlockNode'

const handleSpy = vi.fn()
const resizerSpy = vi.fn()

vi.mock('@xyflow/react', () => ({
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  Handle: (props: any) => { handleSpy(props); return null },
  NodeResizer: (props: any) => { resizerSpy(props); return null }
}))

const data: BlockNodeData = {
  label: 'Engine', blockId: 'SYS-001', color: null, selected: true,
  onResizeEnd: vi.fn()
}

describe('BlockNode', () => {
  it('renders four source handles: left, right, top, bottom', () => {
    handleSpy.mockClear()
    render(<BlockNode data={data} {...({} as any)} />)
    const ids = handleSpy.mock.calls.map(([p]) => p.id).sort()
    expect(ids).toEqual(['bottom', 'left', 'right', 'top'])
    expect(handleSpy.mock.calls.every(([p]) => p.type === 'source')).toBe(true)
  })

  it('shows the resizer only when selected, with min size and resize-end wiring', () => {
    resizerSpy.mockClear()
    render(<BlockNode data={data} {...({} as any)} />)
    const props = resizerSpy.mock.calls[0][0]
    expect(props.isVisible).toBe(true)
    expect(props.minWidth).toBe(140)
    expect(props.minHeight).toBe(60)
    props.onResizeEnd(null, { x: 10, y: 20, width: 320, height: 180 })
    expect(data.onResizeEnd).toHaveBeenCalledWith(10, 20, 320, 180)

    resizerSpy.mockClear()
    render(<BlockNode data={{ ...data, selected: false }} {...({} as any)} />)
    expect(resizerSpy.mock.calls[0][0].isVisible).toBe(false)
  })

  it('still renders block id and name', () => {
    render(<BlockNode data={data} {...({} as any)} />)
    expect(screen.getAllByText('SYS-001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Engine').length).toBeGreaterThan(0)
  })
})
