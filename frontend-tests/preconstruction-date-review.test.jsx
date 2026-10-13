import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import PreconstructionDateReview from '../components/PreconstructionDateReview'
import { operatorText } from '../operator-locale'

const t = (key, values) => operatorText('nl-NL', key, values)

describe('forecast date review', () => {
  it('shows an out-of-window date and unknown estimate without presenting a zero-hour demand', async () => {
    render(<PreconstructionDateReview t={t} comparison={{
      status: 'partial', timeZone: 'Europe/Amsterdam', timeZoneSource: 'default', windowStart: '2026-10-05', windowEnd: '2026-10-09',
      roles: [{ kind: 'trade', role: 'Timmerman', distributionRecorded: false, undatedHours: 3,
        days: [{ date: '2026-10-12', plannedHours: 4, estimatedHours: null, varianceHours: null, outsideWindow: true }] }]
    }} />)
    await userEvent.click(screen.getByText('Geplande werkdatums'))
    expect(screen.getByTestId('preconstruction-date-review').open).toBe(true)
    expect(screen.getByText('4 u gepland; raming per datum onbekend')).toBeTruthy()
    expect(screen.getByText('Buiten de verwachte werkperiode')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('3 geplande uren')
    expect(screen.getByText(/De tijdzone van de locatie is niet vastgelegd/)).toBeTruthy()
  })

  it('renders supervision under the recorded site zone and identifies unavailable dates', async () => {
    render(<PreconstructionDateReview t={t} comparison={{ status: 'unavailable', timeZone: 'Europe/London', timeZoneSource: 'site_access_calendar',
      roles: [{ kind: 'supervision', role: 'Supervisor', distributionRecorded: true, undatedHours: 0,
        days: [{ date: '2026-10-05', plannedHours: 4, estimatedHours: 8, varianceHours: -4, outsideWindow: null }] }]
    }} />)
    await userEvent.click(screen.getByText('Geplande werkdatums'))
    expect(screen.getByText('Tijdzone voor werkdatums: Europe/London')).toBeTruthy()
    expect(screen.getByText('Toezicht: Supervisor')).toBeTruthy()
    expect(screen.getByText('8 u geraamd · 4 u gepland · verschil -4 u')).toBeTruthy()
    expect(screen.getByText('De verwachte werkperiode ontbreekt of kan niet worden vergeleken.')).toBeTruthy()
    expect(screen.queryByText(/De tijdzone van de locatie is niet vastgelegd/)).toBeNull()
  })
})
