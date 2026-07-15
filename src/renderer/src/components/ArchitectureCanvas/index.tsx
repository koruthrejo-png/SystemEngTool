import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Panel, ReactFlowProvider,
  useNodesState, useEdgesState, useReactFlow, useViewport, ConnectionMode,
  type Node, type Edge, type Connection
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../store'
import BlockNode from './BlockNode'
import EdgeLabel from './EdgeLabel'
import { Button, Select, SectionLabel } from '../ui'
import type { ArchitectureElement, ArchitectureConnection, LineStyle, EdgeMarker } from '../../../../types'
import {
  buildNodes, resolveDrop, fitChildInParent, withHiddenCascade,
  nestBaseline, revertToBaseline, clearBaselineOnManualResize
} from './nodes'
import LayerPanel from './LayerPanel'
import { effectiveVisibility, resolveConnectorVisibility, type Visibility } from './layers'
import { edgeMarker, EDGE_STROKE, EDGE_STROKE_SELECTED } from './edgeStyle'
import { shouldDeleteConnection, isTyping } from './deleteKey'
import { barMode } from './barMode'
import { SWATCHES, NAVY } from './swatches'

const nodeTypes = { block: BlockNode }
const edgeTypes = { labeled: EdgeLabel }

// Matches the Background dot gap below, so snapped objects land on visible dots.
const SNAP_GRID: [number, number] = [16, 16]
// Enough that the copy reads as a separate object rather than a render glitch.
const DUPLICATE_OFFSET = 20

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

// Top-bar dropdown: trigger, anchor and dismiss rules, nothing else. Grown out of the Layers
// menu (item 25) when Style/Type needed the same shell — one dismiss rule for every popover.
function Menu({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent): void {
      if (!ref.current?.contains(e.target as globalThis.Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      // ponytail: LayerPanel's add/rename inputs own Escape (cancel edit) — let them keep it.
      // Style's <input type="color"> is an HTMLInputElement too, and falls under the same carve-out.
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="whitespace-nowrap">{label}</Button>
      {open && <div className="absolute top-full left-0 mt-1 z-20">{children}</div>}
    </div>
  )
}

// Popover card. LayerPanel paints its own, so this is only for the Style/Type contents.
function MenuCard({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="bg-white/95 backdrop-blur border border-line rounded-lg shadow-md w-52 p-3 space-y-3">
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <SectionLabel className="block">{label}</SectionLabel>
      {children}
    </div>
  )
}

const LINE_STYLES = (
  <>
    <option value="solid">Solid</option>
    <option value="dashed">Dashed</option>
    <option value="dotted">Dotted</option>
  </>
)

const MARKERS = (
  <>
    <option value="none">None</option>
    <option value="arrow">Open</option>
    <option value="arrowclosed">Filled</option>
  </>
)

// One row of preset chips. `shade` picks which column of the paired palette to show:
// dark shades sit under the header's white text, pale ones under the body's dark text.
// Deliberately not selection-aware — the native picker below already reports the current
// colour, and it can hold a hex no chip has.
function Swatches({ shade, label, clearable, onPick }: {
  shade: 'border' | 'fill'
  label: string
  clearable?: boolean
  onPick: (hex: string | null) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1 mb-1">
      {clearable && (
        <button
          type="button"
          aria-label={`${label} None`}
          title="None"
          onClick={() => onPick(null)}
          className="h-5 w-5 rounded border border-line text-[10px] leading-none text-ink-faint hover:border-ink-faint"
        >
          ✕
        </button>
      )}
      {SWATCHES.map((s) => (
        <button
          key={s.name}
          type="button"
          aria-label={`${label} ${s.name}`}
          title={s.name}
          onClick={() => onPick(s[shade])}
          style={{ background: s[shade] }}
          className="h-5 w-5 rounded border border-line hover:border-ink-faint"
        />
      ))}
    </div>
  )
}

// Contextual segment: object styling. Writes on change — no local state, no onBlur.
function ObjectStyleMenu({ el }: { el: ArchitectureElement }): JSX.Element {
  const { updateElement } = useStore()
  return (
    <Menu label="Style ▾">
      <MenuCard>
        <Field label="Border">
          <Swatches shade="border" label="Border" onPick={(c) => updateElement(el.id, { color: c })} />
          <input
            type="color"
            aria-label="Border"
            value={el.color ?? NAVY}
            onChange={(e) => updateElement(el.id, { color: e.target.value })}
            className="h-9 w-full rounded border border-line cursor-pointer"
          />
        </Field>
        <Field label="Fill">
          <Swatches shade="fill" label="Fill" clearable onPick={(c) => updateElement(el.id, { fillColor: c })} />
          <input
            type="color"
            aria-label="Fill"
            value={el.fillColor ?? '#ffffff'}
            onChange={(e) => updateElement(el.id, { fillColor: e.target.value })}
            className="h-9 w-full rounded border border-line cursor-pointer"
          />
        </Field>
        <Field label="Line style">
          <Select
            aria-label="Line style"
            value={el.lineStyle ?? 'solid'}
            onChange={(e) => updateElement(el.id, { lineStyle: e.target.value as LineStyle })}
          >{LINE_STYLES}</Select>
        </Field>
      </MenuCard>
    </Menu>
  )
}

function TypeMenu({ el }: { el: ArchitectureElement }): JSX.Element {
  const { elementTypes, updateElement } = useStore()
  return (
    <Menu label="Type ▾">
      <MenuCard>
        <Field label="Type">
          <Select
            aria-label="Type"
            value={el.elementTypeId ?? ''}
            onChange={(e) => updateElement(el.id, { elementTypeId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">— None —</option>
            {elementTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </MenuCard>
    </Menu>
  )
}

function ConnectionStyleMenu({ conn }: { conn: ArchitectureConnection }): JSX.Element {
  const { updateConnection } = useStore()
  return (
    <Menu label="Style ▾">
      <MenuCard>
        <Field label="Line style">
          <Select
            aria-label="Line style"
            value={conn.lineStyle ?? 'solid'}
            onChange={(e) => updateConnection(conn.id, { lineStyle: e.target.value as LineStyle })}
          >{LINE_STYLES}</Select>
        </Field>
        <Field label="Arrow start">
          <Select
            aria-label="Arrow start"
            value={conn.markerStart ?? 'none'}
            onChange={(e) => updateConnection(conn.id, { markerStart: e.target.value as EdgeMarker })}
          >{MARKERS}</Select>
        </Field>
        <Field label="Arrow end">
          <Select
            aria-label="Arrow end"
            value={conn.markerEnd ?? 'none'}
            onChange={(e) => updateConnection(conn.id, { markerEnd: e.target.value as EdgeMarker })}
          >{MARKERS}</Select>
        </Field>
      </MenuCard>
    </Menu>
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

  // ponytail: session-only. Snap is a canvas view mode, not element data — if it should
  // survive a relaunch it is a view preference, not a column.
  const [snapToGrid, setSnapToGrid] = useState(false)

  const mode = barMode(selectedElementId, selectedConnectionId)
  const selectedEl = mode === 'object' ? elements.find((e) => e.id === selectedElementId) ?? null : null
  const selectedConn = mode === 'connection' ? connections.find((c) => c.id === selectedConnectionId) ?? null : null

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
      const cleared = clearBaselineOnManualResize(elements.filter((c) => c.parentId === id).length)
      if (parent) {
        // resized inside a container: keep the child snug, grow the parent if needed
        const fit = fitChildInParent(parent, { posX: x, posY: y, width, height })
        updateElement(id, { posX: fit.childX, posY: fit.childY, width, height, ...cleared })
        if (fit.parentWidth !== parent.width || fit.parentHeight !== parent.height) {
          updateElement(parent.id, { width: fit.parentWidth, height: fit.parentHeight })
        }
        return
      }
      updateElement(id, { posX: x, posY: y, width, height, ...cleared })
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
        const strokeColor = c.id === selectedConnectionId ? EDGE_STROKE_SELECTED : EDGE_STROKE
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

      // Delete / Backspace → remove the selected connection. Blocks are deleted by React
      // Flow's own deleteKeyCode="Delete" + onNodesDelete, which is why this predicate only
      // covers connections. (Asymmetry that follows: Backspace removes a connection but not
      // a block.)
      if (shouldDeleteConnection(e, useStore.getState().selectedConnectionId)) {
        e.preventDefault()
        void removeConnection(useStore.getState().selectedConnectionId as number)
        return
      }

      if (!(e.metaKey || e.ctrlKey)) return
      if (isTyping(e)) return
      const key = e.key.toLowerCase()

      // Cmd/Ctrl+D → duplicate the selected object, offset so the copy is visibly separate.
      // One addElement call carries the whole copy, so it costs exactly one undo entry.
      // The new object gets a freshly minted blockId server-side — a duplicate, not a clone.
      if (key === 'd') {
        const { selectedElementId, elements, project } = useStore.getState()
        const src = elements.find((el) => el.id === selectedElementId)
        if (!src || !project) return
        e.preventDefault()
        void addElement({
          projectId: project.id,
          parentId: src.parentId,
          name: src.name,
          elementTypeId: src.elementTypeId,
          description: src.description,
          color: src.color,
          fillColor: src.fillColor,
          lineStyle: src.lineStyle,
          width: src.width,
          height: src.height,
          posX: src.posX + DUPLICATE_OFFSET,
          posY: src.posY + DUPLICATE_OFFSET
        })
        return
      }

      // Cmd/Ctrl+Z undo/redo
      if (key !== 'z') return
      e.preventDefault()
      if (e.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, removeConnection, addElement])

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
      // record the pre-drop size before the fit grows the parent (first child only)
      const baseline = nestBaseline(parent, elements.filter((c) => c.parentId === parent.id).length)
      updateElement(id, { parentId: drop.parentId, posX: fit.childX, posY: fit.childY })
      if (baseline || fit.parentWidth !== parent.width || fit.parentHeight !== parent.height) {
        updateElement(parent.id, { width: fit.parentWidth, height: fit.parentHeight, ...baseline })
      }
    } else if (el && drop.parentId !== el.parentId) {
      updateElement(id, drop)
      // dragged out to root: revert the old parent if that was its last child
      const oldParent = elements.find((e) => e.id === el.parentId)
      const revert = oldParent && revertToBaseline(oldParent, elements.filter((c) => c.parentId === oldParent.id && c.id !== id).length)
      if (oldParent && revert) updateElement(oldParent.id, revert)
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
        <div className="relative z-10 flex items-center gap-2 px-4 h-12 bg-white border-b border-line shrink-0">
          <Button onClick={handleAddBlock} className="shrink-0 whitespace-nowrap">+ Object</Button>
          <Menu label="Layers ▾"><LayerPanel /></Menu>
          {/* Global segment: snap is a canvas mode, not a selection attribute, so it lives
              here beside Layers rather than in the contextual segment. */}
          <button
            onClick={() => setSnapToGrid((v) => !v)}
            aria-pressed={snapToGrid}
            title="Snap objects to the grid"
            className={`shrink-0 whitespace-nowrap px-2 py-1 rounded text-sm ${
              snapToGrid ? 'bg-action-tint text-action' : 'text-ink-muted hover:bg-workspace'
            }`}
          >Snap</button>
          <div className="w-px h-5 bg-line shrink-0" />
          <div className="flex items-center gap-1 shrink-0">
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
          {/* Contextual segment. Collapses when nothing is selected — the global segment is
              left-anchored and the hint is ml-auto right-anchored, so it grows in the slack
              between two pinned ends and moves nothing that was already on screen. */}
          {selectedEl && (
            <>
              <ObjectStyleMenu el={selectedEl} />
              <TypeMenu el={selectedEl} />
            </>
          )}
          {selectedConn && <ConnectionStyleMenu conn={selectedConn} />}
          {/* ponytail: the hint is the only thing here allowed to shrink. Selecting an object both
              adds the contextual menus AND opens the ~380px Properties drawer, so this row loses
              width on the same click it gains controls — without this the controls wrapped inside
              h-12. Hint truncates first; if the bar still overflows, drop Type per spec §5.3. */}
          <span className="ml-auto min-w-0 truncate text-xs text-ink-faint">Drag from a block&apos;s edge to connect</span>
        </div>
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            snapToGrid={snapToGrid}
            snapGrid={SNAP_GRID}
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
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
