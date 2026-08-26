import { useState } from 'react'
import type { LarkSettingsStatus } from './store.ts'
import type { LarkLocaleKey } from './locales.ts'
import css from './LarkSettingsSection.module.css'

interface CommonProps {
  status: LarkSettingsStatus
  busy: boolean
  t: (key: LarkLocaleKey) => string
  run: (body: Record<string, unknown>) => Promise<void>
}

/** Advanced reversible and destructive plugin-only operations. */
export function MaintenancePanel({ status, busy, t, run }: CommonProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className={css.maintenance}>
      <button
        type="button" className={css.foldButton} aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >{t('advancedMaintenance')}<span aria-hidden="true">⌄</span></button>
      {open ? (
        <div className={css.maintenanceBody}>
          <button type="button" disabled={busy} onClick={() => { void run({ action: 'test' }) }}>{t('testConnection')}</button>
          <button type="button" disabled={busy || !status.queuePaused} onClick={() => { void run({ action: 'resume' }) }}>{t('resume')}</button>
          <button type="button" disabled={busy} onClick={() => { void run({ action: 'cleanup' }) }}>{t('cleanup')}</button>
          <button type="button" disabled={busy} onClick={() => { void run({ action: status.enabled ? 'disable' : 'enable' }) }}>
            {status.enabled ? t('disable') : t('enable')}
          </button>
          <button
            type="button" disabled={busy}
            onClick={() => { if (window.confirm(t('confirmRepair'))) void run({ action: 'repair', confirm: true }) }}
          >{t('repair')}</button>
          <button
            type="button" className={css.dangerButton} disabled={busy}
            onClick={() => { if (window.confirm(t('confirmClear'))) void run({ action: 'clear', confirm: true }) }}
          >{t('clear')}</button>
        </div>
      ) : null}
    </div>
  )
}

/** Paired plugin status with project and Session display names only. */
export function ConnectedDashboard({ status, busy, t, run }: CommonProps) {
  const binding = status.binding
  return (
    <div className={css.dashboard}>
      <div className={css.readyHeader}>
        <div className={css.readyIcon}>✓</div>
        <div><h3>{t('connectedTitle')}</h3><p>{t('standaloneRelease')}</p></div>
        <span className={status.connected ? css.onlineBadge : css.offlineBadge}>
          {status.connected ? t('online') : t('offline')}
        </span>
      </div>

      <div className={css.statusGrid}>
        <article><span>{t('enabled')}</span><strong>{status.enabled ? t('active') : t('disabled')}</strong></article>
        <article><span>{t('pairing')}</span><strong>{status.pairing === 'paired' ? t('paired') : t('unpaired')}</strong></article>
        <article><span>{t('queuedMessages')}</span><strong>{status.queueDepth}</strong></article>
      </div>

      <div className={css.bindingCard}>
        {binding === undefined || binding === null ? (
          <div className={css.emptyBinding}><span>{t('binding')}</span><strong>{t('noBinding')}</strong></div>
        ) : (
          <>
            <div><span>{t('project')}</span><strong>{binding.projectTitle}</strong></div>
            <div><span>{t('session')}</span><strong>{binding.sessionTitle}</strong></div>
            <div className={css.pathRow}><span>{t('projectPath')}</span><code>{binding.projectPath}</code></div>
          </>
        )}
      </div>

      <MaintenancePanel status={status} busy={busy} t={t} run={run} />
    </div>
  )
}
