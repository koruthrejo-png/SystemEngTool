import { useStore } from '../store'
import HeaderMenu, { MenuItem } from './HeaderMenu'
import { attentionItems } from './attention'
import type { Requirement } from '../../../types'

const GROUPS: [keyof ReturnType<typeof attentionItems>, string][] = [
  ['traceGaps', 'Trace gaps'],
  ['inReview', 'In review'],
  ['verificationFailed', 'Verification failed']
]

export default function NotificationsBell(): JSX.Element {
  const { projectRequirements, traceLinks, openRequirement } = useStore()
  const items = attentionItems(projectRequirements, traceLinks)

  return (
    <HeaderMenu
      align="right"
      trigger={
        <span
          aria-label="Notifications"
          className="relative flex items-center justify-center w-6 h-6 text-white/70 hover:text-white"
        >
          <span aria-hidden className="text-base leading-none">🔔</span>
          {items.count > 0 && (
            <span
              data-testid="bell-badge"
              className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none"
            >
              {items.count}
            </span>
          )}
        </span>
      }
    >
      {(close) => {
        const rows = GROUPS.filter(([key]) => (items[key] as Requirement[]).length > 0)
        if (rows.length === 0) {
          return <div className="px-3 py-3 text-sm text-ink-faint">You're all caught up.</div>
        }
        return (
          <div className="max-h-96 overflow-auto min-w-[16rem]">
            {rows.map(([key, label]) => (
              <div key={key}>
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
                {(items[key] as Requirement[]).map((r) => (
                  <MenuItem key={r.id} onClick={() => { close(); openRequirement(r) }}>
                    <span className="font-mono text-xs text-ink-faint mr-2">{r.reqId}</span>
                    <span className="text-ink">{r.text.length > 60 ? r.text.slice(0, 60) + '…' : r.text}</span>
                  </MenuItem>
                ))}
              </div>
            ))}
          </div>
        )
      }}
    </HeaderMenu>
  )
}
