// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, NS } from '../src/client/index.tsx'
import { LarkSettingsSection, type LarkSettingsInjected } from '../src/client/LarkSettingsSection.tsx'
import type { LarkSettingsStatus } from '../src/client/store.ts'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,cXItY29kZQ==') },
}))

afterEach(cleanup)

describe('Harness Lark settings section', () => {
  test('registers one localized settings.section entry', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({ name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never, () => null)
    await ctx.plugin({ inject: ['slots', 'locale'], apply }).await()
    const entry = slots.entries('settings.section')[0]!
    expect(entry.options).toMatchObject({ id: 'lark' })
    expect(entry.component).toBe(LarkSettingsSection)
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('Lark Remote Development')
    locale.setLocale('zh')
    expect(resolveSlotLabel(slots.entries('settings.section')[0]!.options.label)).toBe('飞书远程开发')
    await ctx.fiber.dispose()
  })

  test('paints a stable placeholder before loading and starts QR onboarding', async () => {
    let resolveStatus!: (value: LarkSettingsStatus) => void
    const load = vi.fn(() => new Promise<LarkSettingsStatus>((resolve) => { resolveStatus = resolve }))
    const action = vi.fn(async () => ({
      enabled: false, connected: false, queuePaused: false, queueDepth: 0,
      credentials: {}, pairing: 'unpaired', domain: 'feishu' as const,
      onboarding: { state: 'idle' as const }, binding: null,
    }))
    const props: LarkSettingsInjected = { load, action }
    render(<LarkSettingsSection {...props} t={(key: string) => key} />)
    expect(screen.getByTestId('lark-settings-placeholder')).toBeTruthy()
    resolveStatus({
      enabled: false, connected: false, queuePaused: false, queueDepth: 0,
      credentials: {}, pairing: 'unpaired', domain: 'feishu',
      onboarding: { state: 'idle' }, binding: null,
    })
    expect(await screen.findByText('startQr')).toBeTruthy()
    fireEvent.click(screen.getByText('startQr'))
    expect(action).toHaveBeenCalledWith({ action: 'start-onboarding', domain: 'feishu' })
  })

  test('renders QR progress and never exposes the registration URL as text', async () => {
    const url = 'https://accounts.feishu.cn/verify?code=USER-CODE'
    render(<LarkSettingsSection
      load={async () => ({
        enabled: false, connected: false, queuePaused: false, queueDepth: 0,
        credentials: {}, pairing: 'unpaired', domain: 'feishu', binding: null,
        onboarding: {
          state: 'pending', verificationUriComplete: url,
          userCode: 'USER-CODE', expiresAt: Date.now() + 60_000,
        },
      })}
      action={vi.fn(async () => ({}))}
      t={(key: string) => key}
    />)
    expect((await screen.findByAltText('qrCodeAlt')).getAttribute('src'))
      .toBe('data:image/png;base64,cXItY29kZQ==')
    expect(screen.getByText('USER-CODE')).toBeTruthy()
    expect(screen.queryByText(url)).toBeNull()
  })

  test('shows a name-first connected dashboard and keeps maintenance collapsed', async () => {
    render(<LarkSettingsSection
      load={async () => ({
        enabled: true, connected: true, queuePaused: false, queueDepth: 2,
        credentials: { appId: true, appSecret: true }, pairing: 'paired', domain: 'feishu',
        onboarding: { state: 'succeeded' },
        binding: {
          projectTitle: 'DeepSeek Harness', projectPath: '/Users/missher/Harness',
          sessionTitle: '飞书插件独立发布',
        },
      })}
      action={vi.fn(async () => ({}))}
      t={(key: string) => key}
    />)
    expect(await screen.findByText('飞书插件独立发布')).toBeTruthy()
    expect(screen.getByText('DeepSeek Harness')).toBeTruthy()
    expect(screen.queryByText('session-secret')).toBeNull()
    expect(screen.getByText('advancedMaintenance').getAttribute('aria-expanded')).toBe('false')
  })

  test('keeps manual secrets write-only and confirms destructive actions', async () => {
    const status: LarkSettingsStatus = {
      enabled: false, connected: false, queuePaused: true, queueDepth: 0,
      credentials: {}, pairing: 'unpaired', domain: 'feishu',
      onboarding: { state: 'idle' }, binding: null,
    }
    const action = vi.fn(async () => status)
    render(<LarkSettingsSection load={async () => status} action={action} t={(key: string) => key} />)
    expect(await screen.findByText('startQr')).toBeTruthy()
    fireEvent.click(screen.getByText('manualSetup'))
    const secret = screen.getByLabelText('appSecret')
    expect((secret as HTMLInputElement).type).toBe('password')
    fireEvent.change(screen.getByLabelText('appId'), { target: { value: 'cli_value' } })
    fireEvent.change(secret, { target: { value: 'secret-value' } })
    fireEvent.click(screen.getByText('saveCredentials'))
    expect(action).toHaveBeenCalledWith({ action: 'set-credentials', appId: 'cli_value', appSecret: 'secret-value' })
    expect(screen.queryByDisplayValue('secret-value')).toBeNull()
    await waitFor(() => { expect(action).toHaveBeenCalledWith({ action: 'enable' }) })
    fireEvent.change(screen.getByLabelText('pairingCode'), { target: { value: 'ABCD-1234' } })
    fireEvent.click(screen.getByText('pair'))
    expect(action).toHaveBeenCalledWith({ action: 'pair', code: 'ABCD-1234' })
    expect(screen.queryByDisplayValue('ABCD-1234')).toBeNull()

    await waitFor(() => { expect(screen.queryByText('busy')).toBeNull() })
    fireEvent.click(screen.getByText('advancedMaintenance'))
    expect(screen.getByText('advancedMaintenance').getAttribute('aria-expanded')).toBe('true')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await waitFor(() => { expect((screen.getByText('clear') as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByText('clear'))
    expect(action).toHaveBeenCalledWith({ action: 'clear', confirm: true })
    await waitFor(() => { expect(screen.queryByDisplayValue('secret-value')).toBeNull() })
  })
})
