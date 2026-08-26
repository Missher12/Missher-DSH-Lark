import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { LarkSettingsStatus } from './store.ts'
import type { LarkLocaleKey } from './locales.ts'
import css from './LarkSettingsSection.module.css'

interface Props {
  status: LarkSettingsStatus
  busy: boolean
  t: (key: LarkLocaleKey) => string
  run: (body: Record<string, unknown>) => Promise<void>
}

/** QR-first setup with a write-only manual credential fallback. */
export function OnboardingPanel({ status, busy, t, run }: Props) {
  const [qr, setQr] = useState<string>()
  const [manualOpen, setManualOpen] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const onboarding = status.onboarding

  useEffect(() => {
    let active = true
    if (onboarding.verificationUriComplete === undefined) {
      setQr(undefined)
      return () => { active = false }
    }
    void QRCode.toDataURL(onboarding.verificationUriComplete, { width: 220, margin: 1 })
      .then((value) => { if (active) setQr(value) })
      .catch(() => { if (active) setQr(undefined) })
    return () => { active = false }
  }, [onboarding.verificationUriComplete])

  const start = (): void => {
    void run({ action: 'start-onboarding', domain: status.domain })
  }
  const save = (): void => {
    const secret = appSecret
    setAppSecret('')
    void (async () => {
      await run({ action: 'set-credentials', appId: appId.trim(), appSecret: secret })
      await run({ action: 'enable' })
    })()
  }
  const pair = (): void => {
    const code = pairingCode.trim()
    setPairingCode('')
    void run({ action: 'pair', code })
  }

  return (
    <div className={css.onboarding}>
      <div className={css.heroCard}>
        <div className={css.heroCopy}>
          <span className={css.eyebrow}>{t('scanToConnect')}</span>
          <h3>{t('scanToConnect')}</h3>
          <p>{t('scanDescription')}</p>
        </div>
        <div className={css.brandMark} aria-hidden="true">飞</div>
      </div>

      <div className={css.regionRow}>
        <span>{t('region')}</span>
        <div className={css.segmented} role="group" aria-label={t('region')}>
          <button
            type="button" aria-pressed={status.domain === 'feishu'} disabled={busy}
            onClick={() => { void run({ action: 'set-domain', domain: 'feishu' }) }}
          >{t('feishuChina')}</button>
          <button
            type="button" aria-pressed={status.domain === 'lark'} disabled={busy}
            onClick={() => { void run({ action: 'set-domain', domain: 'lark' }) }}
          >{t('larkGlobal')}</button>
        </div>
      </div>

      {onboarding.state === 'pending' ? (
        <div className={css.qrPanel}>
          <div className={css.qrFrame}>
            {qr === undefined
              ? <div className={css.qrPlaceholder}>{t('qrPreparing')}</div>
              : <img src={qr} alt={t('qrCodeAlt')} width={220} height={220} />}
          </div>
          <div className={css.qrCopy}>
            <span className={css.liveDot}>{t('qrPending')}</span>
            {onboarding.userCode === undefined ? null : (
              <div className={css.userCode}><span>{t('userCode')}</span><strong>{onboarding.userCode}</strong></div>
            )}
            <ol className={css.steps}>
              <li>{t('scanStep1')}</li><li>{t('scanStep2')}</li><li>{t('scanStep3')}</li>
            </ol>
            <div className={css.inlineActions}>
              <button type="button" disabled={busy} onClick={start}>{t('regenerateQr')}</button>
              <button type="button" disabled={busy} onClick={() => { void run({ action: 'cancel-onboarding' }) }}>{t('cancelQr')}</button>
            </div>
          </div>
        </div>
      ) : onboarding.state === 'succeeded' ? (
        <div className={css.successPanel}>
          <span className={css.successIcon}>✓</span>
          <div><h3>{t('qrSucceeded')}</h3><p>{t('waitingFirstMessage')}</p></div>
        </div>
      ) : (
        <div className={css.startPanel}>
          <div>
            <strong>{onboarding.state === 'denied' ? t('qrDenied')
              : onboarding.state === 'expired' ? t('qrExpired')
                : onboarding.state === 'failed' ? t('qrFailed') : t('scanToConnect')}</strong>
            <span>{t('scanDescription')}</span>
          </div>
          <button type="button" className={css.primaryButton} disabled={busy} onClick={start}>{t('startQr')}</button>
        </div>
      )}

      <div className={css.fold}>
        <button
          type="button" className={css.foldButton} aria-expanded={manualOpen}
          onClick={() => { setManualOpen(value => !value) }}
        >{t('manualSetup')}<span aria-hidden="true">⌄</span></button>
        {manualOpen ? (
          <div className={css.manualPanel}>
            <p>{t('manualDescription')}</p>
            <div className={css.formGrid}>
              <label>{t('appId')}<input aria-label="appId" autoComplete="off" value={appId} onChange={(event) => { setAppId(event.target.value) }} /></label>
              <label>{t('appSecret')}<input aria-label="appSecret" type="password" autoComplete="new-password" value={appSecret} onChange={(event) => { setAppSecret(event.target.value) }} /></label>
            </div>
            <button type="button" disabled={busy || !appId.trim() || !appSecret} onClick={save}>{t('saveCredentials')}</button>
            <div className={css.pairingBox}>
              <p>{t('pairingHelp')}</p>
              <div className={css.inlineForm}>
                <label>{t('pairingCode')}<input aria-label="pairingCode" value={pairingCode} onChange={(event) => { setPairingCode(event.target.value) }} /></label>
                <button type="button" disabled={busy || !pairingCode.trim()} onClick={pair}>{t('pair')}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
