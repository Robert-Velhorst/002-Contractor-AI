const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function lineKey(value, unit) {
  return `${String(value || '').trim().toLocaleLowerCase('en-US')}|${String(unit || '').trim().toLocaleLowerCase('en-US')}`;
}

function normalizedTime(value) {
  if (!value) return null;
  const parsed = Date.parse(DATE_ONLY.test(String(value)) ? `${value}T23:59:59.999Z` : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}

function summarizePurchaseOrder(order, receipts) {
  const items = parseJson(order.itemsJson ?? order.items_json, []);
  const expected = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const identity = item.lineKey || item.line_key || item.id || lineKey(item.name || item.description, item.unit);
    expected.set(String(identity), {
      quantity,
      fallback: lineKey(item.name || item.description, item.unit),
    });
  }
  if (!expected.size) return null;

  const actual = new Map([...expected.keys()].map(key => [key, { accepted: 0, damaged: 0 }]));
  const fallbackToExpected = new Map();
  for (const [key, line] of expected) fallbackToExpected.set(line.fallback, key);
  const events = new Map();
  let hasDamage = false;

  for (const receipt of receipts) {
    const deliveredAt = normalizedTime(receipt.delivered_at);
    if (deliveredAt === null || !receipt.receipt_id) continue;
    const event = events.get(receipt.receipt_id) || { at: deliveredAt, accepted: new Map() };
    events.set(receipt.receipt_id, event);
    if (!receipt.line_key) continue;
    const expectedKey = expected.has(receipt.line_key)
      ? receipt.line_key
      : fallbackToExpected.get(lineKey(receipt.item_name, receipt.unit));
    if (!expectedKey) continue;
    const totals = actual.get(expectedKey);
    totals.accepted += Math.max(0, Number(receipt.accepted_quantity) || 0);
    totals.damaged += Math.max(0, Number(receipt.damaged_quantity) || 0);
    event.accepted.set(expectedKey, (event.accepted.get(expectedKey) || 0) + Math.max(0, Number(receipt.accepted_quantity) || 0));
    hasDamage ||= totals.damaged > 0;
  }

  const complete = [...expected].every(([key, line]) => actual.get(key).accepted >= line.quantity - 0.000001);
  const requiredBy = normalizedTime(order.requiredBy ?? order.required_by);
  const receivedByLine = new Map([...expected.keys()].map(key => [key, 0]));
  let completedAt = null;
  for (const event of [...events.values()].sort((left, right) => left.at - right.at)) {
    for (const [key, quantity] of event.accepted) receivedByLine.set(key, receivedByLine.get(key) + quantity);
    if ([...expected].every(([key, line]) => receivedByLine.get(key) >= line.quantity - 0.000001)) {
      completedAt = event.at;
      break;
    }
  }
  return { complete, hasDamage, requiredBy, completedAt, hasReceipt: events.size > 0 };
}

function listSupplierDeliveryPerformance(db) {
  const rows = db.prepare(`
    SELECT po.id AS purchase_order_id, po.job_id, po.supplier, po.status AS order_status,
      po.required_by, po.items_json, po.data_json AS order_data_json,
      receipt.id AS receipt_id, receipt.status AS receipt_status, receipt.delivered_at,
      line.line_key, line.item_name, line.unit, line.received_quantity, line.accepted_quantity,
      line.damaged_quantity
    FROM purchase_orders po
    LEFT JOIN material_receipts receipt ON receipt.purchase_order_id = po.id
      AND receipt.status IN ('received', 'discrepancy')
    LEFT JOIN material_receipt_lines line ON line.receipt_id = receipt.id
    WHERE trim(coalesce(po.supplier, '')) <> ''
    ORDER BY lower(po.supplier), po.created_at, po.id, receipt.delivered_at, line.line_key
  `).all();

  const orders = new Map();
  for (const row of rows) {
    let order = orders.get(row.purchase_order_id);
    if (!order) {
      const orderData = parseJson(row.order_data_json, {});
      if (!row.receipt_id && orderData.orderIssued !== true && orderData.awardIssued !== true) continue;
      order = {
        id: row.purchase_order_id,
        jobId: row.job_id,
        supplier: String(row.supplier).trim(),
        supplierKey: String(orderData.tradePartnerId || row.supplier).trim().toLocaleLowerCase('en-US'),
        requiredBy: row.required_by || null,
        orderStatus: row.order_status,
        orderIssued: orderData.orderIssued === true,
        issuedAt: orderData.orderIssued === true ? orderData.orderIssuedAt || null : null,
        itemsJson: row.items_json,
        receipts: []
      };
      orders.set(order.id, order);
    }
    if (row.receipt_id && row.line_key) order.receipts.push(row);
  }

  const suppliers = new Map(), summaries = new Map(), completedLeadTimes = new Map();
  for (const order of orders.values()) {
    const summary = summarizePurchaseOrder(order, order.receipts);
    if (!summary) continue;
    summaries.set(order.id, summary);
    let supplier = suppliers.get(order.supplierKey);
    if (!supplier) {
      supplier = { supplierId: order.supplierKey, name: order.supplier, orderCount: 0, receivedOrders: 0,
        completeOrders: 0, ratedOrders: 0, onTimeCompleteOrders: 0, completedWithoutRequiredDate: 0,
        damagedOrders: 0, openShortageOrders: 0, awaitingReceiptOrders: 0, leadTimesDays: [], leadTimeRisks: [] };
      suppliers.set(order.supplierKey, supplier);
    }
    supplier.orderCount += 1;
    if (summary.hasReceipt) supplier.receivedOrders += 1;
    if (summary.complete) {
      supplier.completeOrders += 1;
      if (summary.requiredBy !== null && summary.completedAt !== null) {
        supplier.ratedOrders += 1;
        if (summary.completedAt <= summary.requiredBy) supplier.onTimeCompleteOrders += 1;
      } else {
        supplier.completedWithoutRequiredDate += 1;
      }
    } else if (summary.hasReceipt) {
      supplier.openShortageOrders += 1;
    } else {
      supplier.awaitingReceiptOrders += 1;
    }
    if (summary.hasDamage) supplier.damagedOrders += 1;
    const issuedAt = normalizedTime(order.issuedAt);
    if (order.orderIssued && summary.complete && issuedAt !== null && summary.completedAt !== null && summary.completedAt >= issuedAt) {
      const leadTimeDays = (summary.completedAt - issuedAt) / 86_400_000;
      supplier.leadTimesDays.push(leadTimeDays);
      const leadTimes = completedLeadTimes.get(order.supplierKey) || [];
      leadTimes.push(leadTimeDays);
      completedLeadTimes.set(order.supplierKey, leadTimes);
    }
  }

  for (const order of orders.values()) {
    const summary = summaries.get(order.id), supplier = suppliers.get(order.supplierKey);
    if (!summary || summary.complete || !order.orderIssued || !['ordered', 'sent', 'submitted', 'issued'].includes(order.orderStatus)
      || !order.requiredBy || !order.issuedAt) continue;
    const leadTimes = completedLeadTimes.get(order.supplierKey) || [];
    if (leadTimes.length < 3) continue;
    const issuedAt = normalizedTime(order.issuedAt), requiredBy = normalizedTime(order.requiredBy);
    if (issuedAt === null || requiredBy === null) continue;
    const historicalLeadTimeDays = percentile(leadTimes, 0.75);
    const historicalP75EquivalentCompletionAt = issuedAt + historicalLeadTimeDays * 86_400_000;
    if (historicalP75EquivalentCompletionAt <= requiredBy) continue;
    supplier.leadTimeRisks.push({ purchaseOrderId: order.id, jobId: order.jobId, status: 'historical_lead_time_exceeds_required_date',
      requiredBy: new Date(requiredBy).toISOString(), historicalP75EquivalentCompletionAt: new Date(historicalP75EquivalentCompletionAt).toISOString(),
      historicalLeadTimeDays: Math.round(historicalLeadTimeDays * 10) / 10, sampleSize: leadTimes.length });
  }

  return [...suppliers.values()]
    .map(item => {
      const leadTimeP75 = percentile(item.leadTimesDays, 0.75);
      const { leadTimesDays, ...result } = item;
      return { ...result, historicalLeadTimeP75Days: leadTimesDays.length >= 3 ? Math.round(leadTimeP75 * 10) / 10 : null,
        leadTimeSampleSize: leadTimesDays.length, leadTimeRiskCount: item.leadTimeRisks.length,
        leadTimeRisks: item.leadTimeRisks.sort((left, right) => left.requiredBy.localeCompare(right.requiredBy)).slice(0, 100),
        onTimeCompleteRatePercent: item.ratedOrders ? Math.round(item.onTimeCompleteOrders / item.ratedOrders * 100) : null };
    })
    .sort((left, right) => right.ratedOrders - left.ratedOrders || left.name.localeCompare(right.name, 'nl-NL'));
}

module.exports = { listSupplierDeliveryPerformance, summarizePurchaseOrder };
