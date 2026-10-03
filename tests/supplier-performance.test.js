const test = require('node:test');
const assert = require('node:assert/strict');
const { listSupplierDeliveryPerformance } = require('../supplier-performance');

function row(purchaseOrderId, { requiredBy = '2030-06-10T12:00:00.000Z', status = 'issued', orderData = '{}', receiptId = null,
  deliveredAt = null, lineKey = null, received = 0, accepted = 0, damaged = 0 } = {}) {
  return { purchase_order_id: purchaseOrderId, job_id: 'job-1', supplier: 'Dakmaterialen BV', order_status: status,
    required_by: requiredBy, items_json: JSON.stringify([{ lineKey: 'roofing', name: 'Dakrollen', quantity: 10, unit: 'rollen' }]),
    order_data_json: orderData, receipt_id: receiptId, receipt_status: receiptId ? 'received' : null, delivered_at: deliveredAt,
    line_key: lineKey, item_name: lineKey ? 'Dakrollen' : null, unit: lineKey ? 'rollen' : null,
    received_quantity: received, accepted_quantity: accepted, damaged_quantity: damaged, line_data_json: '{}' };
}

test('supplier performance is derived from received order lines and excludes unsupported dates', () => {
  const rows = [
    row('on-time', { receiptId: 'r1a', deliveredAt: '2030-06-09T09:00:00Z', lineKey: 'roofing', received: 4, accepted: 4 }),
    row('on-time', { receiptId: 'r1b', deliveredAt: '2030-06-10T09:00:00Z', lineKey: 'roofing', received: 6, accepted: 6 }),
    row('late', { receiptId: 'r2', deliveredAt: '2030-06-12T09:00:00Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('damaged', { receiptId: 'r-damaged', deliveredAt: '2030-06-12T09:00:00Z', lineKey: 'roofing', received: 12, accepted: 10, damaged: 2 }),
    row('short', { receiptId: 'r3', deliveredAt: '2030-06-08T09:00:00Z', lineKey: 'roofing', received: 7, accepted: 7 }),
    row('no-date', { requiredBy: null, receiptId: 'r4', deliveredAt: '2030-06-08T09:00:00Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('draft', { status: 'draft' })
  ];
  const db = { prepare(sql) { assert.match(sql, /material_receipt_lines/); return { all() { return rows; } }; } };
  const [supplier] = listSupplierDeliveryPerformance(db);
  assert.equal(supplier.name, 'Dakmaterialen BV');
  assert.equal(supplier.orderCount, 5);
  assert.equal(supplier.receivedOrders, 5);
  assert.equal(supplier.completeOrders, 4);
  assert.equal(supplier.ratedOrders, 3);
  assert.equal(supplier.onTimeCompleteOrders, 1);
  assert.equal(supplier.onTimeCompleteRatePercent, 33);
  assert.equal(supplier.completedWithoutRequiredDate, 1);
  assert.equal(supplier.damagedOrders, 1);
  assert.equal(supplier.openShortageOrders, 1);
});

test('supplier performance separates trade partners and ignores orders without measurable material lines', () => {
  const rows = [
    row('one', { orderData: '{"tradePartnerId":"partner-a"}', receiptId: 'r1', deliveredAt: '2030-06-09T09:00:00Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    { ...row('awaiting', { status: 'issued', orderData: '{"tradePartnerId":"partner-a","orderIssued":true}' }), receipt_id: null, line_key: null },
    { ...row('two', { orderData: '{"tradePartnerId":"partner-b"}', receiptId: 'r2', deliveredAt: '2030-06-09T09:00:00Z', lineKey: 'roofing', received: 10, accepted: 10 }), supplier: 'Dakmaterialen BV' },
    { ...row('generic', { receiptId: 'r3', deliveredAt: '2030-06-09T09:00:00Z', lineKey: 'misc', received: 10, accepted: 10 }), items_json: '[]' }
  ];
  const db = { prepare() { return { all: () => rows }; } };
  const result = listSupplierDeliveryPerformance(db);
  assert.deepEqual(result.map(item => item.supplierId).sort(), ['partner-a', 'partner-b']);
  assert.ok(result.every(item => item.onTimeCompleteRatePercent === 100 && item.ratedOrders === 1));
  assert.equal(result.find(item => item.supplierId === 'partner-a').awaitingReceiptOrders, 1);
});

test('supplier lead-time risk uses only completed issued-order history and flags a late historical P75', () => {
  const orderIssuedAt = '2030-06-01T00:00:00.000Z';
  const rows = [
    row('history-a', { orderData: JSON.stringify({ orderIssued: true, orderIssuedAt }), receiptId: 'history-r-a', deliveredAt: '2030-06-06T00:00:00.000Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('history-b', { orderData: JSON.stringify({ orderIssued: true, orderIssuedAt }), receiptId: 'history-r-b', deliveredAt: '2030-06-07T00:00:00.000Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('history-c', { orderData: JSON.stringify({ orderIssued: true, orderIssuedAt }), receiptId: 'history-r-c', deliveredAt: '2030-06-09T00:00:00.000Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('open-risk', { requiredBy: '2030-06-07T00:00:00.000Z', status: 'ordered', orderData: JSON.stringify({ orderIssued: true, orderIssuedAt }) }),
    row('cancelled-risk', { requiredBy: '2030-06-02T00:00:00.000Z', status: 'cancelled', orderData: JSON.stringify({ orderIssued: true, orderIssuedAt }) })
  ];
  const [supplier] = listSupplierDeliveryPerformance({ prepare() { return { all: () => rows }; } });
  assert.equal(supplier.historicalLeadTimeP75Days, 8);
  assert.equal(supplier.leadTimeSampleSize, 3);
  assert.equal(supplier.leadTimeRiskCount, 1);
  assert.deepEqual(supplier.leadTimeRisks[0], { purchaseOrderId: 'open-risk', jobId: 'job-1',
    status: 'historical_lead_time_exceeds_required_date', requiredBy: '2030-06-07T00:00:00.000Z',
    historicalP75EquivalentCompletionAt: '2030-06-09T00:00:00.000Z', historicalLeadTimeDays: 8, sampleSize: 3 });
});

test('supplier lead-time risk remains unscored below the minimum sample size', () => {
  const rows = [
    row('history-only-one', { orderData: JSON.stringify({ orderIssued: true, orderIssuedAt: '2030-06-01T00:00:00.000Z' }),
      receiptId: 'history-only-one-r', deliveredAt: '2030-06-06T00:00:00.000Z', lineKey: 'roofing', received: 10, accepted: 10 }),
    row('open-no-sample', { requiredBy: '2030-06-02T00:00:00.000Z', status: 'ordered', orderData: JSON.stringify({ orderIssued: true, orderIssuedAt: '2030-06-01T00:00:00.000Z' }) })
  ];
  const [supplier] = listSupplierDeliveryPerformance({ prepare() { return { all: () => rows }; } });
  assert.equal(supplier.historicalLeadTimeP75Days, null);
  assert.equal(supplier.leadTimeSampleSize, 1);
  assert.equal(supplier.leadTimeRiskCount, 0);
});
