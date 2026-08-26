import { describe, expect, test, vi } from 'vitest'
import { TurnControlService } from '../src/turn-controls.ts'
import type { CallbackNonceRecord, OwnerRecord } from '../src/state.ts'

const owner: OwnerRecord = {
  id: 'owner', openId: 'ou_owner', chatId: 'oc_dm', generation: 1,
  pairedAt: 1000, updatedAt: 1000,
}

function harness() {
  const used = new Set<string>()
  let issued = 0
  const transport = { sendText: vi.fn(async () => ({})) }
  const stop = vi.fn(async () => true)
  const identity = {
    owner: vi.fn(async () => owner),
    issueAction: vi.fn(async (
      action: CallbackNonceRecord['action'], generation: number, _ttl: number,
      data?: Record<string, string>,
    ) => ({ nonce: `nonce-${++issued}`, action, generation, ...(data === undefined ? {} : { data }) })),
    admitAction: vi.fn(async ({ value }: { value: {
      nonce: string
      action: CallbackNonceRecord['action']
      generation: number
      data?: Record<string, string>
    } }) => {
      if (used.has(value.nonce)) throw new Error('Lark card action nonce was already used')
      used.add(value.nonce)
      return {
        id: value.nonce, ownerOpenId: owner.openId, chatId: owner.chatId,
        generation: value.generation, action: value.action, data: value.data,
        expiresAt: 2000, createdAt: 1000, usedAt: 1100,
      }
    }),
  }
  return {
    service: new TurnControlService({ identity, transport, stop }),
    identity, transport, stop,
  }
}

describe('signed turn card controls', () => {
  test('issues owner-bound controls for the exact current turn', async () => {
    const h = harness()
    const values = await h.service.issue(1, { sessionId: 'session-1', turn: 7 })
    expect(values.steer).toMatchObject({
      action: 'steer-help', data: { sessionId: 'session-1', turn: '7' },
    })
    expect(values.stop).toMatchObject({
      action: 'stop-turn', data: { sessionId: 'session-1', turn: '7' },
    })
  })

  test('shows steer instructions, stops once, and rejects a replay', async () => {
    const h = harness()
    const values = await h.service.issue(1, { sessionId: 'session-1', turn: 7 })
    await h.service.handle({ openId: owner.openId, value: values.steer })
    expect(h.transport.sendText).toHaveBeenCalledWith('oc_dm', '请发送 /插话 <内容>')
    await h.service.handle({ openId: owner.openId, value: values.stop })
    expect(h.stop).toHaveBeenCalledWith({ sessionId: 'session-1', turn: '7' })
    await expect(h.service.handle({ openId: owner.openId, value: values.stop })).rejects.toThrow(/used/)
  })

  test('does not stop a newer turn from a stale card', async () => {
    const h = harness()
    h.stop.mockResolvedValueOnce(false)
    const values = await h.service.issue(1, { sessionId: 'session-old', turn: 1 })
    await h.service.handle({ openId: owner.openId, value: values.stop })
    expect(h.transport.sendText).toHaveBeenCalledWith('oc_dm', '这个轮次已经结束，没有停止新的任务。')
  })
})
