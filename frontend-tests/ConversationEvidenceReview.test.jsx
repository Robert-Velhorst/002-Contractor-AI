import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ConversationEvidenceReview from '../components/ConversationEvidenceReview'

const origin = {
  evidenceKind: 'message_finding',
  accessId: 'portal-12',
  messageId: 'message-34',
  messageSourceHash: 'a'.repeat(64),
  quote: 'Kan de deuropening breder worden?',
  category: 'request',
  suggestion: 'Beoordeel of de opening breder kan worden.',
  uncertainty: 'Gewenste maat en contractimpact zijn niet vastgesteld.',
  analysisIdentity: 'b'.repeat(64),
}

describe('ConversationEvidenceReview', () => {
  it('shows source message, analysis context and uncertainty to the approver', () => {
    render(<ConversationEvidenceReview origin={origin} />)

    expect(screen.getByRole('heading', { name: 'Customer conversation evidence' })).toBeTruthy()
    expect(screen.getByText(origin.quote)).toBeTruthy()
    expect(screen.getByText(origin.suggestion)).toBeTruthy()
    expect(screen.getByText(origin.uncertainty)).toBeTruthy()
    expect(screen.getByText('portal-12 / message-34')).toBeTruthy()
    expect(screen.getByText(origin.messageSourceHash)).toBeTruthy()
    expect(screen.getByText(origin.analysisIdentity)).toBeTruthy()
    expect(screen.getByText(/not verification of scope, price, feasibility, or acceptance/)).toBeTruthy()
  })

  it('does not render for evidence types that are not client message findings', () => {
    const { container } = render(<ConversationEvidenceReview origin={{ ...origin, evidenceKind: 'photo_observation' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows an approved client revision request separately from the original conversation finding', () => {
    render(<ConversationEvidenceReview revisionOrigin={{
      evidenceKind: 'client_variation_response',
      variationNumber: 'VAR-2026-000001',
      revisionNumber: 1,
      responseId: 'response-12',
      issueReference: 'CO-2026-000012',
      approvalId: 'approval-12',
      packageHash: 'c'.repeat(64),
      formalSourceHash: 'd'.repeat(64),
      note: 'Please remove wall protection and keep the floor protection.',
    }} />)

    expect(screen.getByRole('heading', { name: 'Customer revision request' })).toBeTruthy()
    expect(screen.getByText('Please remove wall protection and keep the floor protection.')).toBeTruthy()
    expect(screen.getByText(/not approval or acceptance of the new scope, price, or schedule/)).toBeTruthy()
    expect(screen.getByText('response-12 · CO-2026-000012')).toBeTruthy()
    expect(screen.getByText('approval-12')).toBeTruthy()
    expect(screen.getByText('c'.repeat(64))).toBeTruthy()
  })

  it('labels a client rejection as a reason, not a request for changes', () => {
    render(<ConversationEvidenceReview revisionOrigin={{
      evidenceKind: 'client_variation_response',
      decision: 'rejected',
      variationNumber: 'VAR-2026-000012',
      revisionNumber: 1,
      note: 'Keep the existing access arrangement.',
    }} t={(value, variables) => Object.entries(variables || {}).reduce((text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement), value)} />)

    expect(screen.getByRole('heading', { name: 'Customer rejection reason' })).toBeTruthy()
    expect(screen.getByText('Keep the existing access arrangement.')).toBeTruthy()
    expect(screen.getByText(/Rejection reason for VAR-2026-000012 \/ R1/)).toBeTruthy()
  })
})
