import { ActionsMenu, type MenuKit, renderActionItem } from '@/components/ui/actions-menu'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { type Translations, useI18n } from '@/i18n'
import { CornerDownLeft, iconSize, Pencil, Trash2 } from '@/lib/icons'
import type { QueuedPromptEntry } from '@/store/composer-queue'

interface QueuePanelProps {
  busy: boolean
  editingId: null | string
  entries: QueuedPromptEntry[]
  onDelete: (id: string) => void
  onEdit: (entry: QueuedPromptEntry) => void
  /** Lift a park (explicit Stop/Esc halt) and let the queue flow again. */
  onResume: () => void
  onSendNow: (id: string) => void
  /** True after an explicit halt: entries wait until resumed / sent / edited. */
  parked: boolean
}

const entryPreview = (entry: QueuedPromptEntry, c: Translations['composer']) =>
  (entry.displayText ?? entry.text).trim() || (entry.attachments.length > 0 ? c.attachmentOnly : c.emptyTurn)

export function QueuePanel({
  busy,
  editingId,
  entries,
  onDelete,
  onEdit,
  onResume,
  onSendNow,
  parked
}: QueuePanelProps) {
  const { t } = useI18n()
  const c = t.composer

  if (entries.length === 0) {
    return null
  }

  const nextEntry = entries.find(entry => entry.id !== editingId) ?? entries[0]
  const queueLabel = parked
    ? c.queuedPaused(entries.length)
    : entries.length === 1
      ? c.queueMessage
      : c.queued(entries.length)
  const primaryLabel = parked ? c.queueResume : busy ? c.queueSteer : c.queueSend
  const primaryTip = parked ? c.queueResumeTip : busy ? c.steer : c.queueSend

  const renderQueueItems = (kit: MenuKit) => (
    <>
      <kit.Label>{queueLabel}</kit.Label>
      {entries.map(entry => (
        <kit.Sub key={entry.id}>
          <kit.SubTrigger>
            <Codicon name="list-selection" size="0.875rem" />
            <span className="max-w-52 truncate">{entryPreview(entry, c)}</span>
          </kit.SubTrigger>
          <kit.SubContent>
            {renderActionItem(kit, {
              disabled: Boolean(editingId),
              iconNode: <Pencil className={iconSize.xs} />,
              key: `edit-${entry.id}`,
              label: c.queueEdit,
              onSelect: () => onEdit(entry)
            })}
            {renderActionItem(kit, {
              disabled: entry.id === editingId,
              iconNode: <CornerDownLeft className={iconSize.xs} />,
              key: `send-${entry.id}`,
              label: busy ? c.queueSteer : c.queueSend,
              onSelect: () => onSendNow(entry.id)
            })}
            {renderActionItem(kit, {
              iconNode: <Trash2 className={iconSize.xs} />,
              key: `delete-${entry.id}`,
              label: c.queueDelete,
              onSelect: () => onDelete(entry.id),
              variant: 'destructive'
            })}
          </kit.SubContent>
        </kit.Sub>
      ))}
    </>
  )

  return (
    <div className="flex min-h-8 items-center gap-2 px-3.5 py-1.5">
      <Codicon
        className="shrink-0 text-muted-foreground/75"
        name={parked ? 'debug-pause' : 'list-selection'}
        size="0.8rem"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/92">{queueLabel}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tip label={primaryTip}>
          <Button
            aria-label={primaryLabel}
            className="h-6 gap-1 px-1.5 text-[0.72rem] text-muted-foreground/85 hover:text-foreground/95"
            disabled={!parked && nextEntry.id === editingId}
            onClick={() => (parked ? onResume() : onSendNow(nextEntry.id))}
            size="micro"
            type="button"
            variant="text"
          >
            {parked ? <Codicon name="debug-continue" size="0.8rem" /> : <CornerDownLeft className={iconSize.xs} />}
            <span>{primaryLabel}</span>
          </Button>
        </Tip>
        <Tip label={c.queueDelete}>
          <Button
            aria-label={c.queueDelete}
            className="size-5 rounded-md"
            onClick={() => onDelete(nextEntry.id)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 className={iconSize.xs} />
          </Button>
        </Tip>
        <ActionsMenu
          align="end"
          ariaLabel={c.queueMoreActions}
          contentClassName="w-64"
          items={renderQueueItems}
          side="top"
        >
          <Button
            aria-label={c.queueMoreActions}
            className="size-5 rounded-md text-muted-foreground/75 hover:text-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Codicon name="kebab-horizontal" size="0.9rem" />
          </Button>
        </ActionsMenu>
      </div>
    </div>
  )
}
