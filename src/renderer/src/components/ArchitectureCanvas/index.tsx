import { useCallback, useEffect } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, ReactFlowProvider,
  useNodesState, useEdgesState, useReactFlow, ConnectionMode,
  type Node, type Edge, type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import BlockNode from './BlockNode'
import EdgeLabel from './EdgeLabel'
import { Button } from '../ui'
import { buildNodes, resolveDrop, fitChildInParent } from './nodes'

const nodeTypes = { block: BlockNode }
const edgeTypes = { labeled: EdgeLabel }

export default function ArchitectureCanvas(): JSX.Element {
  const { project } = useStore()

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-faint text-sm">
        Open or create a project to start building your architecture.
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}

function CanvasInner(): JSX.Element {
  const {
    project, elements, connections, selectedElementId, selectedConnectionId,
    addElement, updateElement, removeElement, addConnection, removeConnection,
    selectElement, selectConnection
  } = useStore()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { getInternalNode } = useReactFlow()

  useEffect(() => {
    setNodes(buildNodes(elements, selectedElementId, (id, x, y, width, height) => {
      const el = elements.find((e) => e.id === id)
      const parent = el?.parentId != null ? elements.find((e) => e.id === el.parentId) : undefined
      if (parent) {
        // resized inside a container: keep the child snug, grow the parent if needed
        const fit = fitChildInParent(parent, { posX: x, posY: y, width, height })
        updateElement(id, { posX: fit.childX, posY: fit.childY, width, height })
        if (fit.parentWidth !== parent.width || fit.parentHeight !== parent.height) {
          updateElement(parent.id, { width: fit.parentWidth, height: fit.parentHeight })
        }
        return
      }
      updateElement(id, { posX: x, posY: y, width, height })
    }))
  }, [elements, selectedElementId])

  useEffect(() => {
    setEdges(
      connections.map((c) => ({
        id: String(c.id),
        source: String(c.sourceId),
        target: String(c.targetId),
        sourceHandle: c.sourceHandle ?? 'right',
        targetHandle: c.targetHandle ?? 'left',
        type: 'labeled' as const,
        data: { label: c.name ?? '' },
        selected: c.id === selectedConnectionId
      }))
    )
  }, [connections, selectedConnectionId])

  const onConnect = useCallback((params: Connection) => {
    if (!project) return
    addConnection({
      projectId: project.id,
      sourceId: Number(params.source),
      targetId: Number(params.target),
      sourceHandle: params.sourceHandle ?? null,
      targetHandle: params.targetHandle ?? null
    })
    // edges are re-derived from store via useEffect — no manual setEdges needed
  }, [project, addConnection])

  function handleAddBlock(): void {
    if (!project) return
    addElement({ projectId: project.id, posX: 100 + Math.random() * 200, posY: 100 + Math.random() * 200 })
  }

  function onNodeClick(_: React.MouseEvent, node: Node): void {
    selectElement(Number(node.id))
  }

  function onEdgeClick(_: React.MouseEvent, edge: Edge): void {
    selectConnection(Number(edge.id))
  }

  function onPaneClick(): void {
    selectElement(null)
    selectConnection(null)
  }

  function onNodeDragStop(_: unknown, node: Node): void {
    const abs = getInternalNode(node.id)?.internals.positionAbsolute ?? node.position
    const id = Number(node.id)
    const el = elements.find((e) => e.id === id)
    const drop = resolveDrop(id, abs, elements)
    if (el && drop.parentId !== null) {
      // nesting (or moving within a container): snug-fit the child, grow the parent if needed
      const parent = elements.find((e) => e.id === drop.parentId)!
      const fit = fitChildInParent(parent, { posX: drop.posX, posY: drop.posY, width: el.width, height: el.height })
      updateElement(id, { parentId: drop.parentId, posX: fit.childX, posY: fit.childY })
      if (fit.parentWidth !== parent.width || fit.parentHeight !== parent.height) {
        updateElement(parent.id, { width: fit.parentWidth, height: fit.parentHeight })
      }
    } else if (el && drop.parentId !== el.parentId) {
      updateElement(id, drop)
    } else {
      updateElement(id, { posX: node.position.x, posY: node.position.y })
    }
  }

  function onNodesDelete(deleted: Node[]): void {
    deleted.forEach((n) => removeElement(Number(n.id)))
  }

  function onEdgesDelete(deleted: Edge[]): void {
    deleted.forEach((e) => removeConnection(Number(e.id)))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-line shrink-0">
        <Button onClick={handleAddBlock}>+ Object</Button>
        <span className="text-xs text-ink-faint">Drag from a block's edge to connect</span>
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode="Delete"
          connectionMode={ConnectionMode.Loose}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="#cbd5e1" bgColor="#f8fafc" />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
