import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assistantTextPart, type ChatMessage } from '@/lib/chat-messages'
import { mainComposerScope } from '@/store/composer'
import {
  $activeSessionId,
  $awaitingResponse,
  $busy,
  $contextSuggestions,
  $currentCwd,
  $currentModel,
  $currentProvider,
  $freshDraftReady,
  $gatewayState,
  $messages,
  $selectedStoredSessionId,
  $sessions
} from '@/store/session'

import { ComposerScopeProvider } from './composer/scope'
import { type SessionView, SessionViewProvider } from './session-view'

const threadRenderCount = vi.hoisted(() => ({ current: 0 }))
const lastThreadIntro = vi.hoisted(() => ({ current: undefined as undefined | { compact?: boolean } }))

vi.mock('@/components/assistant-ui/thread', async () => {
  const React = await import('react')

  return {
    Thread: ({ intro }: { intro?: { compact?: boolean } }) => {
      threadRenderCount.current += 1
      lastThreadIntro.current = intro

      return React.createElement('div', { 'data-testid': 'thread' })
    }
  }
})

vi.mock('@/components/prompt-overlays', () => ({ PromptOverlays: () => null }))
vi.mock('@/components/chat/vibe-hearts', () => ({ COMPOSER_HEART_CONFIG: {}, HeartField: () => null }))
vi.mock('@/lib/model-options', () => ({
  modelOptionsQueryKey: (...parts: unknown[]) => ['model-options', ...parts],
  requestModelOptions: vi.fn(async () => ({ models: [] }))
}))
vi.mock('./chat-drop-overlay', () => ({ ChatDropOverlay: () => null }))
vi.mock('./chat-swap-overlay', () => ({ ChatSwapOverlay: () => null }))
vi.mock('./composer', () => ({ ChatBar: () => null, ChatBarFallback: () => null }))
vi.mock('./hooks/use-file-drop-zone', () => ({
  useFileDropZone: () => ({ dragKind: null, dropHandlers: {} })
}))
vi.mock('./sidebar/session-actions-menu', async () => {
  const React = await import('react')

  return {
    SessionActionsMenu: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'session-actions-menu' }, children)
  }
})

const { ChatView } = await import('./index')

function assistantMessage(id: string, text: string): ChatMessage {
  return {
    id,
    parts: [assistantTextPart(text)],
    role: 'assistant'
  }
}

describe('ChatView render isolation', () => {
  beforeEach(() => {
    threadRenderCount.current = 0
    lastThreadIntro.current = undefined
    $activeSessionId.set('runtime-1')
    $awaitingResponse.set(false)
    $busy.set(false)
    $contextSuggestions.set([])
    $currentCwd.set('/work')
    $currentModel.set('test-model')
    $currentProvider.set('test-provider')
    $freshDraftReady.set(false)
    $gatewayState.set('closed')
    $messages.set([assistantMessage('assistant-1', 'Stable historical answer')])
    $selectedStoredSessionId.set('stored-1')
    $sessions.set([{ id: 'stored-1', message_count: 1, title: 'Stable chat' } as never])
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    lastThreadIntro.current = undefined
    $activeSessionId.set(null)
    $awaitingResponse.set(false)
    $busy.set(false)
    $contextSuggestions.set([])
    $currentCwd.set('')
    $currentModel.set('')
    $currentProvider.set('')
    $freshDraftReady.set(false)
    $gatewayState.set('idle')
    $messages.set([])
    $selectedStoredSessionId.set(null)
    $sessions.set([])
  })

  it('does not re-render chat history when an unrelated parent idle tick updates', () => {
    const props = {
      gateway: null,
      maxVoiceRecordingSeconds: 120,
      onAddContextRef: vi.fn(),
      onAddUrl: vi.fn(),
      onAttachDroppedItems: vi.fn(),
      onAttachImageBlob: vi.fn(),
      onBranchInNewChat: vi.fn(),
      onCancel: vi.fn(),
      onDeleteSelectedSession: vi.fn(),
      onEdit: vi.fn(),
      onPasteClipboardImage: vi.fn(),
      onPickFiles: vi.fn(),
      onPickFolders: vi.fn(),
      onPickImages: vi.fn(),
      onReload: vi.fn(),
      onRemoveAttachment: vi.fn(),
      onRetryResume: vi.fn(),
      onSteer: vi.fn(),
      onSubmit: vi.fn(),
      onThreadMessagesChange: vi.fn(),
      onToggleSelectedPin: vi.fn(),
      onTranscribeAudio: vi.fn()
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    })

    function ParentTickHarness() {
      const [tick, setTick] = useState(0)

      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/stored-1']}>
            <button onClick={() => setTick(value => value + 1)} type="button">
              parent tick {tick}
            </button>
            <ChatView {...props} />
          </MemoryRouter>
        </QueryClientProvider>
      )
    }

    render(<ParentTickHarness />)

    expect(screen.getByTestId('thread')).toBeTruthy()
    expect(threadRenderCount.current).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: /parent tick/i }))

    // memo(ChatView) with stable props must absorb the parent's idle tick —
    // the transcript (Thread) must not re-render. This is PR #38470's contract.
    expect(threadRenderCount.current).toBe(1)
  })

  it('gives an empty Ctrl/⌘T session tab a compact intro instead of a blank canvas', () => {
    const tileMessages = atom<ChatMessage[]>([])

    const tileView: SessionView = {
      kind: 'tile',
      $awaitingResponse: atom(false),
      $busy: atom(false),
      $cwd: atom(''),
      $fast: atom(false),
      $lastVisibleIsUser: atom(false),
      $messages: tileMessages,
      $messagesEmpty: atom(true),
      $model: atom('test-model'),
      $provider: atom('test-provider'),
      $reasoningEffort: atom(''),
      $runtimeId: atom('tile-runtime'),
      $storedId: atom('stored-tile'),
      $usage: atom(null)
    }

    const props = {
      gateway: null,
      maxVoiceRecordingSeconds: 120,
      onAddContextRef: vi.fn(),
      onAddUrl: vi.fn(),
      onAttachDroppedItems: vi.fn(),
      onAttachImageBlob: vi.fn(),
      onCancel: vi.fn(),
      onDeleteSelectedSession: vi.fn(),
      onEdit: vi.fn(),
      onPasteClipboardImage: vi.fn(),
      onPickFiles: vi.fn(),
      onPickFolders: vi.fn(),
      onPickImages: vi.fn(),
      onReload: vi.fn(),
      onRemoveAttachment: vi.fn(),
      onRetryResume: vi.fn(),
      onSteer: vi.fn(),
      onSubmit: vi.fn(),
      onThreadMessagesChange: vi.fn(),
      onToggleSelectedPin: vi.fn(),
      onTranscribeAudio: vi.fn()
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <SessionViewProvider value={tileView}>
            <ComposerScopeProvider
              value={{
                $awaitingInput: atom(false),
                $messages: tileMessages,
                attachments: mainComposerScope,
                target: 'tile:stored-tile'
              }}
            >
              <ChatView {...props} />
            </ComposerScopeProvider>
          </SessionViewProvider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(lastThreadIntro.current).toEqual(expect.objectContaining({ compact: true }))
  })
})
