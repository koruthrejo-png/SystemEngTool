import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArchitectureCanvas from './index'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: any) => <div data-testid="react-flow">{children}</div>,
  ReactFlowProvider: ({ children }: any) => <>{children}</>,
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => null,
  MiniMap: () => null,
  Panel: ({ children }: any) => <div>{children}</div>,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
  useReactFlow: () => ({ getInternalNode: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), fitView: vi.fn() }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
  MarkerType: { Arrow: 'arrow', ArrowClosed: 'arrowclosed' },
  NodeResizer: () => null,
  addEdge: vi.fn((edge, edges) => [...edges, edge]),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  Handle: () => null,
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: any) => <>{children}</>,
  getBezierPath: () => ['', 0, 0]
}))

const mockAddElement = vi.fn().mockResolvedValue(undefined)
const mockSelectElement = vi.fn()
const mockSelectConnection = vi.fn()
const mockUpdateElement = vi.fn()
const mockUpdateConnection = vi.fn()

// The bar's contextual segment keys off these; tests set them before render.
const mockEl = { id: 100, projectId: 1, architectureId: 1, parentId: null, blockId: 'SYS-001', name: 'Pump', elementTypeId: null, description: null, color: null, lineStyle: null, posX: 0, posY: 0, width: 140, height: 60, deletedAt: null, createdAt: '', updatedAt: '' }
const mockConn = { id: 5, projectId: 1, architectureId: 1, connId: 'ICN-0001', sourceId: 100, targetId: 101, sourceHandle: null, targetHandle: null, name: null, connectionTypeId: null, lineStyle: 'solid', markerStart: 'none', markerEnd: 'arrowclosed', description: null, deletedAt: null, createdAt: '', updatedAt: '' }
const mockSel: { elementId: number | null; connectionId: number | null } = { elementId: null, connectionId: null }

beforeEach(() => {
  mockSel.elementId = null
  mockSel.connectionId = null
  mockUpdateElement.mockClear()
  mockUpdateConnection.mockClear()
})

vi.mock('../../store', () => {
  // lazy: the factory is hoisted above the mock* consts, so build the state per call
  const state = () => ({
    project: { id: 1, name: 'Test', elemIdPrefix: 'SYS', elemIdPadding: 3, elemNextCounter: 1, connIdPrefix: 'ICN', connIdPadding: 4, connNextCounter: 1, createdAt: '', updatedAt: '' },
    elements: [mockEl],
    connections: [mockConn],
    elementTypes: [{ id: 7, projectId: 1, name: 'Sensor', color: null, isBuiltIn: true, deletedAt: null, createdAt: '', updatedAt: '' }],
    selectedElementId: mockSel.elementId,
    selectedConnectionId: mockSel.connectionId,
    layers: [],
    elementLayers: [],
    connectionLayers: [],
    addElement: mockAddElement,
    updateElement: mockUpdateElement,
    removeElement: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
    selectElement: mockSelectElement,
    selectConnection: mockSelectConnection,
    updateConnection: mockUpdateConnection,
    undo: vi.fn(),
    redo: vi.fn(),
    undoStack: [],
    redoStack: []
  })
  // the canvas keydown handler reads useStore.getState() — needed once tests dispatch keys
  return { useStore: Object.assign(() => state(), { getState: state }) }
})

describe('ArchitectureCanvas', () => {
  it('renders the canvas', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('renders the + Block toolbar button', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /\+ object/i })).toBeInTheDocument()
  })

  it('calls addElement when + Block is clicked', async () => {
    render(<ArchitectureCanvas />)
    await userEvent.click(screen.getByRole('button', { name: /\+ object/i }))
    expect(mockAddElement).toHaveBeenCalledWith({ projectId: 1, elementTypeId: null, posX: expect.any(Number), posY: expect.any(Number) })
  })

  it('renders the connect hint', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByText(/drag from a block's edge to connect/i)).toBeInTheDocument()
  })

  it('renders undo and redo buttons, disabled when history is empty', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled()
  })

  describe('layers popover', () => {
    const trigger = (): HTMLElement => screen.getByRole('button', { name: /layers/i })
    const panel = (): HTMLElement | null => screen.queryByText(/no layers yet/i)

    it('is closed until the trigger is clicked, then opens', async () => {
      render(<ArchitectureCanvas />)
      expect(panel()).not.toBeInTheDocument()
      await userEvent.click(trigger())
      expect(panel()).toBeInTheDocument()
    })

    it('closes on an outside click', async () => {
      render(<ArchitectureCanvas />)
      await userEvent.click(trigger())
      await userEvent.click(screen.getByTestId('react-flow'))
      expect(panel()).not.toBeInTheDocument()
    })

    it('stays open when clicking inside the panel', async () => {
      render(<ArchitectureCanvas />)
      await userEvent.click(trigger())
      await userEvent.click(screen.getByLabelText('New layer'))
      expect(panel()).not.toBeInTheDocument() // the add input replaced the empty state
      expect(screen.getByPlaceholderText('Layer name')).toBeInTheDocument()
    })

    it('closes on Escape', async () => {
      render(<ArchitectureCanvas />)
      await userEvent.click(trigger())
      await userEvent.keyboard('{Escape}')
      expect(panel()).not.toBeInTheDocument()
    })

    it('leaves Escape to the add input rather than closing the popover', async () => {
      render(<ArchitectureCanvas />)
      await userEvent.click(trigger())
      await userEvent.click(screen.getByLabelText('New layer'))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByPlaceholderText('Layer name')).not.toBeInTheDocument()
      expect(panel()).toBeInTheDocument() // popover survived; only the input was cancelled
    })
  })

  describe('contextual segment', () => {
    const style = (): HTMLElement => screen.getByRole('button', { name: /style/i })

    it('collapses when nothing is selected', () => {
      render(<ArchitectureCanvas />)
      expect(screen.queryByRole('button', { name: /style/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /type/i })).not.toBeInTheDocument()
    })

    it('offers Border and Line style when an object is selected', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      expect(screen.getByLabelText('Border')).toBeInTheDocument()
      expect(screen.getByLabelText('Line style')).toBeInTheDocument()
      expect(screen.queryByLabelText('Arrow start')).not.toBeInTheDocument()
    })

    it('offers Line style, Arrow start and Arrow end when a connection is selected', async () => {
      mockSel.connectionId = 5
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      expect(screen.getByLabelText('Line style')).toBeInTheDocument()
      expect((screen.getByLabelText('Arrow end') as HTMLSelectElement).value).toBe('arrowclosed')
      expect(screen.queryByLabelText('Border')).not.toBeInTheDocument()
    })

    it('changing the border colour calls updateElement with { color } only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      fireEvent.change(screen.getByLabelText('Border'), { target: { value: '#ff0000' } })
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { color: '#ff0000' })
    })

    it('changing the object line style calls updateElement with { lineStyle } only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      fireEvent.change(screen.getByLabelText('Line style'), { target: { value: 'dashed' } })
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { lineStyle: 'dashed' })
    })

    it('changing Type calls updateElement with { elementTypeId } only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: /type/i }))
      fireEvent.change(screen.getByLabelText('Type'), { target: { value: '7' } })
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { elementTypeId: 7 })
    })

    it('changing the arrow end calls updateConnection with { markerEnd } only', async () => {
      mockSel.connectionId = 5
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      fireEvent.change(screen.getByLabelText('Arrow end'), { target: { value: 'arrow' } })
      expect(mockUpdateConnection).toHaveBeenCalledWith(5, { markerEnd: 'arrow' })
    })

    it('closes the Style popover on an outside click', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      await userEvent.click(screen.getByTestId('react-flow'))
      expect(screen.queryByLabelText('Border')).not.toBeInTheDocument()
    })

    it('closes the Style popover on Escape', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByLabelText('Border')).not.toBeInTheDocument()
    })

    it('survives Escape from the colour input — it is an HTMLInputElement (the carve-out)', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(style())
      fireEvent.keyDown(screen.getByLabelText('Border'), { key: 'Escape' })
      expect(screen.getByLabelText('Border')).toBeInTheDocument()
    })

    it('offers Fill swatches and a Fill picker when an object is selected', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      expect(screen.getByLabelText('Fill')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fill Teal' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Border Teal' })).toBeInTheDocument()
    })

    it('clicking a Fill swatch calls updateElement with that hex only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Fill Teal' }))
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { fillColor: '#e3f3f1' })
    })

    it('clicking the Fill clear chip calls updateElement with null, not white', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Fill None' }))
      // null, so a later type-inherited colour (B1) can still win. '#ffffff' would block it forever.
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { fillColor: null })
    })

    it('clicking a Border swatch calls updateElement with { color } only', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      await userEvent.click(screen.getByRole('button', { name: 'Border Teal' }))
      expect(mockUpdateElement).toHaveBeenCalledWith(100, { color: '#0f766e' })
    })

    it('shows NAVY in the border picker for an uncoloured object, matching what the block renders', async () => {
      mockSel.elementId = 100
      render(<ArchitectureCanvas />)
      await userEvent.click(screen.getByRole('button', { name: 'Style ▾' }))
      // BlockNode renders `d.color ?? NAVY`; the picker must not claim white.
      expect(screen.getByLabelText('Border')).toHaveValue('#1a365d')
    })
  })
})
