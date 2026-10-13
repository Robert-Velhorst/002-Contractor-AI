import './ConversationEvidenceReview.css'

export default function ConversationEvidenceReview({ origin, revisionOrigin, t = (value) => value }) {
  const hasConversationOrigin = origin?.evidenceKind === 'message_finding'
  const hasRevisionOrigin = revisionOrigin?.evidenceKind === 'client_variation_response'
  if (!hasConversationOrigin && !hasRevisionOrigin) return null

  return (
    <section className="approval-review-section conversation-evidence-review" aria-labelledby="conversation-evidence-title" data-testid="conversation-evidence-review">
      <h3 id="conversation-evidence-title">{t(hasConversationOrigin ? 'Customer conversation evidence' : revisionOrigin.decision === 'rejected' ? 'Customer rejection reason' : 'Customer revision request')}</h3>
      {hasConversationOrigin ? (
        <>
          <p>{t('Client request context; this is not verification of scope, price, feasibility, or acceptance.')}</p>
          <blockquote>{origin.quote}</blockquote>
        </>
      ) : null}
      {hasRevisionOrigin ? (
        <div className="conversation-revision-evidence" data-testid="conversation-revision-evidence">
          <h4>{t('{decision} for {variation} / R{revision}', {
            decision: revisionOrigin.decision === 'rejected' ? t('Rejection reason') : t('Change request'),
            variation: revisionOrigin.variationNumber,
            revision: revisionOrigin.revisionNumber,
          })}</h4>
          <blockquote>{revisionOrigin.note}</blockquote>
          <p>{t('This request is revision evidence, not approval or acceptance of the new scope, price, or schedule.')}</p>
        </div>
      ) : null}
      {hasConversationOrigin ? (
      <dl>
        <div>
          <dt>{t('Analysis category')}</dt>
          <dd>{origin.category}</dd>
        </div>
        <div>
          <dt>{t('Analysis suggestion')}</dt>
          <dd>{origin.suggestion}</dd>
        </div>
        <div>
          <dt>{t('Uncertainty')}</dt>
          <dd>{origin.uncertainty}</dd>
        </div>
        <div>
          <dt>{t('Message source')}</dt>
          <dd>
            <span>{origin.accessId} / {origin.messageId}</span>
            <code>{origin.messageSourceHash}</code>
          </dd>
        </div>
        <div>
          <dt>{t('Analysis identity')}</dt>
          <dd><code>{origin.analysisIdentity}</code></dd>
        </div>
      </dl>
      ) : null}
      {hasRevisionOrigin ? (
        <dl>
          <div>
            <dt>{t('Approved response')}</dt>
            <dd>{revisionOrigin.responseId} · {revisionOrigin.issueReference}</dd>
          </div>
          <div>
            <dt>{t('Response approval')}</dt>
            <dd>{revisionOrigin.approvalId}</dd>
          </div>
          <div>
            <dt>{t('Issued package hash')}</dt>
            <dd><code>{revisionOrigin.packageHash}</code></dd>
          </div>
          <div>
            <dt>{t('Original variation source')}</dt>
            <dd><code>{revisionOrigin.formalSourceHash}</code></dd>
          </div>
        </dl>
      ) : null}
    </section>
  )
}
