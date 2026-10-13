import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DossierSection, DossierSections } from '../components/DossierSections'

afterEach(cleanup)

describe('dossier section navigation', () => {
  it('opens the requested tab before scrolling to its target', () => {
    render(<DossierSections><DossierSection areas={['planning']}><div id="recovery-target">Recovery</div></DossierSection></DossierSections>)
    const target = screen.getByText('Recovery')
    target.scrollIntoView = vi.fn()

    fireEvent.click(screen.getByRole('tab', { name: 'Werkzaamheden' }))
    expect(target.closest('[hidden]')).not.toBeNull()
    act(() => window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', { detail: { area: 'planning', targetId: 'recovery-target' } })))

    expect(screen.getByRole('tab', { name: 'Planning' }).getAttribute('aria-selected')).toBe('true')
    expect(target.closest('[hidden]')).toBeNull()
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })
})
