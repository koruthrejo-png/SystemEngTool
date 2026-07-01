# Handoff: New Project Creation Not Updating UI

## Problem
After clicking **New Project** → typing a name → clicking **Create**, the app UI does not update. The left panel continues to show "Open or create a project to begin." and the header does not show the project name. The project may or may not be getting created on disk, but the renderer never reflects the new project state.

## What Works
- The "New Project" React dialog appears correctly when the button is clicked (fixed from `window.prompt` which is removed in Electron 12+)
- The Architecture tab renders correctly (React Flow canvas, + Block button)
- Switching tabs works
- The app launches and loads from built files correctly

## What Doesn't Work
After clicking **Create** in the dialog:
- The store's `project` state is never set (remains `null`)
- The left ModuleTree panel never transitions from empty state to active state
- No project name appears in the header

## Code Flow (src/renderer/src/App.tsx → store → main)

```
handleNewProject()
  → window.api.project.create(name)         // IPC: project:create
  → [main] creates DB in userData/projects/
  → [main] calls createProject(), seedElementTypes(), seedConnectionTypes()
  → [main] calls setLastProjectPath(filePath)
  → returns Project object
  → if (p) loadProject()                    // store action
      → window.api.project.getCurrent()     // IPC: project:getCurrent
      → [main] reads lastProjectPath from settings.json
      → [main] openDatabase(lastPath)
      → [main] getFirstProject()
      → set({ project, modules })
      → React re-renders
```

## Suspected Root Causes (in order of likelihood)

1. **`project:create` IPC handler is throwing** — the `mkdirSync` or `openDatabase` call in the handler may be failing silently. The IPC invoke returns `undefined`/`null` on exception without surfacing the error to the renderer. Check by wrapping in try/catch and logging.

2. **`loadProject()` not re-fetching correctly** — `getCurrent()` reads from `settings.json` which may not be written before `getCurrent()` is called. Race condition between `setLastProjectPath` (sync file write) and the subsequent IPC call is unlikely but possible.

3. **`set({ project, modules })` not triggering re-render** — Zustand store update may not be propagating. Unlikely given Zustand's design.

## What Was Tried
- Replaced `window.prompt` with a React modal dialog ✓ (fixed)
- Passed `BrowserWindow` to `dialog.showSaveDialog` to prevent dialog appearing behind window
- Removed native save dialog entirely — auto-saves to `app.getPath('userData')/projects/<name>.reqarch`
- Multiple clean builds + restarts

## Recommended Next Debugging Steps

### Step 1 — Add error logging to the IPC handler
In `src/main/handlers/projects.ts`, wrap `project:create` in try/catch:
```ts
ipcMain.handle('project:create', async (_e, name: string) => {
  try {
    const projectsDir = join(app.getPath('userData'), 'projects')
    mkdirSync(projectsDir, { recursive: true })
    const safe = name.replace(/[^a-zA-Z0-9_\- ]/g, '_')
    const filePath = join(projectsDir, `${safe}.reqarch`)
    openDatabase(filePath)
    const project = createProject(name)
    const db = getDatabase()
    seedElementTypes(db, project.id)
    seedConnectionTypes(db, project.id)
    setLastProjectPath(filePath)
    console.log('[project:create] success:', filePath, project)
    return project
  } catch (err) {
    console.error('[project:create] FAILED:', err)
    return null
  }
})
```

### Step 2 — Open DevTools and check console
In `src/main/index.ts`, add to `createWindow()`:
```ts
win.webContents.openDevTools()
```
Then rebuild and run. The DevTools console will show any renderer-side errors when Create is clicked.

### Step 3 — Check if DB file is actually created
After clicking Create, check:
```bash
ls ~/Library/Application\ Support/reqarch2/projects/
```
If the file exists, the main process worked and the bug is in the renderer not receiving/processing the returned value.
If the file doesn't exist, the main process handler is failing.

### Step 4 — Simplify loadProject call
In `App.tsx handleNewProject`, instead of calling `loadProject()` (which re-fetches), use the already-returned project directly:
```ts
const p = await window.api.project.create(name)
if (p) {
  // Skip loadProject — use returned value directly
  const modules = await window.api.modules.list(p.id)
  useStore.setState({ project: p, modules })
}
```
This bypasses the getCurrent round-trip entirely.

## Key Files
- `src/renderer/src/App.tsx` — `handleNewProject` function (line 26)
- `src/main/handlers/projects.ts` — `project:create` IPC handler (line 53)
- `src/main/db/connection.ts` — `openDatabase` function (check for silent throws)
- `src/renderer/src/store/index.ts` — `loadProject` action (line 68)
- `src/main/settings.ts` — `setLastProjectPath` / `getLastProjectPath`

## App Data Location
`~/Library/Application Support/reqarch2/`
- `settings.json` — stores `lastProjectPath`
- `projects/` — where `.reqarch` files are saved (after latest fix)
