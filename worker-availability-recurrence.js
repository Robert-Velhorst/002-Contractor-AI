const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SERIES_DAYS = 366;
const MAX_OCCURRENCES = 400;
const formatters = new Map();

function localParts(date, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    if (formatters.size >= 64) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function localDateKey(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function localDateOrdinal(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function zonedInstant(parts, timeZone) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(new Date(candidate), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = desired - actualAsUtc;
    if (correction === 0) return new Date(candidate).toISOString();
    candidate += correction;
  }
  throw Object.assign(new Error('A recurring availability time falls in a daylight-saving clock gap.'), {
    code: 'worker_availability_recurrence_dst_gap', statusCode: 400
  });
}

function validateRecurrence(input, startsAt, endsAt, { required = false, defaultTimeZone = 'Europe/Amsterdam' } = {}) {
  if (input === undefined || input === null || input === false || input === '') {
    if (required) throw Object.assign(new Error('A valid weekly recurrence is required.'), { code: 'worker_availability_recurrence_required', statusCode: 400 });
    return null;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.frequency !== 'weekly') {
    throw Object.assign(new Error('Availability recurrence must use the supported weekly pattern.'), { code: 'worker_availability_recurrence_invalid', statusCode: 400 });
  }
  const daysOfWeek = [...new Set((Array.isArray(input.daysOfWeek) ? input.daysOfWeek : []).map(Number))].sort((a, b) => a - b);
  if (!daysOfWeek.length || daysOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw Object.assign(new Error('Select at least one valid weekday for weekly availability.'), { code: 'worker_availability_recurrence_days_invalid', statusCode: 400 });
  }
  const timeZone = String(input.timeZone || defaultTimeZone);
  try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date(startsAt)); } catch {
    throw Object.assign(new Error('Availability recurrence requires a valid IANA time zone.'), { code: 'worker_availability_recurrence_timezone_invalid', statusCode: 400 });
  }
  const until = String(input.until || '');
  const untilMs = /^\d{4}-\d{2}-\d{2}$/.test(until) ? Date.parse(`${until}T00:00:00.000Z`) : Number.NaN;
  if (!Number.isFinite(untilMs) || new Date(untilMs).toISOString().slice(0, 10) !== until) {
    throw Object.assign(new Error('Set a valid final date for the weekly availability period.'), { code: 'worker_availability_recurrence_until_invalid', statusCode: 400 });
  }
  const startLocal = localParts(new Date(startsAt), timeZone);
  const endLocal = localParts(new Date(endsAt), timeZone);
  const startDate = localDateOrdinal(startLocal);
  const endDate = localDateOrdinal(endLocal);
  const localDurationDays = Math.round((endDate - startDate) / DAY_MS);
  const lastDate = untilMs;
  if (lastDate < startDate || lastDate - startDate > MAX_SERIES_DAYS * DAY_MS) {
    throw Object.assign(new Error('A weekly availability series must end within 366 days of its first local date.'), { code: 'worker_availability_recurrence_range_invalid', statusCode: 400 });
  }
  const recurrence = {
    frequency: 'weekly',
    daysOfWeek,
    timeZone,
    until,
    localStart: { hour: startLocal.hour, minute: startLocal.minute, second: startLocal.second },
    localEnd: { dayOffset: localDurationDays, hour: endLocal.hour, minute: endLocal.minute, second: endLocal.second }
  };
  const occurrences = expandRecurrence({ startsAt, endsAt, data: { recurrence } });
  if (!occurrences.length) {
    throw Object.assign(new Error('The final date is before the first selected weekly occurrence.'), {
      code: 'worker_availability_recurrence_no_occurrences', statusCode: 400
    });
  }
  return recurrence;
}

function expandRecurrence(period, { rangeStart = null, rangeEnd = null, limit = MAX_OCCURRENCES } = {}) {
  const recurrence = period?.data?.recurrence || period?.recurrence;
  if (!recurrence) return [period];
  const firstLocal = localParts(new Date(period.startsAt), recurrence.timeZone);
  const firstDate = localDateOrdinal(firstLocal);
  const lastDate = Date.parse(`${recurrence.until}T00:00:00.000Z`);
  const minStart = rangeStart ? Date.parse(rangeStart) : Number.NEGATIVE_INFINITY;
  const maxEnd = rangeEnd ? Date.parse(rangeEnd) : Number.POSITIVE_INFINITY;
  const output = [];
  for (let date = firstDate; date <= lastDate; date += DAY_MS) {
    const calendar = new Date(date);
    if (!recurrence.daysOfWeek.includes(calendar.getUTCDay())) continue;
    const year = calendar.getUTCFullYear(), month = calendar.getUTCMonth() + 1, day = calendar.getUTCDate();
    const start = zonedInstant({ year, month, day, ...recurrence.localStart }, recurrence.timeZone);
    const endDate = new Date(date + Number(recurrence.localEnd.dayOffset || 0) * DAY_MS);
    const end = zonedInstant({ year: endDate.getUTCFullYear(), month: endDate.getUTCMonth() + 1, day: endDate.getUTCDate(),
      hour: recurrence.localEnd.hour, minute: recurrence.localEnd.minute, second: recurrence.localEnd.second || 0 }, recurrence.timeZone);
    if (Date.parse(start) > maxEnd || Date.parse(end) < minStart) continue;
    const endLocal = localParts(new Date(end), recurrence.timeZone);
    output.push({ ...period, startsAt: start, endsAt: end,
      recurrenceOccurrenceDate: localDateKey({ year, month, day }),
      recurrenceOccurrenceEndDate: localDateKey(endLocal) });
    if (output.length > limit) {
      throw Object.assign(new Error('Weekly availability expansion exceeded its bounded occurrence limit.'), {
        code: 'worker_availability_recurrence_expansion_limit', statusCode: 400
      });
    }
  }
  return output;
}

module.exports = { expandRecurrence, validateRecurrence };
