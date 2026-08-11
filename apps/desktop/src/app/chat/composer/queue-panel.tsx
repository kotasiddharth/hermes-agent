import { StatusRow } from '@/components/chat/status-row'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { type Translations, useI18n } from '@/i18n'
import { CornerDownLeft, iconSize, Pencil, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
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

  return (
    <div className="space-y-1 px-2 py-2">
      {/* A normal queue is self-explanatory from its message rows, so avoid a
          second "N queued" heading. Only an explicitly parked queue needs a
          status line, since it tells people why their messages are waiting. */}
      {parked && (
        <div className="mb-1 flex items-center gap-1.5 border-b border-(--ui-stroke-tertiary) px-1 py-1.5 text-[0.75rem] text-muted-foreground/90">
          <Codicon className="shrink-0 text-muted-foreground/70" name="debug-pause" size="0.8rem" />
          <span className="min-w-0 flex-1 truncate">{c.queuedPaused(entries.length)}</span>
          <Tip label={c.queueResumeTip}>
            <Button
              className="text-muted-foreground/75 hover:text-foreground/90"
              onClick={onResume}
              size="micro"
              type="button"
              variant="text"
            >
              {c.queueResume}
            </Button>
          </Tip>
        </div>
      )}
      {entries.map(entry => {
        const isEditing = editingId === entry.id
        const attachmentsCount = entry.attachments.length

        return (
          <StatusRow
            className={cn(
              'border border-transparent px-2 py-1.5',
              isEditing &&
                'border-[color-mix(in_srgb,var(--dt-composer-ring)_45%,transparent)] bg-accent/20 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--dt-composer-ring)_18%,transparent)]'
            )}
            key={entry.id}
            leading={<CornerDownLeft className="size-3 text-muted-foreground/70" />}
            trailing={
              <>
                <Tip label={c.queueEdit}>
                  <Button
                    aria-label={c.queueEdit}
                    className="h-5 gap-1 px-1 text-[0.6875rem] text-muted-foreground/85 hover:text-foreground/95"
                    disabled={Boolean(editingId) && !isEditing}
                    onClick={() => onEdit(entry)}
                    size="micro"
                    type="button"
                    variant="text"
                  >
                    <Pencil className={iconSize.xs} />
                    <span>{c.queueEdit}</span>
                  </Button>
                </Tip>
                <Tip label={busy ? c.queueSendNext : c.queueSend}>
                  <Button
                    aria-label={busy ? c.queueSendNext : c.queueSend}
                    className="size-5 rounded-md"
                    disabled={isEditing}
                    onClick={() => onSendNow(entry.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <CornerDownLeft className={iconSize.xs} />
                  </Button>
                </Tip>
                <Tip label={c.queueDelete}>
                  <Button
                    aria-label={c.queueDelete}
                    className="size-5 rounded-md"
                    onClick={() => onDelete(entry.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className={iconSize.xs} />
                  </Button>
                </Tip>
              </>
            }
            trailingVisible
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.75rem] leading-5 text-foreground/92">{entryPreview(entry, c)}</p>
              {(attachmentsCount > 0 || isEditing) && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[0.64rem] text-muted-foreground/75">
                  {attachmentsCount > 0 && <span>{c.attachments(attachmentsCount)}</span>}
                  {isEditing && (
                    <span className="text-[color-mix(in_srgb,var(--dt-composer-ring)_78%,var(--muted-foreground))]">
                      {c.editingInComposer}
                    </span>
                  )}
                </div>
              )}
            </div>
          </StatusRow>
        )
      })}
    </div>
  )
}
