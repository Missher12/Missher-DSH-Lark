import { afterEach, describe, expect, test, vi } from 'vitest'
import { SelectionCardService, StreamingCardController, renderTurnCard } from '../src/cards.ts'
import type { TurnProjectionState } from '../src/projection.ts'
import type { BindingRecord, CallbackNonceRecord, OwnerRecord } from '../src/state.ts'

const state = (text: string, status: TurnProjectionState['status'] = 'streaming'): TurnProjectionState => ({
  sessionId: 'session-1', turn: 1, status, text, tools: [], approvals: [],
  startedAt: 1000, elapsedMs: 500,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('monotonic streaming card', () => {
  test('coalesces intermediate revisions and flushes terminal facts immediately', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const sendCard = vi.fn(async () => ({ messageId: 'om_card', chatId: 'oc_dm' }))
    const updateCard = vi.fn(async (_messageId: string, _card: unknown) => {})
    const sendText = vi.fn(async (_chatId: string, _text: string) => ({}))
    const controller = new StreamingCardController({
      sendCard, updateCard, sendText, throttleMs: 100,
    })
    const stream = await controller.open('oc_dm', state('', 'placeholder'))
    void stream.update(state('Hel'))
    void stream.update(state('Hello'))
    expect(updateCard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(updateCard).toHaveBeenCalledOnce()
    expect(JSON.stringify(updateCard.mock.calls[0]![1])).toContain('Hello')
    await vi.advanceTimersByTimeAsync(100)
    expect(updateCard).toHaveBeenCalledOnce()

    await stream.update({
      ...state('Hello', 'completed'), elapsedMs: 1500,
      model: { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'max' },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 },
      approvals: [{
        approvalId: 'approval-1', toolName: 'bash', status: 'pending',
        allowValue: { action: 'approve-once' }, denyValue: { action: 'deny' },
      }],
    }, true)
    expect(sendCard).toHaveBeenCalledOnce()
    expect(updateCard).toHaveBeenCalledTimes(2)
    const payloads = updateCard.mock.calls.map(call => JSON.stringify(call[1]))
    expect(payloads[1]).toContain('17')
    expect(payloads[1]).toContain('1.5s')
    expect(payloads[1]).toContain('deepseek-v4-flash')
    expect(payloads[1]).toContain('deepseek')
    expect(payloads[1]).toContain('max')
    expect(payloads[1]).toContain('输入 10')
    expect(payloads[1]).toContain('输出 5')
    expect(payloads[1]).toContain('缓存 2/0')
    expect(payloads[1]).toContain('允许一次')
    expect(payloads[1]).toContain('拒绝')
    expect(sendText).not.toHaveBeenCalled()
  })

  test('delivers the newest final state after at most one in-flight update', async () => {
    let releaseFirst!: () => void
    const updateCard = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve }))
      .mockResolvedValue(undefined)
    const controller = new StreamingCardController({
      sendCard: vi.fn(async () => ({ messageId: 'om_card', chatId: 'oc_dm' })),
      updateCard, sendText: vi.fn(async () => ({})), throttleMs: 0,
    })
    const stream = await controller.open('oc_dm', state(''))
    void stream.update(state('A'))
    await vi.waitFor(() => { expect(updateCard).toHaveBeenCalledOnce() })
    void stream.update(state('AB'))
    const final = stream.update(state('ABC', 'completed'), true)
    expect(updateCard).toHaveBeenCalledOnce()
    releaseFirst()
    await final
    expect(updateCard).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(updateCard.mock.calls[1]![1])).toContain('ABC')
    expect(JSON.stringify(updateCard.mock.calls[1]![1])).toContain('已完成')
  })

  test('cancels a deferred update when the stream stops', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const updateCard = vi.fn(async () => {})
    const controller = new StreamingCardController({
      sendCard: vi.fn(async () => ({ messageId: 'om_card', chatId: 'oc_dm' })),
      updateCard, sendText: vi.fn(async () => ({})), throttleMs: 100,
    })
    const stream = await controller.open('oc_dm', state(''))
    void stream.update(state('waiting'))
    stream.stop()
    await vi.advanceTimersByTimeAsync(100)
    expect(updateCard).not.toHaveBeenCalled()
  })

  test('ignores shrinking or stale revisions', async () => {
    const updateCard = vi.fn(async (_messageId: string, _card: unknown) => {})
    const controller = new StreamingCardController({
      sendCard: vi.fn(async () => ({ messageId: 'om_card', chatId: 'oc_dm' })),
      updateCard, sendText: vi.fn(async (_chatId: string, _text: string) => ({})), throttleMs: 0,
    })
    const stream = await controller.open('oc_dm', state('Hello'))
    await stream.update(state('Hel'))
    await stream.update(state('Hello!'))
    expect(updateCard).toHaveBeenCalledOnce()
    expect(JSON.stringify(updateCard.mock.calls[0]![1])).toContain('Hello!')
  })

  test('falls back to bounded text after card update failure', async () => {
    const sendText = vi.fn(async (_chatId: string, _text: string) => ({}))
    const controller = new StreamingCardController({
      sendCard: vi.fn(async () => ({ messageId: 'om_card', chatId: 'oc_dm' })),
      updateCard: vi.fn(async (_messageId: string, _card: unknown) => { throw new Error('card unavailable') }),
      sendText, throttleMs: 0,
    })
    const stream = await controller.open('oc_dm', state(''))
    await stream.update(state('x'.repeat(20_000)), true)
    await stream.update(state(`${'x'.repeat(20_000)}y`), true)
    expect(sendText).toHaveBeenCalledOnce()
    expect(sendText.mock.calls[0]![1].length).toBeLessThanOrEqual(4000)
  })

  test('renders unavailable usage truthfully', () => {
    expect(JSON.stringify(renderTurnCard(state('working')))).toContain('暂不可用')
  })

  test('renders answer-first content, a compact execution timeline, and explicit runtime facts', () => {
    const payload = renderTurnCard({
      ...state('最终回答'),
      tools: [
        { callId: 'c1', title: '检查仓库结构', kind: 'terminal', status: 'completed' },
        { callId: 'c2', title: '运行测试', kind: 'terminal', status: 'running' },
      ],
      model: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'max' },
      usage: { inputTokens: 10_400, outputTokens: 2_400, cacheReadTokens: 800 },
    })
    const rendered = JSON.stringify(payload)
    expect(rendered.indexOf('最终回答')).toBeLessThan(rendered.indexOf('执行过程'))
    expect(rendered).toContain('检查仓库结构')
    expect(rendered).toContain('运行测试')
    expect(rendered).toContain('deepseek-v4')
    expect(rendered).toContain('输入 10.4k')
    expect(rendered).toContain('输出 2.4k')
    expect(rendered).toContain('缓存 800/0')
    expect(rendered).not.toContain('raw-secret')
    expect((payload as { elements: Array<{ tag: string }> }).elements.map(element => element.tag))
      .toEqual(['markdown', 'hr', 'markdown', 'note'])
  })

  test('shows only the latest eight projected tool facts', () => {
    const payload = renderTurnCard({
      ...state('完成'),
      tools: Array.from({ length: 10 }, (_, index) => ({
        callId: `c${index}`, title: `步骤 ${index}`, kind: 'terminal', status: 'completed' as const,
      })),
    })
    const rendered = JSON.stringify(payload)
    expect(rendered).not.toContain('步骤 0')
    expect(rendered).not.toContain('步骤 1')
    expect(rendered).toContain('步骤 2')
    expect(rendered).toContain('10 / 10 完成')
  })

  test('shows turn controls only while the turn can still be changed', () => {
    const controls = {
      steer: { nonce: 'steer', action: 'steer-help', generation: 1 },
      stop: { nonce: 'stop', action: 'stop-turn', generation: 1 },
    }
    const streaming = JSON.stringify(renderTurnCard({ ...state('进行中'), controls }))
    expect(streaming).toContain('插话')
    expect(streaming).toContain('停止')
    expect(streaming).toContain('steer-help')
    expect(streaming).toContain('stop-turn')
    const completed = JSON.stringify(renderTurnCard({ ...state('完成', 'completed'), controls }))
    expect(completed).not.toContain('steer-help')
    expect(completed).not.toContain('stop-turn')
  })
})

const owner: OwnerRecord = {
  id: 'owner', openId: 'ou_owner', chatId: 'oc_dm', generation: 1,
  pairedAt: 1000, updatedAt: 1000,
}

const bindingRecord: BindingRecord = {
  id: 'owner', ownerOpenId: owner.openId, chatId: owner.chatId,
  workspaceId: 'workspace-1', projectPath: '/project', sessionId: 'session-secret',
  generation: 1, state: 'active', boundAt: 1000, updatedAt: 1000,
}

const visibleCardText = (card: unknown): string => {
  const root = card as { header?: { title?: { content?: string } }; elements?: Array<Record<string, unknown>> }
  const text = [root.header?.title?.content ?? '']
  for (const element of root.elements ?? []) {
    if (element.tag === 'markdown' && typeof element.content === 'string') text.push(element.content)
    if (element.tag !== 'action' || !Array.isArray(element.actions)) continue
    for (const action of element.actions) {
      const content = (action as { text?: { content?: string } }).text?.content
      if (content !== undefined) text.push(content)
    }
  }
  return text.join('\n')
}

function selectionHarness() {
  let current: BindingRecord | undefined = bindingRecord
  let issued = 0
  const transport = {
    sendCard: vi.fn(async (_chatId: string, _card: unknown) => ({})),
    sendText: vi.fn(async (_chatId: string, _text: string) => ({})),
  }
  const binding = {
    listProjects: vi.fn(async () => [{ workspaceId: 'workspace-1', title: 'Harness', path: '/project' }]),
    listSessions: vi.fn(async () => [
      {
        sessionId: 'session-secret', title: '回复卡片排版优化', updatedAt: 1000,
        running: true, blank: false, cwd: '/project',
      },
      {
        sessionId: 'untitled-secret', updatedAt: 900,
        running: false, blank: false, cwd: '/project',
      },
    ]),
    active: vi.fn(async () => current),
    bind: vi.fn(async (_workspaceId: string, sessionId: string) => {
      current = { ...bindingRecord, sessionId, generation: 2 }
      return current
    }),
    describe: vi.fn(async (record: BindingRecord) => ({
      projectTitle: 'Harness', projectPath: record.projectPath,
      sessionTitle: record.sessionId === 'session-secret' ? '回复卡片排版优化' : '未命名会话',
    })),
  }
  const identity = {
    owner: vi.fn(async () => owner),
    issueAction: vi.fn(async (
      action: CallbackNonceRecord['action'], generation: number, _ttl: number, data?: Record<string, string>,
    ) => ({
      nonce: `nonce-${++issued}`, action, generation, ...(data === undefined ? {} : { data }),
    })),
    admitAction: vi.fn(async ({ value }: { value: {
      action: CallbackNonceRecord['action']
      generation: number
      data?: Record<string, string>
    } }) => ({
      id: 'nonce', ownerOpenId: owner.openId, chatId: owner.chatId,
      generation: value.generation, action: value.action, data: value.data,
      expiresAt: 2000, createdAt: 1000, usedAt: 1100,
    })),
  }
  return {
    service: new SelectionCardService(binding as never, identity as never, transport),
    binding, identity, transport,
  }
}

describe('name-first project and Session selection cards', () => {
  test('keeps Session ids only in signed action payloads', async () => {
    const h = selectionHarness()
    await h.service.handleAction({
      openId: owner.openId,
      value: {
        nonce: 'select-project', action: 'select-project', generation: 1,
        data: { workspaceId: 'workspace-1' },
      },
    })
    const sessionCard = h.transport.sendCard.mock.calls.at(-1)?.[1]
    expect(visibleCardText(sessionCard)).toContain('回复卡片排版优化')
    expect(visibleCardText(sessionCard)).toContain('未命名会话')
    expect(visibleCardText(sessionCard)).not.toContain('session-secret')
    expect(visibleCardText(sessionCard)).not.toContain('untitled-secret')
    expect(JSON.stringify(sessionCard)).toContain('session-secret')

    await h.service.handleAction({
      openId: owner.openId,
      value: {
        nonce: 'select-session', action: 'select-session', generation: 1,
        data: { workspaceId: 'workspace-1', sessionId: 'session-secret' },
      },
    })
    expect(h.transport.sendText.mock.calls.at(-1)?.[1]).toContain('回复卡片排版优化')
    expect(h.transport.sendText.mock.calls.at(-1)?.[1]).not.toContain('session-secret')
  })

  test('offers a signed cancel action that preserves the active binding', async () => {
    const h = selectionHarness()
    await h.service.sendProjectCard({
      eventId: 'event-1', messageId: 'message-1', openId: owner.openId,
      chatId: owner.chatId, text: '/',
    })
    const projectCard = h.transport.sendCard.mock.calls.at(-1)?.[1]
    expect(visibleCardText(projectCard)).toContain('暂不进入项目')
    expect(h.identity.issueAction).toHaveBeenCalledWith('cancel-selection', 1, 5 * 60_000)

    const before = await h.binding.active()
    await h.service.handleAction({
      openId: owner.openId,
      value: { nonce: 'cancel', action: 'cancel-selection', generation: 1 },
    })
    expect(await h.binding.active()).toEqual(before)
    expect(h.binding.bind).not.toHaveBeenCalled()
    expect(h.transport.sendText.mock.calls.at(-1)?.[1]).toContain('保持不变')
  })
})
