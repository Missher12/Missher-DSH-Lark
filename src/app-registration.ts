/** Supported official account domain for QR app registration. */
export type LarkDomain = 'feishu' | 'lark'

/** Browser-safe onboarding state. Credential values never enter this type. */
export type AppRegistrationStatus =
  | { state: 'idle' }
  | {
    state: 'pending'
    domain: LarkDomain
    verificationUriComplete: string
    userCode: string
    expiresAt: number
  }
  | { state: 'succeeded'; domain: LarkDomain }
  | { state: 'denied' | 'expired' | 'failed'; domain: LarkDomain; errorCode: string }

/** Secret-bearing registration result consumed only by the Host callback. */
export interface AppRegistrationCredentials {
  appId: string
  appSecret: string
  domain: LarkDomain
  ownerOpenId: string
}

type PollTimer = unknown
type PollCallback = () => Promise<void>

interface AppRegistrationOptions {
  fetcher?: typeof fetch
  saveCredentials(value: AppRegistrationCredentials): Promise<void>
  now?: () => number
  setTimer?: (callback: PollCallback, ms: number) => PollTimer
  clearTimer?: (timer: PollTimer) => void
}

type UnknownRecord = Record<string, unknown>

const accounts: Record<LarkDomain, string> = {
  feishu: 'https://accounts.feishu.cn',
  lark: 'https://accounts.larksuite.com',
}

const record = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null ? value as UnknownRecord : undefined

const string = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

const boundedSeconds = (value: unknown, fallback: number, maximum: number): number =>
  Math.min(maximum, Math.max(1, Math.round(positiveNumber(value) ?? fallback)))

const qrUrl = (value: string): string => {
  const url = new URL(value)
  url.searchParams.set('from', 'onboard')
  return url.toString()
}

/** Minimal independent implementation of the official App Registration device flow. */
export class AppRegistrationController {
  private readonly fetcher: typeof fetch
  private readonly now: () => number
  private readonly setTimer: (callback: PollCallback, ms: number) => PollTimer
  private readonly clearTimer: (timer: PollTimer) => void
  private current: AppRegistrationStatus = { state: 'idle' }
  private abort: AbortController | undefined
  private timer: PollTimer | undefined
  private epoch = 0
  private deviceCode: string | undefined
  private intervalSeconds = 5

  constructor(private readonly options: AppRegistrationOptions) {
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? Date.now
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(() => { void callback() }, ms))
    this.clearTimer = options.clearTimer ?? ((timer) => { clearTimeout(timer as ReturnType<typeof setTimeout>) })
  }

  /**
   * Begin a fresh QR registration attempt.
   * @param domain - Feishu China or international Lark account domain.
   */
  async start(domain: LarkDomain): Promise<void> {
    this.abortRun()
    const epoch = this.epoch
    const signal = this.abort?.signal
    if (signal === undefined) return
    try {
      const init = await this.post(domain, new URLSearchParams({ action: 'init' }), signal, false)
      const methods = Array.isArray(init.supported_auth_methods) ? init.supported_auth_methods : []
      if (!methods.includes('client_secret')) {
        this.fail(epoch, domain, 'client_secret_unsupported')
        return
      }
      const begin = await this.post(domain, new URLSearchParams({
        action: 'begin', archetype: 'PersonalAgent', auth_method: 'client_secret',
        request_user_info: 'open_id',
      }), signal, false)
      const deviceCode = string(begin.device_code)
      const verificationUriComplete = string(begin.verification_uri_complete)
      const userCode = string(begin.user_code)
      if (deviceCode === undefined || verificationUriComplete === undefined || userCode === undefined) {
        this.fail(epoch, domain, 'registration_response_invalid')
        return
      }
      this.deviceCode = deviceCode
      this.intervalSeconds = boundedSeconds(begin.interval, 5, 60)
      const expiresIn = boundedSeconds(begin.expire_in, 600, 1800)
      this.current = {
        state: 'pending', domain,
        verificationUriComplete: qrUrl(verificationUriComplete),
        userCode, expiresAt: this.now() + expiresIn * 1000,
      }
      this.schedule(epoch, this.intervalSeconds * 1000)
    } catch {
      if (!signal.aborted) this.fail(epoch, domain, 'registration_request_failed')
    }
  }

  /** Cancel an active attempt and remove its QR facts from public state. */
  cancel(): void {
    this.stopRun()
    this.current = { state: 'idle' }
  }

  /** Return a detached browser-safe registration status. */
  status(): AppRegistrationStatus {
    return structuredClone(this.current)
  }

  /** Abort pending network and timer resources during plugin disposal. */
  dispose(): void {
    this.cancel()
  }

  private abortRun(): void {
    this.stopRun()
    this.abort = new AbortController()
  }

  private stopRun(): void {
    this.epoch += 1
    this.abort?.abort()
    this.abort = undefined
    if (this.timer !== undefined) this.clearTimer(this.timer)
    this.timer = undefined
    this.deviceCode = undefined
  }

  private schedule(epoch: number, delayMs: number): void {
    if (epoch !== this.epoch || this.abort?.signal.aborted === true) return
    this.timer = this.setTimer(async () => {
      this.timer = undefined
      await this.poll(epoch)
    }, delayMs)
  }

  private async poll(epoch: number): Promise<void> {
    if (epoch !== this.epoch || this.current.state !== 'pending' || this.deviceCode === undefined) return
    const signal = this.abort?.signal
    if (signal === undefined || signal.aborted) return
    const pending = this.current
    if (this.now() >= pending.expiresAt) {
      this.finish({ state: 'expired', domain: pending.domain, errorCode: 'expired_token' })
      return
    }
    try {
      const value = await this.post(pending.domain, new URLSearchParams({
        action: 'poll', device_code: this.deviceCode,
      }), signal, true)
      if (epoch !== this.epoch || signal.aborted) return
      const userInfo = record(value.user_info)
      const tenantBrand = userInfo?.tenant_brand
      const domain: LarkDomain = tenantBrand === 'lark' ? 'lark' : pending.domain
      if (domain !== pending.domain) this.current = { ...pending, domain }
      const appId = string(value.client_id)
      const appSecret = string(value.client_secret)
      const ownerOpenId = string(userInfo?.open_id)
      if (appId !== undefined && appSecret !== undefined && ownerOpenId !== undefined) {
        await this.options.saveCredentials({ appId, appSecret, domain, ownerOpenId })
        if (epoch === this.epoch) this.finish({ state: 'succeeded', domain })
        return
      }
      const error = string(value.error)
      if (error === undefined || error === 'authorization_pending') {
        this.schedule(epoch, domain === pending.domain ? this.intervalSeconds * 1000 : 0)
        return
      }
      if (error === 'slow_down') {
        this.intervalSeconds = Math.min(60, this.intervalSeconds + 5)
        this.schedule(epoch, this.intervalSeconds * 1000)
        return
      }
      if (error === 'access_denied') {
        this.finish({ state: 'denied', domain, errorCode: error })
        return
      }
      if (error === 'expired_token') {
        this.finish({ state: 'expired', domain, errorCode: error })
        return
      }
      this.finish({ state: 'failed', domain, errorCode: 'registration_failed' })
    } catch {
      if (!signal.aborted) this.finish({
        state: 'failed', domain: pending.domain, errorCode: 'registration_request_failed',
      })
    }
  }

  private finish(status: Exclude<AppRegistrationStatus, { state: 'idle' | 'pending' }>): void {
    const timer = this.timer
    this.timer = undefined
    if (timer !== undefined) this.clearTimer(timer)
    this.deviceCode = undefined
    this.current = status
  }

  private fail(epoch: number, domain: LarkDomain, errorCode: string): void {
    if (epoch !== this.epoch) return
    this.finish({ state: 'failed', domain, errorCode })
  }

  private async post(
    domain: LarkDomain,
    body: URLSearchParams,
    signal: AbortSignal,
    acceptErrorBody: boolean,
  ): Promise<UnknownRecord> {
    const response = await this.fetcher(`${accounts[domain]}/oauth/v1/app/registration`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body, signal,
    })
    const value: unknown = await response.json()
    const result = record(value)
    if (result === undefined || (!response.ok && !acceptErrorBody)) {
      throw new Error('registration-request-failed')
    }
    return result
  }
}
