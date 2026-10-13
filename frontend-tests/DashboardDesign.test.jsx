import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { CalendarDays, CircleHelp } from 'lucide-react'
import DashboardNavigation from '../components/DashboardNavigation'
import TodayAgenda from '../components/TodayAgenda'
import { DossierSections, DossierSection } from '../components/DossierSections'

it('groups only authorized destinations, exposes the active page and opens the actual destination', async () => {
  const onSelect = vi.fn()
  render(<DashboardNavigation locale="nl-NL" items={[
    ['today', 'Vandaag', CalendarDays], ['schedule', 'Planning', CalendarDays],
  ]} section="today" onSelect={onSelect} pendingApprovals={0} />)
  expect(screen.getByRole('button', { name: 'Vandaag' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByText('Werk')).toBeTruthy()
  expect(screen.getByText('Uitvoering')).toBeTruthy()
  expect(screen.queryByText('Organisatie')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Beheer' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Planning' }))
  expect(onSelect).toHaveBeenCalledWith('schedule')
})

it('places practical help in its own navigation group and opens that workspace', async () => {
  const onSelect = vi.fn()
  render(<DashboardNavigation locale="nl-NL" items={[
    ['help', 'Hulp', CircleHelp],
  ]} section="today" onSelect={onSelect} />)

  expect(screen.getByText('Ondersteuning')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Hulp' }))
  expect(onSelect).toHaveBeenCalledWith('help')
})

it('shows only scheduled jobs for this local day in chronological order, without inventing dates', async () => {
  const jobs = [
    { id: 'later', title: 'Afternoon visit', scheduledStart: '2026-09-05T15:00:00' },
    { id: 'none', title: 'Unscheduled', targetCompletion: '2026-09-05T10:00:00' },
    { id: 'invalid', title: 'Invalid', scheduledStart: 'invalid' },
    { id: 'tomorrow', title: 'Tomorrow', scheduledStart: '2026-09-06T08:00:00' },
    { id: 'early', title: 'Morning visit', scheduledStart: '2026-09-05T08:00:00', city: 'Arnhem' },
  ]
  const onOpenJob = vi.fn()
  const onOpenSchedule = vi.fn()
  render(<TodayAgenda jobs={jobs} now={new Date('2026-09-05T12:00:00')} locale="en-GB" onOpenJob={onOpenJob} onOpenSchedule={onOpenSchedule} />)
  const list = screen.getByRole('list')
  expect(within(list).getAllByRole('button').map(button => button.textContent)).toEqual(expect.arrayContaining(['Morning visit', 'Afternoon visit']))
  expect(within(list).getAllByRole('button')[0].textContent).toBe('Morning visit')
  expect(screen.queryByText('Unscheduled')).toBeNull()
  expect(screen.queryByText('Tomorrow')).toBeNull()
  expect(screen.queryByText('Invalid')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Morning visit' }))
  expect(onOpenJob).toHaveBeenCalledWith(jobs[4])
  await userEvent.click(screen.getByRole('button', { name: 'View planning' }))
  expect(onOpenSchedule).toHaveBeenCalledOnce()
})

it('provides a truthful empty agenda and no fabricated work', () => {
  render(<TodayAgenda jobs={[]} locale="nl-NL" now={new Date('2026-09-05T12:00:00')} />)
  expect(screen.getByText('Geen geplande opdrachten vandaag')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Planning bekijken' })).toBeNull()
})

it('keeps dossier drafts mounted when changing sections and supports keyboard tabs', async () => {
  render(<DossierSections locale="en-GB">
    <DossierSection areas={['work']}><label>Work note<input /></label></DossierSection>
    <DossierSection areas={['finance']}><p>Quote data</p></DossierSection>
  </DossierSections>)
  await userEvent.type(screen.getByLabelText('Work note'), 'Keep this draft')
  await userEvent.click(screen.getByRole('tab', { name: 'Finance' }))
  expect(screen.queryByRole('textbox', { name: 'Work note' })).toBeNull()
  expect(screen.getByText('Quote data').closest('[hidden]')).toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
  expect(screen.getByRole('textbox', { name: 'Work note' }).value).toBe('Keep this draft')
  await userEvent.keyboard('{Home}')
  expect(screen.getByRole('tab', { name: 'All sections' }).getAttribute('aria-selected')).toBe('true')
})

it('does not expose office-only dossier navigation to field workers', () => {
  render(<DossierSections locale="nl-NL" fieldScoped><DossierSection areas={['work']}>Uitvoering</DossierSection></DossierSections>)
  expect(screen.queryByRole('tab', { name: 'Financiën' })).toBeNull()
  expect(screen.queryByRole('tab', { name: 'Klantcontact' })).toBeNull()
})
