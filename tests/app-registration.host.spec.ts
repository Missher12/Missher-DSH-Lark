import { describe, expect, test, vi } from 'vitest'
import { AppRegistrationController } from '../src/app-registration.ts'

const response = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

function scheduler() {
  let next: (() => Promise<void>) | undefined
  return {
    setTimer: vi.fn((callback: () => Promise<void>, _ms: number) => {
      next = callback
      return 1
    }),
    clearTimer: vi.fn(() => { next = undefined }),
    tick: async () => {
      const callback = next
      next = undefined
      if (callback === undefined) throw new Error('no scheduled poll')
      await callback()
    },
  }
}

describe('Feishu App Registration device flow', () => {
  test('publishes only QR-safe state and saves the secret directly to the Host', async () => {
    const timer = scheduler()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ nonce: 'nonce', supported_auth_methods: ['client_secret'] }))
      .mockResolvedValueOnce(response({
        device_code: 'device-code', verification_uri: 'https://accounts.feishu.cn/verify',
        user_code: 'USER-CODE', verification_uri_complete: 'https://accounts.feishu.cn/verify?code=USER-CODE',
        interval: 1, expire_in: 600,
      }))
      .mockResolvedValueOnce(response({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(response({
        client_id: 'cli_created', client_secret: 'client-secret-value',
        user_info: { open_id: 'ou_scanner', tenant_brand: 'feishu' },
      }))
    const saveCredentials = vi.fn(async () => {})
    const controller = new AppRegistrationController({
      fetcher, saveCredentials, now: () => 1000,
      setTimer: timer.setTimer, clearTimer: timer.clearTimer,
    })

    await controller.start('feishu')
    expect(controller.status()).toMatchObject({
      state: 'pending', domain: 'feishu', userCode: 'USER-CODE', expiresAt: 601_000,
    })
    expect(controller.status()).toHaveProperty('verificationUriComplete')
    expect(JSON.stringify(controller.status())).not.toContain('client-secret-value')
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toBe('action=init')
    expect(String(fetcher.mock.calls[1]?.[1]?.body)).toContain('archetype=PersonalAgent')
    expect(String(fetcher.mock.calls[1]?.[1]?.body)).toContain('request_user_info=open_id')

    await timer.tick()
    expect(controller.status().state).toBe('pending')
    await timer.tick()
    expect(saveCredentials).toHaveBeenCalledWith({
      appId: 'cli_created', appSecret: 'client-secret-value',
      domain: 'feishu', ownerOpenId: 'ou_scanner',
    })
    expect(controller.status()).toMatchObject({ state: 'succeeded', domain: 'feishu' })
    expect(JSON.stringify(controller.status())).not.toContain('client-secret-value')
  })

  test('switches to the scanner tenant domain without exposing response details', async () => {
    const timer = scheduler()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ supported_auth_methods: ['client_secret'] }))
      .mockResolvedValueOnce(response({
        device_code: 'device', verification_uri: 'https://accounts.feishu.cn/verify',
        user_code: 'CODE', verification_uri_complete: 'https://accounts.feishu.cn/verify?code=CODE',
        interval: 1, expire_in: 600,
      }))
      .mockResolvedValueOnce(response({
        error: 'authorization_pending', user_info: { tenant_brand: 'lark' },
      }, 400))
      .mockResolvedValueOnce(response({ error: 'access_denied', error_description: 'raw-secret' }, 400))
    const controller = new AppRegistrationController({
      fetcher, saveCredentials: vi.fn(async () => {}), now: () => 1000,
      setTimer: timer.setTimer, clearTimer: timer.clearTimer,
    })
    await controller.start('feishu')
    await timer.tick()
    expect(controller.status()).toMatchObject({ state: 'pending', domain: 'lark' })
    await timer.tick()
    expect(fetcher.mock.calls[3]?.[0]).toBe('https://accounts.larksuite.com/oauth/v1/app/registration')
    expect(controller.status()).toMatchObject({ state: 'denied', domain: 'lark', errorCode: 'access_denied' })
    expect(JSON.stringify(controller.status())).not.toContain('raw-secret')
  })

  test('cancels polling and resets public state', async () => {
    const timer = scheduler()
    const controller = new AppRegistrationController({
      fetcher: vi.fn<typeof fetch>()
        .mockResolvedValueOnce(response({ supported_auth_methods: ['client_secret'] }))
        .mockResolvedValueOnce(response({
          device_code: 'device', verification_uri: 'https://accounts.feishu.cn/verify',
          user_code: 'CODE', verification_uri_complete: 'https://accounts.feishu.cn/verify?code=CODE',
          interval: 1, expire_in: 600,
        })),
      saveCredentials: vi.fn(async () => {}),
      setTimer: timer.setTimer, clearTimer: timer.clearTimer,
    })
    await controller.start('feishu')
    controller.cancel()
    expect(controller.status()).toEqual({ state: 'idle' })
    expect(timer.clearTimer).toHaveBeenCalled()
  })
})
