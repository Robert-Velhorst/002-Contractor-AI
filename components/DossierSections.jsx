import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'

const SectionContext = createContext('all')
const SECTIONS = [
  ['all', 'Alle onderdelen', 'All sections'], ['work', 'Werkzaamheden', 'Work'],
  ['planning', 'Planning', 'Planning'], ['documents', 'Documenten', 'Documents'],
  ['quality', 'Kwaliteit & veiligheid', 'Quality & safety'], ['finance', 'Financiën', 'Finance'],
  ['client', 'Klantcontact', 'Client contact'],
]

export function DossierSections({ children, locale = 'nl-NL', fieldScoped = false }) {
  const [active, setActive] = useState('all')
  const [pendingNavigation, setPendingNavigation] = useState(null)
  const tabs = useRef([])
  const id = useId()
  const sections = useMemo(() => SECTIONS.filter(([key]) => !fieldScoped || !['finance', 'client'].includes(key)), [fieldScoped])
  const selected = sections.some(([key]) => key === active) ? active : 'all'
  const nl = locale === 'nl-NL'

  useEffect(() => {
    const navigate = event => {
      const area = event.detail?.area
      const targetId = event.detail?.targetId
      if (!sections.some(([key]) => key === area) || typeof targetId !== 'string') return
      setPendingNavigation({ area, targetId })
      setActive(area)
    }
    window.addEventListener('contractor:dossier-navigate', navigate)
    return () => window.removeEventListener('contractor:dossier-navigate', navigate)
  }, [fieldScoped, sections])

  useEffect(() => {
    if (!pendingNavigation || selected !== pendingNavigation.area) return
    document.getElementById(pendingNavigation.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingNavigation(null)
  }, [pendingNavigation, selected])

  function moveFocus(event, index) {
    const target = { ArrowRight: (index + 1) % sections.length, ArrowLeft: (index + sections.length - 1) % sections.length, Home: 0, End: sections.length - 1 }[event.key]
    if (target === undefined) return
    event.preventDefault()
    setActive(sections[target][0])
    tabs.current[target]?.focus()
  }

  return <SectionContext.Provider value={selected}>
    <div className="dossier-tabs" role="tablist" aria-label={nl ? 'Dossieronderdelen' : 'Dossier sections'}>
      {sections.map(([key, labelNl, labelEn], index) => <button
        key={key} ref={element => { tabs.current[index] = element }} type="button" role="tab"
        id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={selected === key}
        tabIndex={selected === key ? 0 : -1} onKeyDown={event => moveFocus(event, index)} onClick={() => setActive(key)}
      >{nl ? labelNl : labelEn}</button>)}
    </div>
    <div className="dossier-content" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${selected}`} tabIndex={0}>{children}</div>
  </SectionContext.Provider>
}

export function DossierSection({ areas, children }) {
  const active = useContext(SectionContext)
  return <div className="dossier-section" hidden={active !== 'all' && !areas.includes(active)}>{children}</div>
}
