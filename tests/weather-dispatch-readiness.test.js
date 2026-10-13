const test = require('node:test');
const assert = require('node:assert/strict');
const { ContractorOperatingLedger } = require('../operating-ledger');

function createLedger(t, startOffsetHours = 4) {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const plannedStart = new Date(Date.now() + startOffsetHours * 60 * 60 * 1000).toISOString();
  const job = ledger.createIntake({
    title: 'Outdoor paving work',
    client: { name: 'Weather client' },
    status: 'scheduled',
    scheduledStart: plannedStart,
    description: 'Weather-sensitive paving work.'
  });
  return { ledger, job, plannedStart };
}

test('manual unsafe weather blocks a matching planned start even without a precipitation warning', t => {
  const { ledger, job, plannedStart } = createLedger(t);
  ledger.assessWeather(job.id, { condition: 'unsafe', precipitationPercent: 0, weatherSensitive: true, forecastAt: plannedStart });

  const recommendation = ledger.recommendSchedule(job.id, { plannedStart }, { audit: false });

  assert.equal(recommendation.readiness.weather.status, 'risk');
  assert.ok(recommendation.blockers.some(blocker => blocker.type === 'weather_risk'));
  assert.match(recommendation.readiness.weather.recommendation, /human suitability review/i);
});

test('weather older than twelve hours is stale and calls for reassessment on outdoor work', t => {
  const { ledger, job, plannedStart } = createLedger(t);
  const fetchedAt = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  ledger.assessWeather(job.id, { condition: 'workable', precipitationPercent: 0, weatherSensitive: true, forecastAt: plannedStart, fetchedAt });

  const recommendation = ledger.recommendSchedule(job.id, { plannedStart }, { audit: false });

  assert.equal(recommendation.readiness.weather.status, 'stale');
  assert.ok(recommendation.missing.includes('weather_assessment'));
  assert.ok(recommendation.nextActions.some(action => action.type === 'assess_weather'));
  assert.equal(ledger.weatherOverview().status, 'stale');
});

test('a recent forecast for another time is not used as current schedule evidence', t => {
  const { ledger, job, plannedStart } = createLedger(t, 48);
  const forecastAt = new Date().toISOString();
  ledger.assessWeather(job.id, { condition: 'storm_risk', precipitationPercent: 90, weatherSensitive: true, forecastAt });

  const recommendation = ledger.recommendSchedule(job.id, { plannedStart }, { audit: false });

  assert.equal(recommendation.readiness.weather.status, 'not_comparable');
  assert.ok(recommendation.missing.includes('weather_assessment'));
  assert.ok(!recommendation.blockers.some(blocker => blocker.type === 'weather_risk'));
});
