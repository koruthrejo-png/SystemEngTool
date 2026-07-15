import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('../../store', () => {
  // lazy: the factory is hoisted above the mock* consts, so build the state per call
  const state = () => ({
    project: { id: 1, name: 'Test', elemIdPrefix: 'SYS', elemIdPadding: 3, elemNextCounter: 1, connIdPrefix: 'ICN', connIdPadding: 4, connNextCounter: 1, createdAt: '', updatedAt: '' },
    elements: [],
    connections: [],
    elementTypes: [],
    selectedElementId: null,
    selectedConnectionId: null,
    layers: [],
    elementLayers: [],
    connectionLayers: [],
    addElement: mockAddElement,
    updateElement: vi.fn(),
    removeElement: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
    selectElement: mockSelectElement,
    selectConnection: mockSelectConnection,
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
})
