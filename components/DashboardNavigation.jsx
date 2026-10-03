import { createElement } from 'react'

const GROUPS = [
  { id: 'work', nl: 'Werk', en: 'Work', keys: ['today', 'pipeline', 'jobs', 'approvals'] },
  { id: 'delivery', nl: 'Uitvoering', en: 'Delivery', keys: ['schedule', 'dispatch', 'field', 'resources'] },
  { id: 'business', nl: 'Organisatie', en: 'Business', keys: ['clients', 'finance', 'performance', 'operations'] },
  { id: 'support', nl: 'Ondersteuning', en: 'Support', keys: ['help'] },
]

export default function DashboardNavigation({ items, section, onSelect, onIntent, locale, pendingApprovals = 0, loading = false }) {
  const knownKeys = new Set(GROUPS.flatMap(group => group.keys))
  return <nav className="nav-list" aria-label={locale === 'nl-NL' ? 'Werkgebieden' : 'Work areas'}>
    {GROUPS.map(group => {
      const entries = group.keys.map(key => items.find(item => item[0] === key)).filter(Boolean)
      if (group.id === 'business') entries.push(...items.filter(([key]) => !knownKeys.has(key)))
      if (!entries.length) return null
      return <div className="nav-group" key={group.id}>
        <p className="nav-group-label">{locale === 'nl-NL' ? group.nl : group.en}</p>
        {entries.map(([key, label, icon]) => <button
          key={key} type="button" className={section === key ? 'nav-active' : ''}
          aria-current={section === key ? 'page' : undefined}
          onClick={() => onSelect(key)} disabled={loading && !['today', 'jobs'].includes(key)}
          onPointerEnter={() => { if (!loading) onIntent?.(key) }}
          onFocus={() => { if (!loading) onIntent?.(key) }}
        >
          {createElement(icon, { size: 18, 'aria-hidden': true })}
          <span>{label}</span>
          {key === 'approvals' && pendingApprovals > 0 ? <b>{pendingApprovals}</b> : null}
        </button>)}
      </div>
    })}
  </nav>
}
