# UI Overhaul (Industrial Precision) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire app (shell, Requirements view, Architecture view) to the "Industrial Precision" design from Stitch, without changing any behavior, store, IPC, or DB code.

**Architecture:** Three layers: (1) design tokens — Tailwind theme extension + locally bundled fonts, (2) shared UI primitives in `src/renderer/src/components/ui/`, (3) component-by-component restyle consuming the tokens and primitives. Spec: `docs/superpowers/specs/2026-07-02-ui-overhaul-design.md`. Visual references (mockup PNGs + Stitch HTML): `docs/superpowers/specs/assets/2026-07-02-ui/`.

**Tech Stack:** Electron 31, React 18, Tailwind CSS 3, TypeScript, electron-vite, vitest + @testing-library/react

## Global Constraints

- **Presentation only:** no changes to `src/main/**`, `src/preload/**`, `src/types/**`, or `src/renderer/src/store/**`
- No new npm dependencies; fonts are bundled as woff2 files, not CDN links (CSP is `default-src 'self'`)
- Tailwind only — no inline styles except where already present for dynamic values (tree indent, node colors, React Flow)
- Keep every `data-testid` attribute that exists today
- Keep save-on-blur behavior everywhere; no "Save Changes" buttons
- `node`/`npx` are NOT on PATH. Every shell session must first run:
  `export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"`
- Typecheck command: `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false` (expected: no output)
- Renderer test command: `node_modules/.bin/vitest run <file>` — some renderer tests fail pre-existing (stale ArchitectureCanvas tests; main-process tests fail on NODE_MODULE_VERSION under plain node). The rule is **no NEW failures** vs the baseline captured in Task 1.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/renderer/src/assets/fonts/*.woff2` | Create | Inter 400/500/600/700, JetBrains Mono 400/500 |
| `src/renderer/src/assets/main.css` | Modify | @font-face declarations + base styles |
| `tailwind.config.js` | Modify | Semantic color tokens + font families |
| `src/renderer/src/components/ui/index.tsx` | Create | Button, Input, Textarea, Select, SectionLabel, Panel |
| `src/renderer/src/components/ui/index.test.tsx` | Create | Primitive render tests |
| `src/renderer/src/App.tsx` | Modify | Navy shell bar, tabs, modal, panel wrappers |
| `src/renderer/src/components/ModuleTree/index.tsx` | Modify | Project Explorer styling |
| `src/renderer/src/components/ModuleTree/ModuleNode.tsx` | Modify | Tree row styling (green active) |
| `src/renderer/src/components/ModuleTree/NewModuleForm.tsx` | Modify | Form uses primitives |
| `src/renderer/src/components/RequirementsList/index.tsx` | Modify | Toolbar + zebra table |
| `src/renderer/src/components/RequirementDetail/index.tsx` | Modify | Details drawer styling |
| `src/renderer/src/components/ArchitectureCanvas/index.tsx` | Modify | Toolbar + dot-grid background |
| `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx` | Modify | Header-strip node design |
| `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx` | Modify | Edge colors from palette |
| `src/renderer/src/components/ElementPanel/index.tsx` | Modify | Properties panel styling |
| `src/renderer/src/components/ConnectionPanel/index.tsx` | Modify | Properties panel styling |

Design tokens (from `docs/superpowers/specs/assets/2026-07-02-ui/design-system.md`):
navy `#1a365d` / deep `#002045`, action green `#42682d` (hover `#365424`, tint `#dcefc8`), workspace `#f8fafc`, border `#e2e8f0`, ink `#0b1c30` / muted `#43474e` / faint `#64748b`, error `#ba1a1a`.

---

## Task 1: Fonts, Tailwind Tokens, Test Baseline

**Files:**
- Create: `src/renderer/src/assets/fonts/` (6 woff2 files)
- Modify: `src/renderer/src/assets/main.css`
- Modify: `tailwind.config.js`

**Interfaces:**
- Produces: Tailwind classes used by all later tasks — `bg-navy`, `bg-navy-deep`, `bg-action`, `hover:bg-action-hover`, `bg-action-tint`, `bg-workspace`, `border-line`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-error`, `font-sans` (Inter), `font-mono` (JetBrains Mono)

- [ ] **Step 1: Capture renderer test baseline**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
cd /Users/rejopckoruth/Documents/ReqArch2
node_modules/.bin/vitest run 2>&1 | tail -5 > /tmp/vitest-baseline.txt
cat /tmp/vitest-baseline.txt
```

Record the failed/passed counts. Later tasks must not increase failures.

- [ ] **Step 2: Download fonts**

```bash
mkdir -p src/renderer/src/assets/fonts && cd src/renderer/src/assets/fonts
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2" -o inter-400.woff2
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.woff2" -o inter-500.woff2
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.woff2" -o inter-600.woff2
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff2" -o inter-700.woff2
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.woff2" -o jetbrains-mono-400.woff2
curl -sL "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-500-normal.woff2" -o jetbrains-mono-500.woff2
file *.woff2
cd /Users/rejopckoruth/Documents/ReqArch2
```

Expected: `file` reports each as `Web Open Font Format (Version 2)`. If any file is HTML (CDN error), stop and report.

- [ ] **Step 3: Replace `src/renderer/src/assets/main.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/inter-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/inter-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./fonts/inter-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('./fonts/inter-700.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-400.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-500.woff2') format('woff2');
}

@layer base {
  html {
    @apply font-sans text-ink antialiased;
  }
}
```

- [ ] **Step 4: Replace `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1a365d', deep: '#002045' },
        action: { DEFAULT: '#42682d', hover: '#365424', tint: '#dcefc8' },
        workspace: '#f8fafc',
        line: '#e2e8f0',
        ink: { DEFAULT: '#0b1c30', muted: '#43474e', faint: '#64748b' },
        error: '#ba1a1a'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace']
      }
    }
  },
  plugins: []
}
```

- [ ] **Step 5: Verify build emits fonts**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
./node_modules/.bin/electron-vite build 2>&1 | tail -8 && ls out/renderer/assets/ | grep -c woff2
```

Expected: successful build; `6` woff2 assets.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/assets tailwind.config.js
git commit -m "feat(ui): design tokens + locally bundled Inter/JetBrains Mono"
```

---

## Task 2: UI Primitives

**Files:**
- Create: `src/renderer/src/components/ui/index.tsx`
- Test: `src/renderer/src/components/ui/index.test.tsx`

**Interfaces:**
- Consumes: Tailwind tokens from Task 1
- Produces (used by Tasks 3–8):
  - `Button({ variant?: 'primary' | 'secondary' | 'secondary-on-navy' | 'ghost' | 'danger-ghost', ...buttonProps })` — defaults `variant='primary'`
  - `Input(props: React.InputHTMLAttributes<HTMLInputElement> & { ref? })` — forwardRef
  - `Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>)`
  - `Select(props: React.SelectHTMLAttributes<HTMLSelectElement>)`
  - `SectionLabel({ children, className? })` — label-caps text
  - `Panel({ children, className?, 'data-testid'? })` — white bordered surface

- [ ] **Step 1: Write the failing test `src/renderer/src/components/ui/index.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, Input, SectionLabel } from './index'

describe('ui primitives', () => {
  it('Button defaults to primary variant (solid green)', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toContain('bg-action')
    expect(btn.className).toContain('text-white')
  })

  it('Button secondary variant is ghost with navy border', () => {
    render(<Button variant="secondary">Open</Button>)
    const btn = screen.getByRole('button', { name: 'Open' })
    expect(btn.className).toContain('border-navy')
    expect(btn.className).toContain('text-navy')
  })

  it('Input renders with focus ring classes', () => {
    render(<Input placeholder="Name" />)
    expect(screen.getByPlaceholderText('Name').className).toContain('focus:ring-action')
  })

  it('SectionLabel renders label-caps text', () => {
    render(<SectionLabel>Modules</SectionLabel>)
    const el = screen.getByText('Modules')
    expect(el.className).toContain('uppercase')
    expect(el.className).toContain('text-[11px]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node_modules/.bin/vitest run src/renderer/src/components/ui/index.test.tsx
```

Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Create `src/renderer/src/components/ui/index.tsx`**

```tsx
import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'secondary-on-navy' | 'ghost' | 'danger-ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover font-medium',
  secondary: 'border border-navy text-navy hover:bg-navy/5 font-medium',
  'secondary-on-navy': 'border border-white/30 text-white hover:bg-white/10 font-medium',
  ghost: 'text-action hover:bg-action-tint/50 font-medium',
  'danger-ghost': 'text-ink-faint hover:text-error'
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps): JSX.Element {
  return (
    <button
      className={`px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const FIELD_CLASSES =
  'w-full text-sm px-3 py-2 bg-white border border-line rounded text-ink placeholder:text-ink-faint/60 focus:outline-none focus:ring-2 focus:ring-action/60 focus:border-action'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />
  }
)

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className={`${FIELD_CLASSES} resize-none ${className}`} {...props} />
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select className={`${FIELD_CLASSES} ${className}`} {...props} />
}

export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[0.05em] leading-4 text-ink-faint ${className}`}>
      {children}
    </span>
  )
}

export function Panel({
  children,
  className = '',
  ...props
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={`bg-white border-line ${className}`} {...props}>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node_modules/.bin/vitest run src/renderer/src/components/ui/index.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Typecheck and commit**

```bash
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
git add src/renderer/src/components/ui
git commit -m "feat(ui): shared primitives — Button, Input, Textarea, Select, SectionLabel, Panel"
```

---

## Task 3: App Shell

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Panel` from `./components/ui`
- Produces: shell layout all views render inside. Keeps `data-testid`s: `panel-modules`, `panel-list`, `panel-detail`, `panel-architecture`.

- [ ] **Step 1: Restyle the shell in `src/renderer/src/App.tsx`**

Keep ALL logic (state, effects, handlers) identical. Replace only the returned JSX from `return (` to the end of the component with:

```tsx
  return (
    <div className="flex flex-col h-screen bg-workspace text-ink">
      <header className="flex items-center h-14 px-4 gap-6 bg-navy shrink-0">
        <span className="font-semibold text-lg tracking-tight text-white">ReqArch Suite</span>
        <nav className="flex h-full">
          {(['requirements', 'architecture'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 h-full text-sm font-medium border-b-[3px] transition-colors
                ${activeTab === tab
                  ? 'border-action-tint text-white'
                  : 'border-transparent text-white/60 hover:text-white'}`}
            >
              {tab === 'requirements' ? 'Requirements' : 'Architecture'}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {project && <span className="text-sm text-white/50">{project.name}</span>}
          <Button variant="secondary-on-navy" onClick={handleOpen}>Open</Button>
          <Button onClick={() => setShowNewDialog(true)}>New Project</Button>
        </div>
      </header>

      {showNewDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/40">
          <div className="bg-white rounded shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-line p-6 w-80 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-ink">New Project</h2>
            <Input
              ref={inputRef}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNewProject(); if (e.key === 'Escape') { setShowNewDialog(false); setNewProjectName('') } }}
              placeholder="Project name"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowNewDialog(false); setNewProjectName('') }}>
                Cancel
              </Button>
              <Button onClick={handleNewProject} disabled={!newProjectName.trim()}>
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'requirements' ? (
        <div className="flex flex-1 overflow-hidden">
          <Panel data-testid="panel-modules" className="w-64 shrink-0 border-r overflow-y-auto">
            <ModuleTree />
          </Panel>
          <Panel data-testid="panel-list" className="flex-1 overflow-y-auto border-r">
            <RequirementsList />
          </Panel>
          <Panel data-testid="panel-detail" className="w-96 shrink-0 overflow-y-auto">
            <RequirementDetail />
          </Panel>
        </div>
      ) : (
        <div data-testid="panel-architecture" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ArchitectureCanvas />
          </div>
          {(selectedElementId !== null || selectedConnectionId !== null) && (
            <Panel className="w-96 shrink-0 border-l overflow-y-auto">
              {selectedElementId !== null ? <ElementPanel /> : <ConnectionPanel />}
            </Panel>
          )}
        </div>
      )}
    </div>
  )
```

Add the import at the top of the file:

```tsx
import { Button, Input, Panel } from './components/ui'
```

Notes: the old separate tab row div is deleted (tabs now live in the header); the detail sidebar widens from `w-80` to `w-96` and the module sidebar from `w-56` to `w-64` (spec: fix cramped panels).

- [ ] **Step 2: Typecheck + run App tests**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/vitest run src/renderer/src/App.test.tsx
```

Expected: typecheck clean. Test failures allowed ONLY if they also fail in `/tmp/vitest-baseline.txt`; if a previously passing assertion broke on a class/text you changed, update the test's selector (behavior text like "New Project" is unchanged, so this is unlikely).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.test.tsx
git commit -m "feat(ui): navy app shell with merged tabs"
```

---

## Task 4: Module Sidebar (Project Explorer)

**Files:**
- Modify: `src/renderer/src/components/ModuleTree/index.tsx`
- Modify: `src/renderer/src/components/ModuleTree/ModuleNode.tsx`
- Modify: `src/renderer/src/components/ModuleTree/NewModuleForm.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `SectionLabel` from `../ui`
- Produces: no API change; same props, same behavior (select, rename via context menu, delete, add)

- [ ] **Step 1: Replace `src/renderer/src/components/ModuleTree/index.tsx`**

```tsx
import { useState } from 'react'
import { useStore } from '../../store'
import ModuleNode from './ModuleNode'
import NewModuleForm from './NewModuleForm'
import { Button, SectionLabel } from '../ui'

export default function ModuleTree(): JSX.Element {
  const { project, modules, selectedModuleId, selectModule, addModule, updateModule, removeModule } = useStore()
  const [showForm, setShowForm] = useState(false)
  const topLevel = modules.filter((m) => m.parentId === null)

  if (!project) {
    return <div className="p-4 text-sm text-ink-faint">Open or create a project to begin.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold text-ink truncate">{project.name}</div>
      </div>
      <div className="px-4 py-2">
        <SectionLabel>Modules</SectionLabel>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {topLevel.length === 0 && (
          <div className="px-4 py-2 text-sm text-ink-faint">No modules yet.</div>
        )}
        {topLevel.map((mod) => (
          <ModuleNode key={mod.id} module={mod} allModules={modules} depth={0}
            selectedModuleId={selectedModuleId} onSelect={selectModule}
            onDelete={removeModule}
            onRename={(id, name) => updateModule(id, { name })} />
        ))}
      </div>
      {showForm ? (
        <NewModuleForm projectId={project.id} parentId={null}
          onSubmit={async (input) => { await addModule(input); setShowForm(false) }}
          onCancel={() => setShowForm(false)} />
      ) : (
        <div className="p-3 border-t border-line">
          <Button className="w-full" onClick={() => setShowForm(true)}>+ New Module</Button>
        </div>
      )}
    </div>
  )
}
```

Note: the button text changes from `+ Module` to `+ New Module` (mockup copy). If a ModuleTree test asserts on `+ Module`, update the assertion text.

- [ ] **Step 2: Restyle the row in `src/renderer/src/components/ModuleTree/ModuleNode.tsx`**

Replace the row `<div ...>` class block (keep all handlers and structure):

```tsx
      <div
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        className={`flex items-center gap-1.5 pr-2 py-1.5 mx-2 my-0.5 cursor-pointer text-sm rounded select-none transition-colors
          ${isSelected ? 'bg-action-tint text-ink font-medium' : 'hover:bg-workspace text-ink-muted'}`}
        onClick={() => onSelect(module.id)}
        onContextMenu={handleContextMenu}
      >
        <button className="w-4 shrink-0 text-ink-faint hover:text-ink-muted"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
          {children.length > 0 ? (expanded ? '▾' : '▸') : ''}
        </button>
        <svg className="w-3.5 h-3.5 shrink-0 text-ink-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M2 5.5A1.5 1.5 0 013.5 4h4.379a1.5 1.5 0 011.06.44l1.122 1.12a1.5 1.5 0 001.06.44H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" />
        </svg>
```

And restyle the rename input inside the same file:

```tsx
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="text-sm border border-action rounded px-1 py-0 w-32 focus:outline-none" />
```

The rest of the file (children mapping, form logic) stays byte-identical.

- [ ] **Step 3: Replace `src/renderer/src/components/ModuleTree/NewModuleForm.tsx` JSX**

Keep the component logic; replace the returned `<form>`:

```tsx
  return (
    <form onSubmit={handleSubmit} className="p-3 space-y-2 bg-workspace border-t border-line">
      <Input autoFocus placeholder="Module name" value={name} onChange={(e) => setName(e.target.value)} className="!py-1.5" />
      <div className="flex gap-2">
        <Input placeholder="ID prefix (e.g. SRS)" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="flex-1 !py-1.5" />
        <Input type="number" min={1} max={8} value={padding} onChange={(e) => setPadding(Number(e.target.value))}
          title="ID digit count" className="!w-16 !py-1.5" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1 !py-1.5">Add</Button>
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 !py-1.5">Cancel</Button>
      </div>
    </form>
  )
```

Add the import: `import { Button, Input } from '../ui'`

- [ ] **Step 4: Typecheck + tests + commit**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/vitest run src/renderer/src/components/ModuleTree/index.test.tsx
git add src/renderer/src/components/ModuleTree
git commit -m "feat(ui): module sidebar as Project Explorer"
```

Expected: typecheck clean; no NEW test failures vs baseline (update `+ Module` → `+ New Module` text assertions if present).

---

## Task 5: Requirements Table + Toolbar

**Files:**
- Modify: `src/renderer/src/components/RequirementsList/index.tsx`

**Interfaces:**
- Consumes: `Button`, `SectionLabel` from `../ui`; store API unchanged
- Produces: no API change. `+ Requirement` button moves from footer to toolbar and is renamed `+ New Requirement`.

- [ ] **Step 1: Replace `src/renderer/src/components/RequirementsList/index.tsx`**

```tsx
import { useStore } from '../../store'
import { Button, SectionLabel } from '../ui'

const GRID = 'grid grid-cols-[90px_1fr_1fr_120px_1fr_36px]'

export default function RequirementsList(): JSX.Element {
  const {
    selectedModuleId, modules, requirements, deletedRequirements,
    showDeleted, setShowDeleted,
    selectedRequirementId, selectRequirement,
    addRequirement, removeRequirement, restoreRequirement
  } = useStore()

  if (!selectedModuleId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Select a module to view its requirements.
      </div>
    )
  }

  const module = modules.find((m) => m.id === selectedModuleId)
  const displayed = showDeleted ? deletedRequirements : requirements

  async function handleAdd(): Promise<void> {
    await addRequirement({ moduleId: selectedModuleId!, text: '' })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-12 px-4 border-b border-line flex items-center justify-between shrink-0 bg-white">
        <span className="text-lg font-semibold tracking-tight text-ink">{module?.name ?? 'Requirements'}</span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-error"
            />
            <span className="text-xs text-ink-faint">Show deleted</span>
          </label>
          <span className="text-xs text-ink-faint">
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}
          </span>
          {!showDeleted && <Button onClick={handleAdd}>+ New Requirement</Button>}
        </div>
      </div>

      {/* Column headers */}
      <div className={`${GRID} gap-x-3 px-4 py-2 border-b border-line bg-workspace shrink-0`}>
        <SectionLabel>ID</SectionLabel>
        <SectionLabel>Requirement</SectionLabel>
        <SectionLabel>Acceptance Criteria</SectionLabel>
        <SectionLabel>Source</SectionLabel>
        <SectionLabel>Rationale</SectionLabel>
        <span />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {displayed.length === 0 && (
          <div className="p-4 text-sm text-ink-faint">
            {showDeleted ? 'No deleted requirements.' : 'No requirements yet.'}
          </div>
        )}
        {displayed.map((req, i) => (
          <div
            key={req.id}
            onClick={() => !showDeleted && selectRequirement(req.id)}
            className={[
              GRID,
              'gap-x-3 items-start px-4 py-3 border-b border-line/60 group border-l-2',
              i % 2 === 1 ? 'bg-workspace/50' : 'bg-white',
              showDeleted ? 'opacity-60 border-l-transparent' : 'cursor-pointer hover:bg-action-tint/20',
              !showDeleted && selectedRequirementId === req.id
                ? '!bg-action-tint/40 border-l-action'
                : 'border-l-transparent'
            ].join(' ')}
          >
            <span className="text-xs font-mono text-ink-faint pt-0.5 truncate">{req.reqId}</span>
            <span className="text-sm text-ink break-words pr-1">
              {req.text || <span className="text-ink-faint/50 italic">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.acceptanceCriteria || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-xs text-ink-muted truncate">
              {req.source || <span className="text-ink-faint/50">—</span>}
            </span>
            <span className="text-sm text-ink-muted break-words pr-1">
              {req.rationale || <span className="text-ink-faint/50">—</span>}
            </span>
            <div className="flex items-start justify-center pt-0.5">
              {showDeleted ? (
                <button
                  onClick={(e) => { e.stopPropagation(); restoreRequirement(req.id) }}
                  className="text-xs text-action hover:text-action-hover font-medium whitespace-nowrap"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); removeRequirement(req.id) }}
                  aria-label="Delete requirement"
                  title="Delete requirement"
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-error transition-opacity text-base leading-none"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Notes: zebra striping via `i % 2`; selection uses green left accent edge per the design system's active rule; footer removed (button now in toolbar).

- [ ] **Step 2: Typecheck + commit**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
git add src/renderer/src/components/RequirementsList/index.tsx
git commit -m "feat(ui): requirements table — toolbar, zebra rows, green selection accent"
```

---

## Task 6: Requirement Details Drawer

**Files:**
- Modify: `src/renderer/src/components/RequirementDetail/index.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Textarea`, `SectionLabel` from `../ui`
- Produces: no API change; identical behavior (blur-save, custom fields add/remove with `focusNewField` intent flag)

- [ ] **Step 1: Restyle `src/renderer/src/components/RequirementDetail/index.tsx`**

Keep ALL hooks, refs, and handlers exactly as-is (including `focusNewField`). Replace only the returned JSX (from `return (` after the `if (!req)` guard) and the `Field` helper. Also update the guard's classes and add the import.

Import to add:

```tsx
import { Button, Input, Textarea, SectionLabel } from '../ui'
```

Guard:

```tsx
  if (!req) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-ink-faint">
        Select a requirement to view details.
      </div>
    )
  }
```

Main JSX:

```tsx
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-line shrink-0">
        <div className="text-lg font-semibold tracking-tight text-ink">Requirement Details</div>
        <span className="text-xs font-mono text-ink-faint">{req.reqId}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <Field label="Requirement">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} rows={4} />
        </Field>
        <Field label="Acceptance Criteria">
          <Textarea value={ac} onChange={(e) => setAc(e.target.value)} onBlur={save} rows={3} />
        </Field>
        <Field label="Source">
          <Input value={source} onChange={(e) => setSource(e.target.value)} onBlur={save} />
        </Field>
        <Field label="Rationale">
          <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} onBlur={save} rows={3} />
        </Field>

        {/* Custom fields */}
        <div className="space-y-2 pt-2 border-t border-line">
          <SectionLabel className="block pt-2">Custom Fields</SectionLabel>
          {customFields.map((field, i) => {
            const local = localFields[field.id] ?? { key: field.key, value: field.value }
            const isNewest = i === customFields.length - 1
            return (
              <div key={field.id} className="flex gap-2 items-center">
                <Input
                  ref={isNewest ? newFieldRef : undefined}
                  value={local.key}
                  onChange={(e) => setLocalField(field.id, 'key', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { key: local.key })}
                  placeholder="Field name"
                  className="!w-2/5 !py-1.5"
                />
                <Input
                  value={local.value}
                  onChange={(e) => setLocalField(field.id, 'value', e.target.value)}
                  onBlur={() => updateCustomField(field.id, { value: local.value })}
                  placeholder="Value"
                  className="flex-1 !py-1.5"
                />
                <button
                  onClick={() => removeCustomField(field.id)}
                  className="text-ink-faint hover:text-error text-lg leading-none px-1"
                  title="Remove field"
                  aria-label="Remove field"
                >
                  ×
                </button>
              </div>
            )
          })}
          <Button variant="ghost" onClick={handleAddField} className="!px-2">+ Add Field</Button>
        </div>
      </div>
    </div>
  )
```

`Field` helper:

```tsx
function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <SectionLabel className="block">{label}</SectionLabel>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
git add src/renderer/src/components/RequirementDetail/index.tsx
git commit -m "feat(ui): requirement details drawer styling"
```

---

## Task 7: Architecture View

**Files:**
- Modify: `src/renderer/src/components/ArchitectureCanvas/index.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`
- Modify: `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`

**Interfaces:**
- Consumes: `Button` from `../ui`; `BlockNodeData` type unchanged
- Produces: no API change

- [ ] **Step 1: Replace `src/renderer/src/components/ArchitectureCanvas/BlockNode.tsx`**

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type BlockNodeData = {
  label: string
  blockId: string
  color: string | null
  selected: boolean
}

const NAVY = '#1a365d'

export default memo(function BlockNode({ data }: NodeProps) {
  const d = data as BlockNodeData
  const headerColor = d.color ?? NAVY
  return (
    <div
      style={{ borderColor: headerColor, minWidth: 140 }}
      className={`bg-white border rounded-t text-sm select-none overflow-hidden
        ${d.selected ? 'ring-2 ring-action/60' : ''}`}
    >
      <div
        style={{ background: headerColor }}
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-white"
      >
        Block
      </div>
      <div className="px-3 py-2">
        <div className="text-[11px] text-ink-faint font-mono mb-0.5">{d.blockId}</div>
        <div className="font-medium text-ink truncate">
          {d.label || <span className="text-ink-faint/50 italic">Unnamed</span>}
        </div>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-action" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-action" />
    </div>
  )
})
```

- [ ] **Step 2: Update edge colors in `src/renderer/src/components/ArchitectureCanvas/EdgeLabel.tsx`**

Change the `BaseEdge` style line to:

```tsx
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#42682d' : '#94a3b8', strokeWidth: selected ? 2 : 1.5 }} />
```

And the label div classes to:

```tsx
            className="px-1.5 py-0.5 bg-white border border-line rounded text-xs text-ink-muted shadow-sm nodrag nopan"
```

- [ ] **Step 3: Restyle toolbar + background in `src/renderer/src/components/ArchitectureCanvas/index.tsx`**

Add imports:

```tsx
import { Button } from '../ui'
```

Also add `BackgroundVariant` to the `@xyflow/react` import list:

```tsx
import {
  ReactFlow, Background, BackgroundVariant, Controls, ReactFlowProvider,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection
} from '@xyflow/react'
```

Replace the empty-state guard body:

```tsx
      <div className="flex flex-col items-center justify-center h-full text-ink-faint text-sm">
        Open or create a project to start building your architecture.
      </div>
```

Replace the toolbar div:

```tsx
        <div className="flex items-center gap-3 px-4 h-12 bg-white border-b border-line shrink-0">
          <Button onClick={handleAddBlock}>+ Block</Button>
          <span className="text-xs text-ink-faint">Drag from a block's edge to connect</span>
        </div>
```

Replace `<Background />` with:

```tsx
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="#cbd5e1" bgColor="#f8fafc" />
```

Everything else in the file is unchanged.

- [ ] **Step 4: Typecheck + tests + commit**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/vitest run src/renderer/src/components/ArchitectureCanvas/index.test.tsx
git add src/renderer/src/components/ArchitectureCanvas
git commit -m "feat(ui): architecture canvas — dot grid, header-strip nodes, palette edges"
```

Expected: typecheck clean. The ArchitectureCanvas tests fail in the baseline already (stale); no NEW failures beyond baseline.

---

## Task 8: Element & Connection Properties Panels

**Files:**
- Modify: `src/renderer/src/components/ElementPanel/index.tsx`
- Modify: `src/renderer/src/components/ConnectionPanel/index.tsx`

**Interfaces:**
- Consumes: `Input`, `Textarea`, `Select`, `SectionLabel`, `Button` from `../ui`
- Produces: no API change

- [ ] **Step 1: Restyle `src/renderer/src/components/ElementPanel/index.tsx`**

Keep all logic. Add import `import { Input, Textarea, Select, SectionLabel, Button } from '../ui'`. Replace:

- Guard div classes → `flex items-center justify-center h-full text-sm text-ink-faint`
- Header:

```tsx
      <div className="px-5 py-3 border-b border-line flex items-center justify-between shrink-0">
        <div>
          <div className="text-lg font-semibold tracking-tight text-ink">Properties</div>
          <span className="text-xs font-mono text-ink-faint">{el.blockId}</span>
        </div>
        <Button variant="danger-ghost" className="!px-1 text-xs" onClick={() => removeElement(el.id)}>Delete</Button>
      </div>
```

- Body wrapper → `flex-1 overflow-y-auto p-5 space-y-4`
- Name field → `<Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />`
- Type select → `<Select value={elementTypeId ?? ''} onChange={...same handler...}>` (same options)
- Description → `<Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3} />`
- Color input classes → `h-9 w-full rounded border border-line cursor-pointer`
- Requirements filter input → `<Input placeholder="Filter by ID or text…" value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className="!py-1.5 !text-xs mb-2" />`
- Linked requirement rows: replace the row className with

```tsx
                  className={`flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors
                    ${linked ? 'bg-action-tint/40 border-action/40 text-ink' : 'border-line hover:bg-workspace text-ink-muted'}`}
```

- "No requirements match." div → `text-ink-faint text-xs px-2`
- `Field` helper: replace label with `<SectionLabel className="block">{label}</SectionLabel>` and wrapper `space-y-1.5`

- [ ] **Step 2: Restyle `src/renderer/src/components/ConnectionPanel/index.tsx`**

The file mirrors ElementPanel. Keep all logic. Add import `import { Input, Textarea, Select, SectionLabel, Button } from '../ui'`. Replace:

- Guard div classes → `flex items-center justify-center h-full text-sm text-ink-faint`
- Header:

```tsx
      <div className="px-5 py-3 border-b border-line flex items-center justify-between shrink-0">
        <div>
          <div className="text-lg font-semibold tracking-tight text-ink">Properties</div>
          <span className="text-xs font-mono text-ink-faint">{conn.connId}</span>
        </div>
        <Button variant="danger-ghost" className="!px-1 text-xs" onClick={() => removeConnection(conn.id)}>Delete</Button>
      </div>
```

- Body wrapper → `flex-1 overflow-y-auto p-5 space-y-4`
- Name field → `<Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />`
- Type select → `<Select value={connectionTypeId ?? ''} onChange={...same handler...}>` (same options)
- Description → `<Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} rows={3} />`
- Requirements filter input → `<Input placeholder="Filter by ID or text…" value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className="!py-1.5 !text-xs mb-2" />`
- Linked requirement rows: replace the row className with

```tsx
                  className={`flex items-start gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs transition-colors
                    ${linked ? 'bg-action-tint/40 border-action/40 text-ink' : 'border-line hover:bg-workspace text-ink-muted'}`}
```

- "No requirements match." div → `text-ink-faint text-xs px-2`
- `Field` helper: replace label with `<SectionLabel className="block">{label}</SectionLabel>` and wrapper `space-y-1.5`

- [ ] **Step 3: Typecheck + commit**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
git add src/renderer/src/components/ElementPanel src/renderer/src/components/ConnectionPanel
git commit -m "feat(ui): element/connection properties panels styling"
```

---

## Task 9: Build, Visual Verification, Docs

**Files:**
- Modify: `handoff.md` (status update)

- [ ] **Step 1: Full typecheck + test suite**

```bash
export PATH="/Users/rejopckoruth/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin:$PATH"
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.node.json --composite false
node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.web.json --composite false
node_modules/.bin/vitest run 2>&1 | tail -5
```

Expected: typechecks clean; failed count ≤ baseline in `/tmp/vitest-baseline.txt`.

- [ ] **Step 2: Build**

```bash
./node_modules/.bin/electron-vite build 2>&1 | tail -6
```

Expected: 3 successful builds. Verify `ls node_modules/better-sqlite3/build/Release/better_sqlite3.node` still exists (Electron ABI 125 binary).

- [ ] **Step 3: Visual verification with the Playwright driver**

Use the FIFO-driven REPL (`.claude/skills/run-app/driver.mjs`, commands: `launch`, `ss <name>`, `click-text <t>`, `eval <js>`, `text`, `quit`). The SmokeTest project with module SRS and requirements SRS-0001/0002 auto-loads.

Checks (screenshot each):
1. Shell: navy 56px header, wordmark, tabs with green underline on active, Open/New Project buttons right
2. Requirements: sidebar shows project name, MODULES label-caps, folder rows, green active tint, bottom "+ New Module" green button; table shows toolbar with "+ New Requirement", label-caps headers, zebra rows, mono IDs; selecting a row shows green left accent
3. Detail drawer: "Requirement Details" heading, label-caps fields, custom fields section
4. Architecture tab: dot-grid canvas, "+ Block" green button; add a block → navy header-strip node with mono ID; click it → Properties panel styled
5. Interaction regression: delete + Show deleted + Restore cycle still works; custom field add (auto-focus) / blur-save / remove still work; switching requirements does NOT steal focus (`document.activeElement` is BODY)

Compare against `docs/superpowers/specs/assets/2026-07-02-ui/requirements-screen.png` and `architecture-screen.png` — match the structure and palette, not pixel-for-pixel (mockups include deferred features that will be absent).

- [ ] **Step 4: Update `handoff.md`**

Replace the "Planned: UI Overhaul with Stitch" section with a "UI Overhaul — COMPLETE" section: design source (Stitch project `9610086237141072081`), spec path, and a pointer to the Deferred Backlog in the spec as the next feature queue.

- [ ] **Step 5: Final commit**

```bash
git add handoff.md
git commit -m "feat(ui): complete Industrial Precision overhaul — verified in running app"
```
