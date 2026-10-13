import { expect, it } from 'vitest'
import { maxWeeklyAvailabilityDate, toIsoDateTimeInTimeZone } from '../dashboard-format'

it('converts entered wall-clock time using the selected timezone offset', () => {
  expect(toIsoDateTimeInTimeZone('2026-01-12T09:00', 'Europe/Amsterdam')).toBe('2026-01-12T08:00:00.000Z')
  expect(toIsoDateTimeInTimeZone('2026-07-12T09:00', 'Europe/Amsterdam')).toBe('2026-07-12T07:00:00.000Z')
})

it('rejects local times that do not exist during a daylight-saving transition', () => {
  expect(() => toIsoDateTimeInTimeZone('2026-03-29T02:30', 'Europe/Amsterdam'))
    .toThrow(/does not exist/)
})

it('bounds recurring availability to 366 days after its first day', () => {
  expect(maxWeeklyAvailabilityDate('2026-01-01T09:00')).toBe('2027-01-02')
})
