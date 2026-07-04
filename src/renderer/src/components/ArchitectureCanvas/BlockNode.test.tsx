import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  nested: false, childCount: 0,
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

  it('shows name and id on the coloured bar when named, nothing in the body', () => {
    render(<BlockNode data={data} {...({} as any)} />)
    const header = screen.getByTestId('object-header')
    expect(within(header).getByText('Engine')).toBeInTheDocument()
    expect(within(header).getByText('SYS-001')).toBeInTheDocument()
    expect(within(header).queryByText('Object')).not.toBeInTheDocument()
    expect(screen.getAllByText('SYS-001')).toHaveLength(1)
    expect(screen.getAllByText('Engine')).toHaveLength(1)
  })

  it('shows the Object label on the bar and id/Unnamed in the body when unnamed', () => {
    render(<BlockNode data={{ ...data, label: '' }} {...({} as any)} />)
    const header = screen.getByTestId('object-header')
    expect(within(header).getByText('Object')).toBeInTheDocument()
    expect(within(header).queryByText('SYS-001')).not.toBeInTheDocument()
    expect(screen.getByText('SYS-001')).toBeInTheDocument()
    expect(screen.getByText('Unnamed')).toBeInTheDocument()
  })

  it('shows a NESTED tag only when the block is embedded', () => {
    render(<BlockNode data={data} {...({} as any)} />)
    expect(screen.queryByText('Nested')).not.toBeInTheDocument()
    render(<BlockNode data={{ ...data, nested: true }} {...({} as any)} />)
    expect(screen.getByText('Nested')).toBeInTheDocument()
  })

  it('shows a contains-count and container styling only when it has children', () => {
    const { container: plain } = render(<BlockNode data={data} {...({} as any)} />)
    expect(screen.queryByText(/Contains/)).not.toBeInTheDocument()
    expect(plain.querySelector('.border-dashed')).toBeNull()

    const { container: parent } = render(<BlockNode data={{ ...data, childCount: 2 }} {...({} as any)} />)
    expect(screen.getByText('Contains 2')).toBeInTheDocument()
    expect(parent.querySelector('.border-dashed')).not.toBeNull()
  })
})
