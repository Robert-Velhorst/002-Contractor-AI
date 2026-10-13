const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('render-scoped date formatting retains values, fallbacks and invalid-date rejection', async () => {
  const { createDateFormatter, formatDate } = await import('../format-date.mjs');
  const format = createDateFormatter();
  for (const value of [null, undefined, '', false, 0]) {
    assert.equal(format(value), formatDate(value));
    assert.equal(format(value, 'Geen datum'), 'Geen datum');
  }
  for (const value of ['2026-10-01T08:00:00Z', '2026-03-29T01:30:00Z',
    '2026-10-25T01:30:00Z', new Date('2026-10-01T08:00:00Z'), 1790841600000]) {
    assert.equal(format(value), formatDate(value));
  }
  assert.throws(() => format('geen geldige datum'), RangeError);
  assert.throws(() => formatDate('geen geldige datum'), RangeError);
});

test('a new render uses the current system time zone instead of a global formatter cache', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createDateFormatter, formatDate } from './format-date.mjs';
    const value = '2026-10-01T08:00:00Z';
    process.env.TZ = 'UTC';
    const previousRender = createDateFormatter();
    const previous = previousRender(value);
    for (const zone of ['Europe/Amsterdam', 'America/New_York', 'UTC']) {
      process.env.TZ = zone;
      assert.equal(createDateFormatter()(value), formatDate(value));
      assert.equal(previousRender(value), previous);
      if (zone !== 'UTC') assert.notEqual(createDateFormatter()(value), previous);
    }
  `], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('render-scoped formatters accept an explicit current zone without changing default behavior', async () => {
  const { createDateFormatter, formatDate } = await import('../format-date.mjs');
  const value = '2026-10-01T08:00:00Z';
  for (const timeZone of ['Europe/Amsterdam', 'America/New_York', 'UTC']) {
    const format = createDateFormatter(timeZone);
    assert.equal(format(null, 'Geen datum'), 'Geen datum');
    assert.equal(format(value), new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value)));
    assert.equal(createDateFormatter()(value), formatDate(value));
  }
  const invalid = createDateFormatter('not-a-time-zone');
  assert.equal(invalid(null), 'Niet vastgelegd');
  assert.throws(() => invalid(value), RangeError);
});
