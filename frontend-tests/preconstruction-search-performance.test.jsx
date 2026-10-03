import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PipelineWorkspace from '../components/PipelineWorkspace'
import BidPackageWorkspace from '../components/BidPackageWorkspace'

vi.mock('../components/MarketFitControl', () => ({ default: () => null }))
vi.mock('../components/BidDecisionControl', () => ({ default: () => null }))
vi.mock('../dashboard-chunks', () => ({ loadBidPackages: () => Promise.resolve({ default: () => null }) }))

const request = vi.fn().mockResolvedValue({ suppliers: [] })
const text = (value, variables = {}) => Object.entries(variables)
  .reduce((result, [key, item]) => result.replaceAll(`{${key}}`, String(item)), value)
function fixtures(kind, count = 20) {
  const serialized = vi.fn()
  const rows = Array.from({ length: count }, (_, index) => {
    const row = { id: `${kind}-${index}`, title: `Local ${index}`, client: { name: 'Local client' },
      stage: index < count / 2 ? 'proposal' : 'won', status: index < count / 2 ? 'under_review' : 'selected',
      packageNumber: `PK-${index}`, trade: 'electrical', estimatedValue: 1234,
      internalEvidence: { reference: `needle-${index}`, notes: 'Nested scope evidence' },
    }
    Object.defineProperty(row, 'toJSON', { value: () => { serialized(row); return { ...row } } })
    return row
  })
  return { rows, serialized }
}
const pipelineProps = rows => ({ view: 'opportunities', opportunities: rows, bidPackages: [], request, locale: 'en-GB', text })
const bidProps = rows => ({ bidPackages: rows, request, locale: 'en-GB', text })
const search = (placeholder, value) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
const opportunitySearch = 'Search client, scope or location'
const packageSearch = 'Search package, client, trade or bidder'

afterEach(() => vi.clearAllMocks())

describe('preconstruction search work', () => {
  it('serializes only eligible opportunities once across 100 search edits and preserves nested matching', async () => {
    const { rows, serialized } = fixtures('opportunity', 100)
    await act(async () => render(<PipelineWorkspace {...pipelineProps(rows)} />))
    expect(serialized).not.toHaveBeenCalled()
    search(opportunitySearch, 'needle-1')
    expect(screen.getByRole('button', { name: 'Open Local 1', exact: true })).toBeTruthy()
    for (let index = 0; index < 100; index++) search(opportunitySearch, index % 2 ? ' NEEDLE-1 ' : 'needle-2')
    expect(serialized).toHaveBeenCalledTimes(50)
    expect(screen.queryByRole('button', { name: 'Open Local 61', exact: true })).toBeNull()
    expect(screen.getByPlaceholderText(opportunitySearch).value).toBe(' NEEDLE-1 ')
  })

  it('reindexes changed sources and stage filters but not locale, authority or parent rerenders', async () => {
    const first = fixtures('opportunity')
    const selected = vi.fn()
    const props = { ...pipelineProps(first.rows), onSelect: selected }
    let view
    await act(async () => { view = render(<PipelineWorkspace {...props} />) })
    search(opportunitySearch, 'needle-1')
    expect(first.serialized).toHaveBeenCalledTimes(10)
    view.rerender(<PipelineWorkspace {...props} locale="nl-NL" canCoordinate />)
    expect(first.serialized).toHaveBeenCalledTimes(10)
    fireEvent.click(screen.getByRole('button', { name: 'all', exact: true }))
    expect(first.serialized).toHaveBeenCalledTimes(30)
    fireEvent.click(screen.getByRole('button', { name: 'Open Local 11', exact: true }))
    expect(selected).toHaveBeenCalledWith(first.rows[11])
    const next = fixtures('opportunity')
    next.rows[1].internalEvidence.reference = 'new reference'
    view.rerender(<PipelineWorkspace {...props} opportunities={next.rows} />)
    expect(next.serialized).toHaveBeenCalledTimes(20)
    expect(screen.queryByRole('button', { name: 'Open Local 1', exact: true })).toBeNull()
    expect(screen.getByPlaceholderText(opportunitySearch).value).toBe('needle-1')
  })

  it('does not build an opportunity search index for the hidden bid view', async () => {
    const first = fixtures('opportunity'), next = fixtures('opportunity')
    let view
    await act(async () => { view = render(<PipelineWorkspace {...pipelineProps(first.rows)} />) })
    search(opportunitySearch, 'needle-1')
    await act(async () => view.rerender(<PipelineWorkspace {...pipelineProps(next.rows)} view="bids" />))
    expect(next.serialized).not.toHaveBeenCalled()
    await act(async () => view.rerender(<PipelineWorkspace {...pipelineProps(next.rows)} />))
    expect(next.serialized).toHaveBeenCalledTimes(10)
    expect(screen.getByPlaceholderText(opportunitySearch).value).toBe('needle-1')
  })

  it('serializes only eligible packages once across 100 edits and retains original selection objects', async () => {
    const { rows, serialized } = fixtures('package', 100), selected = vi.fn()
    await act(async () => render(<BidPackageWorkspace {...bidProps(rows)} onSelect={selected} />))
    expect(serialized).not.toHaveBeenCalled()
    for (let index = 0; index < 100; index++) search(packageSearch, index % 2 ? ' NEEDLE-1 ' : 'needle-2')
    expect(serialized).toHaveBeenCalledTimes(50)
    fireEvent.click(screen.getByRole('button', { name: 'Open bid package PK-1', exact: true }))
    expect(selected).toHaveBeenCalledWith(rows[1])
  })

  it('reindexes package filters and refreshed evidence without clearing typed intent', async () => {
    const first = fixtures('package'), next = fixtures('package')
    let view
    await act(async () => { view = render(<BidPackageWorkspace {...bidProps(first.rows)} />) })
    search(packageSearch, 'needle-1')
    expect(first.serialized).toHaveBeenCalledTimes(10)
    view.rerender(<BidPackageWorkspace {...bidProps(first.rows)} locale="nl-NL" canCoordinate />)
    expect(first.serialized).toHaveBeenCalledTimes(10)
    fireEvent.click(screen.getByRole('button', { name: 'all', exact: true }))
    expect(first.serialized).toHaveBeenCalledTimes(30)
    next.rows[1].internalEvidence.reference = 'different reference'
    view.rerender(<BidPackageWorkspace {...bidProps(next.rows)} />)
    expect(next.serialized).toHaveBeenCalledTimes(20)
    expect(screen.queryByText('PK-1 / Local 1')).toBeNull()
    expect(screen.getByText('PK-11 / Local 11')).toBeTruthy()
    expect(screen.getByPlaceholderText(packageSearch).value).toBe('needle-1')
  })

  it.each([
    [PipelineWorkspace, pipelineProps, opportunitySearch, 'opportunity'],
    [BidPackageWorkspace, bidProps, packageSearch, 'package'],
  ])('does not serialize for blank search and drops the index when search is cleared: %s', async (Component, props, placeholder, kind) => {
    const { rows, serialized } = fixtures(kind)
    await act(async () => render(<Component {...props(rows)} />))
    search(placeholder, '   ')
    expect(serialized).not.toHaveBeenCalled()
    search(placeholder, 'needle-1')
    expect(serialized).toHaveBeenCalledTimes(10)
    search(placeholder, '')
    search(placeholder, 'needle-2')
    expect(serialized).toHaveBeenCalledTimes(20)
  })
})
