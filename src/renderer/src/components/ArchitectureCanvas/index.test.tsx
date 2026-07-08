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

vi.mock('../../store', () => ({
  useStore: () => ({
    project: { id: 1, name: 'Test', elemIdPrefix: 'SYS', elemIdPadding: 3, elemNextCounter: 1, connIdPrefix: 'ICN', connIdPadding: 4, connNextCounter: 1, createdAt: '', updatedAt: '' },
    elements: [],
    connections: [],
    elementTypes: [],
    selectedElementId: null,
    selectedConnectionId: null,
    addElement: mockAddElement,
    updateElement: vi.fn(),
    removeElement: vi.fn(),
    addConnection: vi.fn(),
    removeConnection: vi.fn(),
    selectElement: mockSelectElement,
    selectConnection: mockSelectConnection
  })
}))

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
    expect(mockAddElement).toHaveBeenCalledWith({ projectId: 1, posX: expect.any(Number), posY: expect.any(Number) })
  })

  it('renders connection mode toggle button', () => {
    render(<ArchitectureCanvas />)
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
  })
})
