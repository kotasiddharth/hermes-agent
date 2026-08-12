import { useStore } from '@nanostores/react'
import { memo, useEffect } from 'react'

import { composerDockCard } from '@/components/chat/composer-dock'
import { StatusRow } from '@/components/chat/status-row'
import {
  type ActionItemSpec,
  ActionsContextMenu,
  ActionsMenu,
  type MenuKit,
  renderActionItem
} from '@/components/ui/actions-menu'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { CopyButton } from '@/components/ui/copy-button'
import { DiffCount } from '@/components/ui/diff-count'
import type { HermesGitBranch } from '@/global'
import { useI18n } from '@/i18n'
import { isDesktopFsRemoteMode } from '@/lib/desktop-fs'
import { cn } from '@/lib/utils'
import { openWorktreeDialog, registerRepoStatusCwd, repoStatusForCwd, repoWorktreesForCwd } from '@/store/coding-status'
import { notifyError } from '@/store/notifications'
import { $projects, $projectTree, projectIdForCwd } from '@/store/projects'

// Tiny uppercase section header, matching the composer "+" menu's labels.
const MENU_SECTION = 'text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)'

const workspaceName = (path: string): string => {
  const segments = path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)

  return segments[segments.length - 1] || path
}

interface CodingStatusRowProps {
  /** A queued turn owns the space above the composer, so the directory strip
   *  yields to the queue instead of creating a second competing card. */
  hasQueuedPrompts?: boolean
  /** Branch the current draft off into a fresh worktree + session, based on
   *  `base` (a branch name; omitted = current HEAD). The composer owns the
   *  draft, so it supplies the orchestration; the row just collects the new
   *  branch name + base. Omitted (e.g. remote backend) hides the affordance. */
  onBranchOff?: (branch: string, base?: string) => Promise<void>
  /** Check an existing branch out into a fresh worktree + session (no new
   *  branch). Drives the dialog's "convert a branch" picker. */
  onConvertBranch?: (branch: string, path?: null | string, isDefault?: boolean) => Promise<void>
  /** Pick and apply a new working directory for this chat. */
  onChangeDirectory?: () => Promise<void> | void
  /** List the repo's local branches for the "convert a branch" picker. */
  onListBranches?: () => Promise<HermesGitBranch[]>
  /** Open the review pane (changed files + diffs). */
  onOpen?: () => void
  /** Jump into an existing worktree (open a fresh session anchored there). */
  onOpenWorktree?: (path: string) => void
  /** Switch the current repo checkout to another branch. */
  onSwitchBranch?: (branch: string) => Promise<void>
  /** Repo root path for the worktree dialog. */
  repoPath?: null | string
}

/**
 * Project coding context above the composer: current workspace, branch, dirty
 * summary (+/-), and ahead/behind. It belongs only to chats in a project, and
 * yields to queued work so the queue remains the one clear action surface.
 */
export const CodingStatusRow = memo(function CodingStatusRow({
  hasQueuedPrompts = false,
  onBranchOff,
  onChangeDirectory,
  onConvertBranch,
  onListBranches,
  onOpen,
  onOpenWorktree,
  onSwitchBranch,
  repoPath
}: CodingStatusRowProps) {
  const { t } = useI18n()
  const s = t.statusStack.coding
  const p = t.sidebar.projects
  const fileMenu = t.fileMenu
  const resolvedRepoPath = repoPath?.trim() || undefined
  // Project membership is driven by the backend-owned project tree, not by
  // whether a cwd happens to be a Git repo. The tree also holds auto-projects
  // for ordinary folders; the strip is reserved for named project folders that
  // deliberately share one workspace across chats.
  const projects = useStore($projects)
  const projectTree = useStore($projectTree)
  const projectId = resolvedRepoPath ? projectIdForCwd(resolvedRepoPath) : null
  const projectNode = projectId ? projectTree.find(project => project.id === projectId) : undefined

  const isProjectWorkspace = Boolean(
    projectId &&
    (projectNode ? !projectNode.isAuto && !projectNode.isNoProject : projects.some(project => project.id === projectId))
  )

  const isRemoteWorkspace = isDesktopFsRemoteMode()
  // This surface's OWN worktree, always — never the primary's. The row used to
  // fall back to the global `$repoStatus` for a blank repoPath, which painted
  // the main pane's branch/± onto a tile whose cwd hadn't resolved yet. That
  // fallback bought nothing (the primary's computed is keyed to `$currentCwd`,
  // which is blank in exactly the same case) and cost a wrong-tree rail.
  const status = useStore(repoStatusForCwd(resolvedRepoPath))
  const worktrees = useStore(repoWorktreesForCwd(resolvedRepoPath))

  // Keep only a visible project rail in the refresh set. While queued work is
  // using the slot, there is no branch UI to update; it re-registers and probes
  // immediately when the queue clears.
  useEffect(() => {
    if (!resolvedRepoPath || !isProjectWorkspace || hasQueuedPrompts) {
      return
    }

    return registerRepoStatusCwd(resolvedRepoPath)
  }, [hasQueuedPrompts, isProjectWorkspace, resolvedRepoPath])

  const switchToBranch = async (branch: string) => {
    if (!onSwitchBranch) {
      return
    }

    try {
      await onSwitchBranch(branch)
    } catch (err) {
      notifyError(err, s.switchFailed(branch))
    }
  }

  // useKeybinds now handles the ⌘⇧B hotkey globally, through
  // openWorktreeDialog. One dialog is mounted in the sidebar, so N mounted
  // rails can no longer each open their own copy. The menu items below only
  // publish the intent. They pin the repo of THIS rail, so the kebab of a tile
  // targets the worktree of that tile.
  const startBranch = (base: string | undefined) => {
    void openWorktreeDialog({ base, repoPath: resolvedRepoPath })
  }

  if (!resolvedRepoPath || !isProjectWorkspace || hasQueuedPrompts) {
    return null
  }

  const workspaceLabel = workspaceName(resolvedRepoPath)
  const workspaceSourceLabel = isRemoteWorkspace ? 'Remote' : 'Local'

  const workspaceMeta = (
    <>
      <div className="group/workspace flex min-w-0 items-center gap-1.5" data-slot="project-directory">
        {onChangeDirectory ? (
          <button
            aria-label={t.rightSidebar.changeCwdTitle}
            className="-mx-1 flex min-w-0 items-center gap-1.5 rounded-md px-1 text-left outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring/70"
            onClick={() => void onChangeDirectory()}
            title={t.rightSidebar.changeCwdTitle}
            type="button"
          >
            <Codicon className="shrink-0 text-muted-foreground/85" name="folder" size="0.8rem" />
            <span className="min-w-0 truncate text-xs font-medium text-foreground/92" title={resolvedRepoPath}>
              {workspaceLabel}
            </span>
          </button>
        ) : (
          <>
            <Codicon className="shrink-0 text-muted-foreground/85" name="folder" size="0.8rem" />
            <span className="min-w-0 truncate text-xs font-medium text-foreground/92" title={resolvedRepoPath}>
              {workspaceLabel}
            </span>
          </>
        )}
        <CopyButton
          appearance="icon"
          buttonSize="icon-xs"
          className="pointer-events-none size-4 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover/workspace:pointer-events-auto group-hover/workspace:opacity-100 group-focus-within/workspace:pointer-events-auto group-focus-within/workspace:opacity-100"
          iconClassName="size-3"
          label={fileMenu.copyPath}
          side="top"
          stopPropagation
          text={resolvedRepoPath}
        />
      </div>
      <span aria-hidden className="h-3 w-px shrink-0 bg-border/65" />
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground/80">
        <Codicon name={isRemoteWorkspace ? 'server' : 'device-desktop'} size="0.78rem" />
        {workspaceSourceLabel}
      </span>
    </>
  )

  if (!status) {
    return (
      <div
        className={cn(
          composerDockCard('top'),
          'mx-9 overflow-hidden rounded-b-none border-b border-b-transparent'
        )}
        data-slot="coding-status-card"
      >
        <StatusRow
          // A project is a folder even when it is not a Git checkout. Keep its
          // workspace breadcrumb available rather than hiding all context.
          className="coding-status-bar min-h-8 rounded-[inherit] px-3.5 py-1.5 hover:bg-transparent"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">{workspaceMeta}</div>
        </StatusRow>
      </div>
    )
  }

  const branchLabel = status.detached ? s.detached : status.branch || s.noBranch
  // The kebab offers branching off the trunk and/or the current branch. The
  // worktree-add bases the new branch on `base` (a branch name; undefined =
  // current HEAD). We dedupe so "on main" shows a single trunk entry, and fall
  // back to a plain off-HEAD branch when no trunk is detected.
  const current = status.detached ? null : status.branch
  const branchTargets: { base: string | undefined; label: string }[] = []

  // Current branch first (the 99% "branch off where I am"), then the trunk just
  // below it ("New branch from main"), deduped when they're the same.
  if (current) {
    branchTargets.push({ base: current, label: s.branchOffFrom(current) })
  }

  if (status.defaultBranch && status.defaultBranch !== current) {
    branchTargets.push({ base: status.defaultBranch, label: s.branchOffFrom(status.defaultBranch) })
  }

  if (branchTargets.length === 0) {
    branchTargets.push({ base: undefined, label: s.newBranch })
  }

  const switchTarget =
    onSwitchBranch && current && status.defaultBranch && status.defaultBranch !== current ? status.defaultBranch : null

  // Other worktrees to jump into — everything except the one we're already in
  // (matched by its checked-out branch) and the bare/main placeholder entry.
  const otherWorktrees = onOpenWorktree
    ? worktrees.filter(w => w.path && !w.detached && w.branch && w.branch !== current)
    : []

  const hasLineDelta = status.added > 0 || status.removed > 0
  // Untracked files carry no line delta vs HEAD, so surface them as a count when
  // they're the only change (otherwise +/- tells the story).
  const untrackedOnly = !hasLineDelta && status.untracked > 0

  // The branch actions, rendered identically by the kebab dropdown and the
  // row's right-click menu so the two never drift. `onBranchOff` gates the
  // whole menu (omitted = remote backend), matching the kebab.
  const renderBranchItems = (kit: MenuKit) => {
    const branchItems: ActionItemSpec[] = branchTargets.map(target => ({
      key: target.base ?? '__head__',
      label: <span className="truncate">{target.label}</span>,
      onSelect: () => startBranch(target.base)
    }))

    const worktreeItems: ActionItemSpec[] = otherWorktrees.map(worktree => ({
      key: worktree.path,
      label: <span className="truncate">{worktree.branch}</span>,
      onSelect: () => onOpenWorktree?.(worktree.path)
    }))

    return (
      <>
        <kit.Label className={MENU_SECTION}>{s.newBranch}</kit.Label>
        {branchItems.map(item => renderActionItem(kit, item))}
        {switchTarget &&
          renderActionItem(kit, {
            key: '__switch__',
            label: <span className="truncate">{s.switchTo(switchTarget)}</span>,
            onSelect: () => void switchToBranch(switchTarget)
          })}
        <kit.Separator />
        <kit.Label className={MENU_SECTION}>{s.worktrees}</kit.Label>
        {worktreeItems.map(item => renderActionItem(kit, item))}
        {/* Create a fresh worktree off the current HEAD (the generic "spin up a
            worktree here", mirroring the sidebar's + button). */}
        {renderActionItem(kit, {
          key: '__start__',
          label: <span className="truncate">{p.startWork}</span>,
          onSelect: () => startBranch(undefined)
        })}
        {onConvertBranch &&
          renderActionItem(kit, {
            key: '__convert__',
            label: <span className="truncate">{p.convertBranch}</span>,
            onSelect: () => startBranch(undefined)
          })}
      </>
    )
  }

  return (
    <div
      className={cn(
        composerDockCard('top'),
        'mx-9 overflow-hidden rounded-b-none border-b border-b-transparent'
      )}
      data-slot="coding-status-card"
    >
      <ActionsContextMenu contentClassName="w-60" disabled={!onBranchOff} items={renderBranchItems}>
        <StatusRow
          // The workspace breadcrumb is the composer's attached project rail;
          // branch state shares the same compact row.
          className="coding-status-bar min-h-8 rounded-[inherit] px-3.5 py-1.5 hover:bg-transparent"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {workspaceMeta}
            <span aria-hidden className="h-3 w-px shrink-0 bg-border/65" />

            {/* Branch name is the review-pane target; the folder and connection
                stay plain context so the breadcrumb reads as one stable path. */}
            <button
              className="flex min-w-0 items-center gap-1.5 text-muted-foreground/92 hover:text-foreground"
              onClick={onOpen}
              type="button"
            >
              <Codicon className="shrink-0 text-(--ui-green)" name="git-branch" size="0.78rem" />
              <span className="min-w-0 truncate text-xs font-medium" title={branchLabel}>
                {branchLabel}
              </span>
            </button>

            {/* Branch actions kebab — same pattern as the session/worktree rows.
                ALWAYS laid out; only its opacity flips on hover/focus/open, so
                revealing it never reflows the row (no layout shift). pointer-events
                follow opacity so the invisible trigger isn't clickable at rest. */}
            {onBranchOff && (
              <ActionsMenu
                align="end"
                contentClassName="w-60"
                // The row sits at the bottom of the screen (above the composer),
                // so the menu opens upward.
                items={renderBranchItems}
                side="top"
              >
                <Button
                  aria-label={s.newBranch}
                  className="pointer-events-none ml-auto size-4 shrink-0 text-muted-foreground/60 opacity-0 transition hover:text-foreground group-hover/status-row:pointer-events-auto group-hover/status-row:opacity-100 group-focus-within/status-row:pointer-events-auto group-focus-within/status-row:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100"
                  size="icon-xs"
                  variant="ghost"
                >
                  <Codicon name="kebab-vertical" size="0.8rem" />
                </Button>
              </ActionsMenu>
            )}
          </div>

          {/* The counts describe what's in the review pane, so clicking them
              opens it. `contents` again: the two spans stay direct flex children
              of the row, keeping their gap and `ml-auto` behaviour untouched. */}
          {(status.ahead > 0 || status.behind > 0 || hasLineDelta || untrackedOnly) && (
            <button className="contents" onClick={onOpen} type="button">
              {(status.ahead > 0 || status.behind > 0) && (
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[0.68rem] leading-4 text-muted-foreground/75 tabular-nums">
                  {status.ahead > 0 && (
                    <span className="flex items-center gap-0.5" title={s.ahead(status.ahead)}>
                      <span aria-hidden>↑</span>
                      {status.ahead}
                    </span>
                  )}
                  {status.behind > 0 && (
                    <span className="flex items-center gap-0.5" title={s.behind(status.behind)}>
                      <span aria-hidden>↓</span>
                      {status.behind}
                    </span>
                  )}
                </span>
              )}

              {hasLineDelta ? (
                <DiffCount
                  added={status.added}
                  className={`text-[0.72rem] leading-4 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`}
                  removed={status.removed}
                />
              ) : untrackedOnly ? (
                <span
                  className={`shrink-0 text-[0.72rem] leading-4 text-amber-500/90 ${status.ahead === 0 && status.behind === 0 ? 'ml-auto' : ''}`}
                >
                  {s.changed(status.untracked)}
                </span>
              ) : null}
            </button>
          )}
        </StatusRow>
      </ActionsContextMenu>
    </div>
  )
})
