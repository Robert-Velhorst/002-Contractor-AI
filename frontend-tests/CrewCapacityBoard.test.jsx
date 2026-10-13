import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import CrewCapacityBoard from '../components/CrewCapacityBoard'
import { draftStorageKey } from '../draft-recovery'

const profile = {
  effectiveFrom: '2026-10-05',
  timezone: 'Europe/Amsterdam',
  dailyHours: { sunday: 0, monday: 8, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 },
  workingWindows: {},
  weeklyHours: 8,
}

const board = {
  window: { windowStart: '2026-10-05', windowEnd: '2026-10-18', dates: [] },
  summary: { totalAvailableHours: 8, totalPlannedHours: 0, utilizationPercent: 0, profiledWorkers: 1, workers: 1, taskCapacityGaps: 0 },
  workers: [{
    id: 'worker-1', name: 'Shift worker', role: 'Installer', profile, profileMissing: false,
    totals: { plannedHours: 0, availableHours: 8 },
    days: [],
  }],
  assignments: [], allocations: [], taskCoverage: [], blockers: [],
  plans: {},
}

it('supports split shifts and submits ordered intervals with the capacity profile', async () => {
  const user = userEvent.setup()
  const onSaveProfile = vi.fn().mockResolvedValue(true)
  render(<CrewCapacityBoard locale="en-GB" board={board} onSaveProfile={onSaveProfile} />)

  const capacityBoard = screen.getByTestId('crew-capacity-board')
  await user.click(capacityBoard.querySelector('.crew-profile-list button'))
  const mondayStart = screen.getByLabelText('Monday interval 1 start time')
  const mondayEnd = screen.getByLabelText('Monday interval 1 end time')
  expect(mondayStart.required).toBe(true)
  expect(mondayEnd.required).toBe(true)
  expect(screen.getByLabelText('Sunday hours').value).toBe('0')
  await user.type(mondayStart, '08:00')
  await user.clear(mondayEnd)
  await user.type(mondayEnd, '12:00')
  await user.click(screen.getByRole('button', { name: 'Add interval for Monday' }))
  await user.clear(screen.getByLabelText('Monday interval 2 start time'))
  await user.type(screen.getByLabelText('Monday interval 2 start time'), '13:00')
  await user.clear(screen.getByLabelText('Monday interval 2 end time'))
  await user.type(screen.getByLabelText('Monday interval 2 end time'), '17:00')
  await user.click(screen.getByRole('button', { name: 'Save profile' }))

  expect(onSaveProfile).toHaveBeenCalledOnce()
  expect(onSaveProfile.mock.calls[0][1].workingWindows.monday).toEqual([
    { start: '08:00', end: '12:00' },
    { start: '13:00', end: '17:00' },
  ])
})

it('localizes weekday and shift labels for Dutch operators', async () => {
  const user = userEvent.setup()
  render(<CrewCapacityBoard locale="nl-NL" board={board} onSaveProfile={vi.fn()} />)
  await user.click(document.querySelector('.crew-profile-list button'))
  expect(screen.getByLabelText('Maandag werkblok 1 starttijd')).toBeTruthy()
  expect(screen.getByLabelText('Maandag werkblok 1 eindtijd')).toBeTruthy()
  expect(screen.getByText('Werkblokken')).toBeTruthy()
})

it('restores an unsaved profile draft in the same operator session without saving it', async () => {
  const user = userEvent.setup()
  const onSaveProfile = vi.fn().mockResolvedValue(true)
  window.sessionStorage.clear()
  const draftScope = `operator-session-${Date.now()}`
  const props = { locale: 'en-GB', board, draftScope, onSaveProfile }
  const firstRender = render(<CrewCapacityBoard {...props} />)
  await user.click(screen.getByTestId('crew-capacity-board').querySelector('.crew-profile-list button'))
  await user.type(screen.getByLabelText('Monday interval 1 start time'), '08:00')
  await waitFor(() => expect(window.sessionStorage.getItem(draftStorageKey(draftScope, 'crew-capacity-profile'))).toContain('"start":"08:00"'))
  firstRender.unmount()

  render(<CrewCapacityBoard {...props} />)

  await waitFor(() => expect(screen.getByLabelText('Monday interval 1 start time').value).toBe('08:00'))
  expect(onSaveProfile).not.toHaveBeenCalled()
})
