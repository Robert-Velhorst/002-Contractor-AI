const { digest } = require('./work-context');
const { ClientCompletionReview } = require('./client-completion-review');

const TERMINAL_VARIATIONS = new Set(['accepted', 'approved', 'superseded', 'rejected', 'cancelled', 'canceled', 'closed']);
const TERMINAL_SELECTIONS = new Set(['accepted', 'approved', 'selected', 'locked', 'cancelled', 'canceled', 'rejected', 'closed']);
const TERMINAL_AFTERCARE = new Set(['completed', 'closed', 'cancelled', 'canceled', 'resolved', 'done']);
const TERMINAL_WARRANTY = new Set(['resolved', 'closed', 'cancelled', 'canceled', 'rejected']);

function statusOf(record, fallback = 'open') {
  return String(record?.status || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function describeRecords(records) {
  return records.map(record => ({
    id: record.id,
    title: record.title || record.description || record.id,
    status: statusOf(record),
    dueAt: record.dueAt || record.due_at || null,
    amount: Number.isFinite(Number(record.total ?? record.amount)) ? Number(record.total ?? record.amount) : null,
    currency: record.currency || null
  }));
}

class ContractualCloseout {
  constructor(ledger) {
    this.ledger = ledger;
    this.clientReviews = new ClientCompletionReview(ledger);
  }

  assess(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    const detail = this.ledger.getJobDetail(jobId, { includeAudit: false, includeCapabilities: false });
    const operational = this.ledger.assessOperationalCompletionReadiness(jobId, { detail });
    const changes = this.ledger.listChangeOrders({ jobId, formalOnly: true, limit: 5000 });
    const openVariations = changes.filter(item => !TERMINAL_VARIATIONS.has(statusOf(item, 'draft')));
    const selections = (detail.clientSelections || []).filter(item => !TERMINAL_SELECTIONS.has(statusOf(item, 'pending_client')));
    const completionResponses = this.clientReviews.list(jobId);
    const latestResponse = completionResponses[0] || null;
    const currentHandover = this.ledger.assessHandoverReadiness(jobId, { detail });
    const currentPackageHash = (detail.documents || []).find(document => document.id === currentHandover.currentPackageId)?.data?.packageHash || null;
    const handoverDelivery = currentPackageHash ? (detail.communications || []).find(message => (
      message.data?.source === 'handover_issue_package'
      && message.data?.packageHash === currentPackageHash
      && message.data?.attachmentDocumentIds?.includes(currentHandover.currentPackageId)
      && ['sent', 'delivered'].includes(statusOf(message, ''))
    )) || null : null;

    const workContext = new (require('./work-context').WorkContext)(this.ledger).source(jobId);
    const workBalance = new (require('./work-balance').WorkBalance)(this.ledger).read(jobId);
    const workDeliveries = new (require('./work-delivery').WorkDelivery)(this.ledger).source(jobId);
    const workPackages = workContext.packages.filter(item => !item.archived).map(item => {
      const balance = workBalance.packages.find(row => row.id === item.id) || null;
      const packageTasks = item.taskIds.map(id => workContext.tasks.find(task => task.id === id)).filter(Boolean);
      const deliveries = workDeliveries.filter(row => row.packageId === item.id).map(row => ({
        id: row.id,
        title: row.title,
        physicalStatus: row.physical.status,
        inspectionStatus: row.inspection.status,
        inspectionCoverageStatus: row.inspectionCoverage.status,
        customerResponseStatus: row.response.status,
        financeStatus: row.finance.status,
        invoiceIds: [...new Set(row.finance.invoices.map(invoice => invoice.invoiceId))],
        financeMilestones: row.finance.milestones.map(milestone => ({
          id: milestone.id, title: milestone.title, status: milestone.status, invoiceId: milestone.invoiceId,
          amount: milestone.amount, taxAmount: milestone.taxAmount, total: milestone.total, currency: milestone.currency
        })),
        invoiceBalances: row.finance.invoices.map(invoice => ({
          id: invoice.invoiceId, invoiceTotal: invoice.invoiceTotal, receivedAmount: invoice.receivedAmount,
          outstandingAmount: invoice.outstandingAmount, creditedAmount: invoice.creditedAmount,
          writtenOffAmount: invoice.writtenOffAmount, currency: invoice.currency
        }))
      }));
      return {
        id: item.id,
        code: item.code,
        title: item.title,
        balanceStatus: balance?.state || (workBalance.enabled ? 'reconciliation_required' : 'not_configured'),
        remainingRows: (balance?.rows || []).map(row => ({
          description: row.description,
          unit: row.unit,
          plannedQuantity: row.plannedQuantity,
          completedQuantity: row.allocatedOutputQuantity,
          remainingQuantity: row.remainingQuantity,
          excessQuantity: row.excessQuantity
        })),
        tasks: packageTasks.map(task => ({ id: task.id, title: task.title, status: task.status })),
        deliveries
      };
    });
    const deliveryFinanceConflicts = workPackages.flatMap(pack => pack.deliveries
      .filter(delivery => delivery.financeStatus === 'allocation_conflict')
      .map(delivery => ({ id: delivery.id, packageId: pack.id, title: delivery.title })));

    const receivables = (detail.invoices || []).map(invoice => ({
      invoice,
      reconciliation: this.ledger.getInvoiceReconciliation(invoice.id)
    })).filter(item => item.reconciliation.outstandingAmount > 0.01).map(({ invoice, reconciliation }) => ({
      id: invoice.id, reference: invoice.invoiceNumber || invoice.reference || invoice.id,
      status: statusOf(invoice), currency: reconciliation.currency,
      outstandingAmount: reconciliation.outstandingAmount, pendingAmount: reconciliation.pendingAmount,
      dueAt: invoice.dueAt || null
    }));
    const payables = (detail.supplierInvoices || []).map(invoice => ({
      invoice,
      reconciliation: this.ledger.getSupplierInvoiceReconciliation(invoice.id)
    })).filter(item => item.reconciliation.outstandingAmount > 0.01).map(({ invoice, reconciliation }) => ({
      id: invoice.id, reference: invoice.invoiceNumber || invoice.reference || invoice.id,
      supplier: invoice.supplierName || invoice.supplier || null,
      status: statusOf(invoice), currency: reconciliation.currency,
      outstandingAmount: reconciliation.outstandingAmount, pendingAmount: reconciliation.pendingAmount,
      dueAt: invoice.dueAt || null
    }));
    const openPunch = (detail.punchItems || []).filter(item => !['resolved', 'verified', 'closed', 'completed', 'cancelled', 'canceled', 'rejected', 'void'].includes(statusOf(item)));
    const openWarranty = (detail.warrantyClaims || []).filter(item => !TERMINAL_WARRANTY.has(statusOf(item)));
    const openAftercare = (detail.aftercare || []).filter(item => !TERMINAL_AFTERCARE.has(statusOf(item)));
    const balanceTotals = records => [...records.reduce((totals, record) => {
      const code = record.currency || 'EUR';
      totals.set(code, (totals.get(code) || 0) + record.outstandingAmount);
      return totals;
    }, new Map())].map(([currency, amount]) => ({ currency, amount: Math.round((amount + Number.EPSILON) * 100) / 100 }));

    const clientState = !latestResponse ? 'awaiting_response'
      : !latestResponse.sourceCurrent ? 'response_source_changed'
        : !latestResponse.reviewActions.length ? 'office_review_required'
          : latestResponse.outcome === 'not_accepted' ? 'client_did_not_accept'
            : latestResponse.outcome === 'accepted_with_items' ? 'accepted_with_items'
              : latestResponse.reviewActions.at(-1)?.disposition === 'follow_up_required' ? 'follow_up_required'
                : 'response_reviewed';
    const clientReview = latestResponse ? {
      state: clientState,
      outcome: latestResponse.outcome,
      respondentName: latestResponse.respondentName,
      submittedAt: latestResponse.submittedAt,
      packageReference: latestResponse.packageReference,
      sourceCurrent: latestResponse.sourceCurrent,
      officeReviewStatus: latestResponse.officeReviewStatus,
      latestDisposition: latestResponse.reviewActions.at(-1)?.disposition || null,
      openItems: latestResponse.outcome === 'accepted_with_items' ? latestResponse.note : null
    } : { state: clientState, outcome: null, sourceCurrent: false, officeReviewStatus: null, latestDisposition: null, openItems: null };
    const jobReportedComplete = ['completed', 'closed', 'accepted'].includes(statusOf(detail))
      || Number(detail.progressPercent || 0) >= 100;
    const operationalStatus = !operational.ready ? 'blocked' : jobReportedComplete ? 'ready' : 'work_in_progress';

    const warnings = [];
    if (!latestResponse) warnings.push({ code: 'client_response_pending', label: 'No client completion response has been recorded.' });
    else if (!latestResponse.sourceCurrent) warnings.push({ code: 'client_response_stale', label: 'The client response refers to an older handover evidence version.', recordIds: [latestResponse.id] });
    else if (!latestResponse.reviewActions.length) warnings.push({ code: 'client_response_unreviewed', label: 'The latest client response needs an office review.', recordIds: [latestResponse.id] });
    if (latestResponse?.outcome === 'not_accepted') warnings.push({ code: 'client_non_acceptance', label: 'The client recorded that the work was not accepted.', recordIds: [latestResponse.id] });
    if (latestResponse?.outcome === 'accepted_with_items') warnings.push({ code: 'client_items_recorded', label: 'The client recorded outstanding items; their resolution is not inferred from this response.', recordIds: [latestResponse.id] });
    if (latestResponse?.reviewActions.at(-1)?.disposition === 'follow_up_required') warnings.push({ code: 'client_follow_up_required', label: 'The latest office review requires follow-up.', recordIds: [latestResponse.id] });
    if (openVariations.length || selections.length) warnings.push({
      code: 'commercial_items_open', label: `${openVariations.length} variation(s) and ${selections.length} client selection(s) remain unresolved.`,
      variationCount: openVariations.length, selectionCount: selections.length,
      recordIds: [...openVariations, ...selections].map(item => item.id)
    });
    if (receivables.length) warnings.push({ code: 'receivables_open', label: `${receivables.length} client invoice(s) have outstanding balances.`, count: receivables.length, recordIds: receivables.map(item => item.id) });
    if (payables.length) warnings.push({ code: 'supplier_payables_open', label: `${payables.length} supplier invoice(s) have outstanding balances.`, count: payables.length, recordIds: payables.map(item => item.id) });
    if (openWarranty.length || openAftercare.length) warnings.push({
      code: 'aftercare_open', label: `${openWarranty.length} warranty claim(s) and ${openAftercare.length} aftercare item(s) remain open.`,
      warrantyCount: openWarranty.length, followUpCount: openAftercare.length,
      recordIds: [...openWarranty, ...openAftercare].map(item => item.id)
    });
    if (deliveryFinanceConflicts.length) warnings.push({
      code: 'delivery_finance_allocation_conflict',
      label: `${deliveryFinanceConflicts.length} delivery finance link(s) need correction before invoice balances can be attributed.`,
      count: deliveryFinanceConflicts.length,
      recordIds: deliveryFinanceConflicts.map(item => item.id)
    });

    const sections = {
      operational: {
        status: operationalStatus,
        jobStatus: statusOf(detail),
        blockers: operational.blockers,
        warnings: operational.warnings,
        openPunchItems: describeRecords(openPunch)
      },
      handover: {
        status: !currentHandover.ready ? 'blocked' : !currentHandover.currentPackageId ? 'package_required' : !handoverDelivery ? 'delivery_required' : 'delivered',
        currentPackageId: currentHandover.currentPackageId,
        delivered: Boolean(handoverDelivery),
        missing: currentHandover.missing,
        blockers: currentHandover.blockers
      },
      client: clientReview,
      commercial: {
        status: openVariations.length || selections.length ? 'open_items' : 'recorded',
        openVariations: describeRecords(openVariations),
        openSelections: describeRecords(selections)
      },
      workPackages: {
        status: !workPackages.length ? 'not_configured'
          : workPackages.some(item => item.balanceStatus === 'reconciliation_required' || item.balanceStatus === 'source_changed')
            ? 'reconciliation_required'
            : workPackages.some(item => item.balanceStatus === 'review_pending') ? 'review_pending'
              : workPackages.some(item => item.balanceStatus === 'allocation_required') ? 'allocation_required'
                : 'reported',
        records: workPackages
      },
      finance: {
        status: deliveryFinanceConflicts.length ? 'allocation_conflict' : receivables.length || payables.length ? 'balances_open' : 'reconciled',
        receivableTotals: balanceTotals(receivables), payableTotals: balanceTotals(payables),
        receivables,
        supplierPayables: payables
      },
      aftercare: {
        status: openWarranty.length || openAftercare.length ? 'open_items' : 'no_open_items',
        warrantyClaims: describeRecords(openWarranty),
        followUps: describeRecords(openAftercare)
      }
    };
    const attentionSections = Object.entries(sections)
      .filter(([, section]) => ['blocked', 'work_in_progress', 'package_required', 'delivery_required', 'open_items', 'balances_open', 'allocation_conflict', 'awaiting_response', 'response_source_changed', 'office_review_required', 'client_did_not_accept', 'accepted_with_items', 'follow_up_required'].includes(section.status))
      .map(([key]) => key);
    const sourceHash = digest({
      jobId, jobStatus: sections.operational.jobStatus,
      blockers: operational.blockers.map(item => ({ code: item.code, recordIds: item.recordIds || [] })),
      handover: sections.handover, client: sections.client, commercial: sections.commercial,
      workPackages: sections.workPackages, finance: sections.finance, aftercare: sections.aftercare
    });
    return {
      jobId, assessedAt: this.ledger.clock().toISOString(), sourceHash,
      status: sections.operational.status === 'blocked' ? 'operationally_blocked' : attentionSections.length ? 'follow_up_required' : 'recorded_no_open_items',
      attentionSections, sections, warnings,
      determinations: { legalAcceptance: 'not_determined', contractualClosure: 'not_determined', paymentRelease: 'not_determined' },
      readOnly: true
    };
  }
}

module.exports = { ContractualCloseout };
