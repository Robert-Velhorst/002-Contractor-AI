const test = require('node:test');
const assert = require('node:assert/strict');
const { expandRecurrence, validateRecurrence } = require('../worker-availability-recurrence');

test('weekly availability keeps its local clock time across the Amsterdam DST change', () => {
  const recurrence = validateRecurrence({
    frequency: 'weekly', daysOfWeek: [0], timeZone: 'Europe/Amsterdam', until: '2026-11-01'
  }, '2026-10-18T07:00:00.000Z', '2026-10-18T10:00:00.000Z');
  const periods = expandRecurrence({ startsAt: '2026-10-18T07:00:00.000Z', endsAt: '2026-10-18T10:00:00.000Z', recurrence });
  assert.deepEqual(periods.map(period => period.recurrenceOccurrenceDate), ['2026-10-18', '2026-10-25', '2026-11-01']);
  assert.deepEqual(periods.map(period => period.startsAt), [
    '2026-10-18T07:00:00.000Z', '2026-10-25T08:00:00.000Z', '2026-11-01T08:00:00.000Z'
  ]);
  assert.deepEqual(periods.map(period => period.endsAt), [
    '2026-10-18T10:00:00.000Z', '2026-10-25T11:00:00.000Z', '2026-11-01T11:00:00.000Z'
  ]);
});

test('weekly availability clips expansion, rejects invalid rules and reports DST gaps', () => {
  const base = { startsAt: '2027-01-04T08:00:00.000Z', endsAt: '2027-01-04T17:00:00.000Z' };
  const recurrence = validateRecurrence({ frequency: 'weekly', daysOfWeek: [1], timeZone: 'Europe/Amsterdam', until: '2027-01-25' }, base.startsAt, base.endsAt);
  const clipped = expandRecurrence({ ...base, recurrence }, { rangeStart: '2027-01-17T00:00:00.000Z', rangeEnd: '2027-01-25T23:59:59.999Z' });
  assert.deepEqual(clipped.map(period => period.recurrenceOccurrenceDate), ['2027-01-18', '2027-01-25']);
  assert.throws(() => validateRecurrence({ frequency: 'weekly', daysOfWeek: [], timeZone: 'Europe/Amsterdam', until: '2027-01-25' }, base.startsAt, base.endsAt), { code: 'worker_availability_recurrence_days_invalid' });
  assert.throws(() => validateRecurrence({ frequency: 'weekly', daysOfWeek: [0], timeZone: 'Not/AZone', until: '2027-01-25' }, base.startsAt, base.endsAt), { code: 'worker_availability_recurrence_timezone_invalid' });
  assert.throws(() => validateRecurrence({ frequency: 'weekly', daysOfWeek: [0], timeZone: 'Europe/Amsterdam', until: '2026-03-29' }, '2026-03-22T01:30:00.000Z', '2026-03-22T02:30:00.000Z'), { code: 'worker_availability_recurrence_dst_gap' });
});
