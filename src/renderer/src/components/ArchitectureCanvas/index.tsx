import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, ReactFlowProvider,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import BlockNode, { type BlockNodeData } from './BlockNode'
import EdgeLabel from './EdgeLabel'

const nodeTypes = { block: BlockNode }
const edgeTypes = { labeled: EdgeLabel }

function elementToNode(el: import('../../../../../types').ArchitectureElement, selectedId: number | null): Node {
  return {
    id: String(el.id),
    type: 'block',
    position: { x: el.posX, y: el.posY },
    ...(el.parentId ? { parentId: String(el.parentId), extent: 'parent' as const } : {}),
    data: { label: el.name, blockId: el.blockId, color: el.color, selected: el.id === selectedId } satisfies BlockNodeData,
    style: { width: el.width, height: el.height }
  }
}

export default function ArchitectureCanvas(): JSX.Element {
  const {
    project, elements, connections, selectedElementId, selectedConnectionId,
    addElement, updateElement, removeElement, addConnection, removeConnection,
    selectElement, selectConnection
  } = useStore()

  const [nodes, setNodes, onNodesChange] = useNodesState(
    elements.map((el) => elementToNode(el, selectedElementId))
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    connections.map((c) => ({
      id: String(c.id),
      source: String(c.sourceId),
      target: String(c.targetId),
      type: 'labeled',
      data: { label: c.name ?? '' },
      selected: c.id === selectedConnectionId
    } satisfies Edge))
  )

  const [connectMode, setConnectMode] = useState(false)

  const onConnect = useCallback((params: Connection) => {
    if (!project) return
    addConnection({
      projectId: project.id,
      sourceId: Number(params.source),
      targetId: Number(params.target)
    })
    setEdges((eds) => addEdge(params, eds))
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

  function onNodeDragStop(_: React.MouseEvent, node: Node): void {
    updateElement(Number(node.id), { posX: node.position.x, posY: node.position.y })
  }

  function onNodesDelete(deleted: Node[]): void {
    deleted.forEach((n) => removeElement(Number(n.id)))
  }

  function onEdgesDelete(deleted: Edge[]): void {
    deleted.forEach((e) => removeConnection(Number(e.id)))
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={handleAddBlock}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            + Block
          </button>
          <button
            onClick={() => setConnectMode((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded border transition-colors
              ${connectMode ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            {connectMode ? 'Connecting…' : '+ Connect'}
          </button>
          {connectMode && (
            <span className="text-xs text-gray-400">Drag from a block handle to another block</span>
          )}
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
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
