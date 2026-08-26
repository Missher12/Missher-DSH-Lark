import { useCallback, useEffect, useState } from 'react'
import type { LarkSettingsStatus } from './store.ts'
import type { LarkLocaleKey } from './locales.ts'
import { OnboardingPanel } from './OnboardingPanel.tsx'
import { ConnectedDashboard, MaintenancePanel } from './ConnectedDashboard.tsx'
import css from './LarkSettingsSection.module.css'

/** Host actions injected into the Lark settings slot. */
export interface LarkSettingsInjected {
  load: () => Promise<LarkSettingsStatus>
  action: (body: Record<string, unknown>) => Promise<unknown>
}

interface Props extends LarkSettingsInjected {
  t: (key: LarkLocaleKey) => string
}

const isStatus = (value: unknown): value is LarkSettingsStatus => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<LarkSettingsStatus>
  return typeof candidate.enabled === 'boolean'
    && typeof candidate.connected === 'boolean'
    && (candidate.domain === 'feishu' || candidate.domain === 'lark')
    && typeof candidate.onboarding === 'object' && candidate.onboarding !== null
}

const SettingsPlaceholder = ({ t }: Pick<Props, 't'>) => (
  <section className={css.root} data-lark-settings data-testid="lark-settings-placeholder">
    <header className={css.pageHeader}><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></header>
    <div className={css.placeholderHero}><span /><span /><span /></div>
    <div className={css.placeholderGrid}><span /><span /><span /></div>
  </section>
)

export function LarkSettingsSection({ t, load, action }: Props) {
  const [status, setStatus] = useState<LarkSettingsStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await load()
      setStatus(next)
      setError(undefined)
    } catch {
      setError(t('loadFailed'))
    }
  }, [load, t])

  useEffect(() => {
    let active = true
    void load().then((next) => {
      if (active) setStatus(next)
    }).catch(() => {
      if (active) setError(t('loadFailed'))
    })
    return () => { active = false }
  }, [load, t])

  useEffect(() => {
    if (status?.onboarding.state !== 'pending') return
    const timer = window.setInterval(() => { void refresh() }, 1000)
    return () => { window.clearInterval(timer) }
  }, [refresh, status?.onboarding.state])

  const run = useCallback(async (body: Record<string, unknown>): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const value = await action(body)
      if (isStatus(value)) setStatus(value)
      else await refresh()
    } catch {
      setError(t('actionFailed'))
    } finally {
      setBusy(false)
    }
  }, [action, refresh, t])

  if (status === null) return <SettingsPlaceholder t={t} />

  return (
    <section className={css.root} data-lark-settings>
      <header className={css.pageHeader}>
        <div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div>
        {busy ? <span className={css.busyBadge}>{t('busy')}</span> : null}
      </header>

      {error === undefined ? null : (
        <div className={css.alert} role="alert">
          <span>{error}</span><button type="button" onClick={() => { void refresh() }}>{t('retry')}</button>
        </div>
      )}

      {status.pairing === 'paired'
        ? <ConnectedDashboard status={status} busy={busy} t={t} run={run} />
        : (
          <>
            <OnboardingPanel status={status} busy={busy} t={t} run={run} />
            <MaintenancePanel status={status} busy={busy} t={t} run={run} />
          </>
        )}
    </section>
  )
}
