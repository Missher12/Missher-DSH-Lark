import type { CardActionValue, IdentityService } from './identity.ts'

/** Exact non-visible turn identity carried only inside a signed card action. */
export interface TurnActionTarget {
  sessionId: string
  turn: string
}

/** Signed actions rendered on a mutable turn card. */
export interface TurnControlValues {
  steer: CardActionValue
  stop: CardActionValue
}

interface TurnControlDependencies {
  identity: Pick<IdentityService, 'owner' | 'issueAction' | 'admitAction'>
  transport: { sendText(chatId: string, text: string): Promise<unknown> }
  stop(target: TurnActionTarget): Promise<boolean | void>
}

/** Owner-bound, one-use steer-help and exact-turn stop actions. */
export class TurnControlService {
  constructor(private readonly deps: TurnControlDependencies) {}

  /**
   * Issue controls for one exact active turn.
   * @param generation - Current paired-owner generation.
   * @param target - Internal target carried only in the signed value.
   * @returns Signed steer and stop values.
   */
  async issue(
    generation: number,
    target: { sessionId: string; turn: number },
  ): Promise<TurnControlValues> {
    const data = { sessionId: target.sessionId, turn: String(target.turn) }
    const [steer, stop] = await Promise.all([
      this.deps.identity.issueAction('steer-help', generation, 10 * 60_000, data),
      this.deps.identity.issueAction('stop-turn', generation, 10 * 60_000, data),
    ])
    return { steer, stop }
  }

  /**
   * Consume and execute one signed turn control.
   * @param input - Acting owner and returned card value.
   */
  async handle(input: { openId: string; value: CardActionValue }): Promise<void> {
    const owner = await this.deps.identity.owner()
    if (owner === undefined) throw new Error('Lark owner is not paired')
    const action = await this.deps.identity.admitAction({
      openId: input.openId, chatId: owner.chatId, value: input.value,
    })
    if (action.action === 'steer-help') {
      await this.deps.transport.sendText(owner.chatId, '请发送 /插话 <内容>')
      return
    }
    if (action.action !== 'stop-turn') return
    const sessionId = action.data?.sessionId
    const turn = action.data?.turn
    if (sessionId === undefined || turn === undefined) throw new Error('Lark turn target is missing')
    const stopped = await this.deps.stop({ sessionId, turn })
    if (stopped === false) {
      await this.deps.transport.sendText(owner.chatId, '这个轮次已经结束，没有停止新的任务。')
    }
  }
}
