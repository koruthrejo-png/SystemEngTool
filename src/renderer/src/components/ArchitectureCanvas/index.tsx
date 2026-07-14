import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Panel, ReactFlowProvider,
  useNodesState, useEdgesState, useReactFlow, useViewport, ConnectionMode,
  type Node, type Edge, type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import BlockNode from './BlockNode'
import EdgeLabel from './EdgeLabel'
import { Button } from '../ui'
import { buildNodes, resolveDrop, fitChildInParent, withHiddenCascade } from './nodes'
import LayerPanel from './LayerPanel'
import { effectiveVisibility, resolveConnectorVisibility, type Visibility } from './layers'
import { edgeMarker } from './edgeStyle'
import { shouldDeleteConnection } from './deleteKey'

const nodeTypes = { block: BlockNode }
const edgeTypes = { labeled: EdgeLabel }

// Industrial-precision zoom/fit controls (design backlog item 17) replacing default RF chrome.
function CanvasControls(): JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const btn = 'p-1.5 rounded hover:bg-workspace text-ink-muted leading-none text-base'
  return (
    <Panel position="bottom-left" className="flex flex-col gap-2">
      <div className="bg-white/90 backdrop-blur border border-line rounded-lg p-1 flex flex-col items-stretch shadow-md">
        <button className={btn} onClick={() => zoomIn()} aria-label="Zoom in" title="Zoom in">+</button>
        <div className="h-px bg-line mx-1 my-0.5" />
        <div className="px-1 py-0.5 text-center text-ink font-mono text-xs font-bold tabular-nums">
          {Math.round(zoom * 100)}%
        </div>
        <div className="h-px bg-line mx-1 my-0.5" />
        <button className={btn} onClick={() => zoomOut()} aria-label="Zoom out" title="Zoom out">−</button>
      </div>
      <button
        className="bg-white/90 backdrop-blur border border-line rounded-lg p-1.5 shadow-md hover:bg-workspace text-ink-muted flex items-center justify-center"
        onClick={() => fitView()}
        aria-label="Fit view"
        title="Fit view"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        </svg>
      </button>
    </Panel>
  )
}

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
    project, elements, connections, elementTypes, selectedElementId, selectedConnectionId,
    layers, elementLayers, connectionLayers,
    addElement, updateElement, removeElement, addConnection, removeConnection,
    selectElement, selectConnection, undo, redo, undoStack, redoStack
  } = useStore()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { getInternalNode } = useReactFlow()

  const layersById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers])

  const visById = useMemo(() => {
    const memberIds = new Map<number, number[]>()
    for (const { elementId, layerId } of elementLayers) {
      const arr = memberIds.get(elementId) ?? []; arr.push(layerId); memberIds.set(elementId, arr)
    }
    const own = new Map<number, Visibility>(elements.map((e) => [e.id, effectiveVisibility(memberIds.get(e.id) ?? [], layersById)]))
    return withHiddenCascade(elements, own)
  }, [elements, elementLayers, layersById])

  useEffect(() => {
    setNodes(buildNodes(elements, elementTypes, connections, selectedElementId, (id, x, y, width, height) => {
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
    }, visById))
  }, [elements, elementTypes, connections, selectedElementId, visById])

  useEffect(() => {
    const connMemberIds = new Map<number, number[]>()
    for (const { connectionId, layerId } of connectionLayers) {
      const arr = connMemberIds.get(connectionId) ?? []; arr.push(layerId); connMemberIds.set(connectionId, arr)
    }
    setEdges(
      connections.map((c) => {
        const own = effectiveVisibility(connMemberIds.get(c.id) ?? [], layersById)
        const vis = resolveConnectorVisibility(own, visById.get(c.sourceId) ?? 'normal', visById.get(c.targetId) ?? 'normal')
        const strokeColor = c.id === selectedConnectionId ? '#42682d' : '#94a3b8'
        return {
          id: String(c.id),
          source: String(c.sourceId),
          target: String(c.targetId),
          sourceHandle: c.sourceHandle ?? 'right',
          targetHandle: c.targetHandle ?? 'left',
          type: 'labeled' as const,
          markerStart: edgeMarker(c.markerStart, strokeColor),
          markerEnd: edgeMarker(c.markerEnd, strokeColor),
          data: { label: c.name ?? '', faded: vis === 'faded', lineStyle: c.lineStyle ?? null },
          selected: c.id === selectedConnectionId,
          hidden: vis === 'hidden'
        }
      })
    )
  }, [connections, selectedConnectionId, connectionLayers, layersById, visById])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat) return

      // Delete / Backspace → remove the selected connection (connections only; never a block)
      if (shouldDeleteConnection(e, useStore.getState().selectedConnectionId)) {
        e.preventDefault()
        void removeConnection(useStore.getState().selectedConnectionId as number)
        return
      }

      // Cmd/Ctrl+Z undo/redo
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, removeConnection])

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
    addElement({
      projectId: project.id,
      elementTypeId: null,
      posX: 100 + Math.random() * 200,
      posY: 100 + Math.random() * 200
    })
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

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center gap-2 px-4 h-12 bg-white border-b border-line shrink-0">
          <Button onClick={handleAddBlock}>+ Object</Button>
          <div className="w-px h-5 bg-line" />
          <div className="flex items-center gap-1">
            <button
              onClick={() => void undo()}
              disabled={undoStack.length === 0}
              aria-label="Undo"
              title="Undo (Cmd/Ctrl+Z)"
              className="p-1.5 rounded hover:bg-workspace text-ink-muted leading-none text-base disabled:opacity-40 disabled:hover:bg-transparent"
            >↶</button>
            <button
              onClick={() => void redo()}
              disabled={redoStack.length === 0}
              aria-label="Redo"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              className="p-1.5 rounded hover:bg-workspace text-ink-muted leading-none text-base disabled:opacity-40 disabled:hover:bg-transparent"
            >↷</button>
          </div>
          <span className="ml-auto text-xs text-ink-faint">Drag from a block's edge to connect</span>
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
            deleteKeyCode="Delete"
            connectionMode={ConnectionMode.Loose}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="#cbd5e1" bgColor="#f8fafc" />
            <CanvasControls />
            <Panel position="top-right"><LayerPanel /></Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
