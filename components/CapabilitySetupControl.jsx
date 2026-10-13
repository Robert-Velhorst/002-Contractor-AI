import { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardList, Gauge, LockKeyhole } from 'lucide-react'
import { EMPTY_LIST } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import './JobWorkspaceControls.css'

function CapabilitySetupControl({ job, locale = 'en-GB', canCoordinate, submitting, onApply }) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const missingRequirements = useMemo(() => {
    const byKey = new Map()
    for (const capability of job.capabilities || EMPTY_LIST) {
      for (const requirement of capability.requirements || EMPTY_LIST) {
        if (requirement.covered || requirement.automationPolicy === 'informational') continue
        const current = byKey.get(requirement.key)
        if (current) {
          current.capabilityLabels.push(capability.label)
          continue
        }
        byKey.set(requirement.key, {
          ...requirement,
          capabilityLabels: [capability.label],
        })
      }
    }
    return [...byKey.values()]
  }, [job.capabilities])
  const safeGaps = missingRequirements.filter((requirement) => requirement.safeDraftable)
  const manualGaps = missingRequirements.filter((requirement) => !requirement.safeDraftable)
  const safeKeySignature = safeGaps.map((requirement) => requirement.key).join('|')
  const [selectedKeys, setSelectedKeys] = useState([])

  useEffect(() => {
    const available = new Set(safeKeySignature.split('|').filter(Boolean))
    setSelectedKeys((current) => current.filter((key) => available.has(key)))
  }, [job.id, safeKeySignature])

  function toggleRequirement(requirementKey) {
    setSelectedKeys((current) =>
      current.includes(requirementKey)
        ? current.filter((key) => key !== requirementKey)
        : [...current, requirementKey],
    )
  }

  async function applySelected() {
    if (!selectedKeys.length) return
    const result = await onApply(selectedKeys)
    if (result) setSelectedKeys([])
  }

  return (
    <section className="job-workspace-section capability-setup-control" data-testid="capability-setup-control">
      <div className="section-heading capability-setup-heading">
        <Gauge size={18} />
        <div>
          <h3>{t('Job setup coverage')}</h3>
          <p>{t('Prepare internal setup records while observed facts and commitments stay operator-controlled.')}</p>
        </div>
        {canCoordinate && safeGaps.length ? (
          <button
            type="button"
            className="secondary-button"
            disabled={submitting}
            onClick={() => setSelectedKeys(selectedKeys.length === safeGaps.length ? [] : safeGaps.map((requirement) => requirement.key))}
          >
            <Check size={15} />
            {selectedKeys.length === safeGaps.length ? t('Clear selection') : t('Select safe drafts')}
          </button>
        ) : null}
      </div>

      <div className="capability-setup-metrics" aria-label={t('Job setup coverage summary')}>
        <div>
          <span>{t('Coverage')}</span>
          <strong>{job.capabilitySummary?.averageCoverage || 0}%</strong>
        </div>
        <div>
          <span>{t('Ready groups')}</span>
          <strong>{job.capabilitySummary?.ready || 0} / {job.capabilities?.length || 0}</strong>
        </div>
        <div>
          <span>{t('Safe drafts')}</span>
          <strong>{safeGaps.length}</strong>
        </div>
        <div>
          <span>{t('Manual gaps')}</span>
          <strong>{manualGaps.length}</strong>
        </div>
      </div>

      {safeGaps.length ? (
        <fieldset className="capability-safe-drafts">
          <legend>{t('Internal setup drafts')}</legend>
          {safeGaps.map((requirement) => (
            <label className="capability-gap-option" key={requirement.key}>
              <input
                type="checkbox"
                checked={selectedKeys.includes(requirement.key)}
                disabled={!canCoordinate || submitting}
                onChange={() => toggleRequirement(requirement.key)}
              />
              <span>
                <strong>{t(requirement.label)}</strong>
                <small>{requirement.capabilityLabels.map((label) => t(label)).join(' / ')}</small>
              </span>
              <span className="tag tag-green">{t('Draft only')}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="workflow-note" data-testid="capability-safe-complete">
          {t('All eligible internal setup scaffolds are retained for this job.')}
        </p>
      )}

      {canCoordinate && safeGaps.length ? (
        <div className="capability-setup-actions">
          <span>{t('{count} selected', { count: selectedKeys.length })}</span>
          <button
            type="button"
            className="primary-button"
            data-testid="apply-capability-setup"
            disabled={submitting || !selectedKeys.length}
            onClick={applySelected}
          >
            <ClipboardList size={15} />
            {submitting ? t('Retaining...') : t('Retain selected drafts')}
          </button>
        </div>
      ) : null}

      {manualGaps.length ? (
        <details className="capability-manual-gaps">
          <summary>
            <LockKeyhole size={15} />
            {t('Manual evidence and commitments ({count})', { count: manualGaps.length })}
          </summary>
          <div>
            {manualGaps.map((requirement) => (
              <article key={requirement.key} data-testid={`manual-capability-${requirement.key}`}>
                <span>
                  <strong>{t(requirement.label)}</strong>
                  <small>{t(requirement.automationReason)}</small>
                </span>
                <span className="tag">
                  {requirement.automationPolicy === 'manual_commitment' ? t('Verify commitment') : t('Source evidence')}
                </span>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

export { CapabilitySetupControl as default, CapabilitySetupControl }
