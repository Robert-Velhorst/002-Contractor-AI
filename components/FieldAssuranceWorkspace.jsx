import './JobWorkspaceControls.css'
import { ArrowUpRight, ClipboardCheck, FileUp, PackageCheck, ShieldCheck } from 'lucide-react'
import { EMPTY_LIST, formatStatus, roundDisplay } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'



const FIELD_ASSURANCE_REVIEW_PRIORITY = [
  'resolve_incident',
  'clear_site_access',
  'review_rfi',
  'review_permit',
  'review_document',
  'review_inspection',
  'resolve_observation',
  'review_submittal',
  'complete_quality_review',
  'complete_safety_check',
  'resolve_punch_item',
  'review_jha',
  'request_sds',
  'complete_safety_meeting',
  'complete_orientation',
]

function FieldAssuranceWorkspace({
  field,
  jobs,
  locale = 'en-GB',
  canCoordinate,
  canApprove,
  submitting,
  onPrepareSafety,
  onReview,
  onCapture,
  onOpenApprovals,
  onOpen,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const rows = field?.jobs || field?.rows || EMPTY_LIST
  const summary = field?.summary || {}
  const targetFor = (item, action) => {
    const targets = {
      resolve_incident: {
        type: 'incident',
        recordId: action.incidentId,
        record: item.latest?.incident,
        label: t('Resolve incident'),
        status: 'resolved',
      },
      resolve_observation: {
        type: 'observation',
        recordId: action.observationId,
        record: item.latest?.observation,
        label: t('Resolve observation'),
        status: 'resolved',
      },
      review_rfi: { type: 'rfi', recordId: action.rfiId, record: item.latest?.rfi, label: t('Answer RFI'), status: 'answered' },
      review_submittal: {
        type: 'submittal',
        recordId: action.submittalId,
        record: item.latest?.submittal,
        label: t('Approve submittal'),
        status: 'approved',
      },
      review_permit: {
        type: 'permit',
        recordId: action.permitId,
        record: item.latest?.permit,
        label: t('Submit permit review'),
        status: 'submitted',
      },
      review_document: {
        type: 'document',
        recordId: action.documentId,
        record: item.latest?.document,
        label: t('Approve document review'),
        status: 'approved',
      },
      review_inspection: {
        type: 'inspection',
        recordId: action.inspectionId,
        record: item.latest?.inspection,
        label: t('Request inspection sign-off'),
        status: 'passed',
      },
      clear_site_access: {
        type: 'site_access',
        recordId: action.siteAccessId,
        record: item.latest?.siteAccess,
        label: t('Clear site access'),
        status: 'cleared',
      },
      review_jha: { type: 'jha', recordId: action.jhaId, record: item.latest?.jha, label: t('Approve JHA'), status: 'approved' },
      request_sds: { type: 'sds', recordId: action.sdsSheetId, record: item.latest?.sdsSheet, label: t('Approve SDS'), status: 'current' },
      complete_safety_meeting: {
        type: 'safety_meeting',
        recordId: action.safetyMeetingId,
        record: item.latest?.safetyMeeting,
        label: t('Complete safety talk'),
        status: 'completed',
      },
      complete_orientation: {
        type: 'orientation',
        recordId: action.orientationId,
        record: item.latest?.orientation,
        label: t('Complete orientation'),
        status: 'completed',
      },
      complete_quality_review: {
        type: 'quality_check',
        recordId: action.qualityCheckId,
        record: item.latest?.qualityCheck,
        label: t('Complete quality review'),
        status: 'passed',
      },
      complete_safety_check: {
        type: 'safety_check',
        recordId: action.safetyCheckId,
        record: item.latest?.safetyCheck,
        label: t('Complete safety check'),
        status: 'completed',
      },
      resolve_punch_item: {
        type: 'punch_item',
        recordId: action.punchItemId,
        record: item.latest?.punchItem,
        label: t('Resolve punch item'),
        status: 'resolved',
      },
    }
    return targets[action.type]
  }

  return (
    <div className="field-assurance-workspace" data-testid="field-assurance-workspace">
      <div className="assurance-heading">
        <div>
          <h2>{t('Assurance queue')}</h2>
          <p>{t('Safety, design, permit, inspection, quality, and evidence controls ranked from the retained ledger.')}</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </div>
      <div className="assurance-summary" aria-label={t('Field assurance summary')}>
        <div>
          <span>{t('Incident blocked')}</span>
          <strong>{summary.incidentBlocked || 0}</strong>
        </div>
        <div>
          <span>{t('Design review')}</span>
          <strong>{summary.designReviews || 0}</strong>
        </div>
        <div>
          <span>{t('Quality review')}</span>
          <strong>{summary.qualityReviews || 0}</strong>
        </div>
        <div>
          <span>{t('Evidence missing')}</span>
          <strong>{summary.evidenceMissing || 0}</strong>
        </div>
        <div>
          <span>{t('Production risk')}</span>
          <strong>{summary.productionAtRisk || 0}</strong>
        </div>
      </div>
      <div className="assurance-list">
        {rows.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.jobId) || { id: item.jobId, title: item.jobTitle || t('Ledger job') }
          const canAct = canCoordinate && !item.flags?.approvalRequired
          const safetyAction = canAct ? item.nextActions?.find((action) => action.type === 'prepare_safety_pack') : null
          const accessPrerequisiteAction =
            canAct && item.latest?.siteAccess?.orientationValid === false
              ? item.nextActions?.find((action) => action.type === 'complete_orientation')
              : null
          const reviewAction = canAct
            ? accessPrerequisiteAction ||
              FIELD_ASSURANCE_REVIEW_PRIORITY.map((type) => item.nextActions?.find((action) => action.type === type)).find(Boolean)
            : null
          const reviewTarget = reviewAction ? targetFor(item, reviewAction) : null
          const captureAction = canAct ? item.nextActions?.find((action) => action.type === 'capture_field_evidence') : null
          return (
            <article className="assurance-item" key={item.jobId}>
              <div className="assurance-copy">
                <div className="assurance-title">
                  <h3>{item.jobTitle || t('Ledger job')}</h3>
                  <span className={`status status-${item.fieldStatus}`}>{t(formatStatus(item.fieldStatus))}</span>
                </div>
                <p>{t(item.nextAction || 'Field assurance workflow is stable.')}</p>
                <div className="assurance-values">
                  <span>
                    {t('Incidents')} <strong>{item.counts?.openIncidents || 0}</strong>
                  </span>
                  <span>
                    {t('Design controls')}{' '}
                    <strong>
                      {(item.counts?.openRfis || 0) +
                        (item.counts?.submittalReviews || 0) +
                        (item.counts?.permitReviews || 0) +
                        (item.counts?.documentReviews || 0)}
                    </strong>
                  </span>
                  <span>
                    {t('Quality controls')}{' '}
                    <strong>
                      {(item.counts?.inspectionReviews || 0) +
                        (item.counts?.openNonconformances || 0) +
                        (item.counts?.openObservations || 0) +
                        (item.counts?.qualityOpen || 0) +
                        (item.counts?.punchOpen || 0)}
                    </strong>
                  </span>
                  <span>
                    {t('Evidence')} <strong>{item.counts?.evidenceRecords || 0}</strong>
                  </span>
                  <span>
                    {t('Production')}{' '}
                    <strong>
                      {item.production?.summary?.performanceFactor == null
                        ? item.production?.activeBaseline ? t('ready') : t('no baseline')
                        : t('{factor} factor', { factor: roundDisplay(item.production.summary.performanceFactor) })}
                    </strong>
                  </span>
                </div>
                <div className="assurance-flags">
                  {item.counts?.pendingApprovals ? (
                    <span className="tag tag-amber">
                      {item.counts.pendingApprovals === 1
                        ? t('{count} approval', { count: item.counts.pendingApprovals })
                        : t('{count} approvals', { count: item.counts.pendingApprovals })}
                    </span>
                  ) : null}
                  {item.flags?.safetyGap ? <span className="tag tag-amber">{t('Safety pack missing')}</span> : null}
                  {item.flags?.productionAtRisk ? <span className="tag tag-amber">{t('Production variance')}</span> : null}
                  {item.flags?.productionBaselineMissing ? <span className="tag">{t('Production baseline missing')}</span> : null}
                  {item.counts?.expiringPermits ? <span className="tag tag-amber">{t('{count} permit due', { count: item.counts.expiringPermits })}</span> : null}
                  {item.counts?.siteAccessBlocks ? (
                    <span className="tag">
                      {item.counts.siteAccessBlocks === 1
                        ? t('{count} access block', { count: item.counts.siteAccessBlocks })
                        : t('{count} access blocks', { count: item.counts.siteAccessBlocks })}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="assurance-actions">
                {item.flags?.approvalRequired && canApprove ? (
                  <button
                    className="secondary-button"
                    disabled={submitting}
                    onClick={() =>
                      onOpenApprovals({
                        jobId: item.jobId,
                        jobTitle: job.title,
                        approvalId: item.nextActions?.find((action) => action.approvalId)?.approvalId || null,
                      })
                    }
                  >
                    <ShieldCheck size={16} />
                    {t('Review approval')}
                  </button>
                ) : null}
                {safetyAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Prepare safety pack for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onPrepareSafety(item)}
                  >
                    <PackageCheck size={16} />
                    {t('Safety pack')}
                  </button>
                ) : null}
                {reviewTarget?.recordId ? (
                  <button
                    className="secondary-button"
                    aria-label={t('{action} for {job}', { action: reviewTarget.label, job: job.title })}
                    disabled={submitting}
                    onClick={() => onReview(item, reviewTarget)}
                  >
                    <ClipboardCheck size={16} />
                    {reviewTarget.label}
                  </button>
                ) : null}
                {captureAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Capture field evidence for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onCapture(item)}
                  >
                    <FileUp size={16} />
                    {t('Capture evidence')}
                  </button>
                ) : null}
                <button className="icon-button table-action" aria-label={t('Open {job}', { job: job.title })} onClick={() => onOpen(job)}>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          )
        })}
        {!rows.length ? (
          <Empty
            title={t('Assurance queue is clear')}
            detail={t('Safety, design, quality, and evidence controls will appear here when review is required.')}
          />
        ) : null}
      </div>
    </div>
  )
}



export default FieldAssuranceWorkspace

export { FieldAssuranceWorkspace }
