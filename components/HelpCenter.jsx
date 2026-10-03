import { useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, Search } from 'lucide-react'
import './HelpCenter.css'

const AUDIENCES = [
  { id: 'contractor', nl: 'Aannemer', en: 'Contractor' },
  { id: 'field', nl: 'Uitvoerende', en: 'Field worker' },
  { id: 'client', nl: 'Klant', en: 'Client' },
]

const TOPICS = [
  {
    audience: 'contractor', destination: 'pipeline',
    title: { nl: 'Van aanvraag naar uitvoerbare opdracht', en: 'Turn an enquiry into ready-to-deliver work' },
    summary: { nl: 'Leg de klantvraag en opname vast voordat je scope, prijs of planning toezegt.', en: 'Record the client request and survey before committing scope, price, or dates.' },
    steps: {
      nl: ['Registreer de aanvraag met contactgegevens, locatie en gewenste uitkomst.', 'Leg opname, hoeveelheden, uitgangspunten en onzekerheden vast in het dossier.', 'Controleer calculatie, scope, risico’s en offerteversie. Geef pas een opdracht vrij na de vereiste beoordeling en bevestiging.'],
      en: ['Register the enquiry with contact details, location, and desired outcome.', 'Record the survey, quantities, assumptions, and unknowns in the job dossier.', 'Check estimate, scope, risks, and quote revision. Release work only after required review and confirmation.'],
    },
  },
  {
    audience: 'contractor', destination: 'resources',
    title: { nl: 'Posities en uitvoerenden plannen', en: 'Plan positions and crew' },
    summary: { nl: 'Maak duidelijk werk waarop geschikte uitvoerenden zich kunnen inschrijven.', en: 'Publish clear work positions that eligible workers can apply for.' },
    steps: {
      nl: ['Deel het werk op in vakgebied, plek, start/einde, duur, vergoeding en benodigd aantal mensen.', 'Controleer kwalificaties, beschikbaarheid, capaciteit, materialen en toegang.', 'Bevestig plaatsingen pas wanneer alle actuele voorwaarden kloppen; belangstelling is nog geen opdracht.'],
      en: ['Define the trade, location, start/end, duration, rate, and number of people required.', 'Check qualifications, availability, capacity, materials, and site access.', 'Confirm placements only when current prerequisites pass; an application is not yet an assignment.'],
    },
  },
  {
    audience: 'contractor', destination: 'approvals',
    title: { nl: 'Besluiten en wijzigingen beoordelen', en: 'Review decisions and changes' },
    summary: { nl: 'Houd prijs-, scope-, plannings- en uitvoeringswijzigingen gekoppeld aan hun bron.', en: 'Keep price, scope, schedule, and delivery changes tied to their source.' },
    steps: {
      nl: ['Open Goedkeuringen en controleer de actuele bronversie en eventuele bijlagen.', 'Beoordeel gevolgen voor tijd, geld, veiligheid, materiaal en andere werkzaamheden.', 'Een onbekende netwerkuitkomst is geen bewijs van mislukking: gebruik de aangeboden retry voor dezelfde aanvraag. Externe toezeggingen blijven geblokkeerd tot bevestiging.'],
      en: ['Open Approvals and check the current source revision and any attached evidence.', 'Assess time, cost, safety, material, and dependency impacts.', 'An unknown network result does not prove failure: use the offered retry for the same request. External commitments remain blocked until confirmed.'],
    },
  },
  {
    audience: 'contractor', destination: 'field',
    title: { nl: 'Een tekort of blokkade oplossen', en: 'Resolve a shortage or blocker' },
    summary: { nl: 'Verbind de veldmelding met het geraakte werk en de eerstvolgende veilige actie.', en: 'Connect the field report to affected work and the next safe action.' },
    steps: {
      nl: ['Open de melding en controleer foto, locatie, hoeveelheid en betrokken taak.', 'Leg vast wat daardoor niet door kan en wie of welk materiaal nodig is.', 'Herplan of bestel pas na controle van voorraad, levertijd, bevoegdheid en benodigde goedkeuring.'],
      en: ['Open the report and check its photo, location, quantity, and affected task.', 'Record what is blocked and which person or material is needed.', 'Reschedule or order only after checking stock, lead time, authority, and required approval.'],
    },
  },
  {
    audience: 'field', destination: 'field',
    title: { nl: 'Je werkpakket openen en offline meenemen', en: 'Open your work pack and take it offline' },
    summary: { nl: 'Controleer dat de opdracht en revisie bij jouw toewijzing horen voordat je vertrekt.', en: 'Check the assignment and revision before heading to site.' },
    steps: {
      nl: ['Open Buitendienst en selecteer jouw toegewezen opdracht.', 'Controleer adres, tijd, toegang, instructies, taken, materialen en veiligheidsvoorwaarden.', 'Bewaar het werkpakket offline wanneer je verbinding hebt. Een lokaal bewaarde melding is nog niet door kantoor ontvangen.'],
      en: ['Open Field updates and select your assigned job.', 'Check address, time, access, instructions, tasks, materials, and safety prerequisites.', 'Save the work pack offline while connected. A locally saved report has not yet been received by the office.'],
    },
  },
  {
    audience: 'field', destination: 'field',
    title: { nl: 'Startvoorwaarden, veiligheid en kwaliteit', en: 'Start checks, safety, and quality' },
    summary: { nl: 'Begin niet wanneer instructies, toegang, materieel of veilige omstandigheden ontbreken.', en: 'Do not start when instructions, access, equipment, or safe conditions are missing.' },
    steps: {
      nl: ['Lees de actuele tekening en werkinstructie; meld een onduidelijke of afwijkende revisie.', 'Doorloop de vereiste LMRA, werkvergunning, materiaal- en inspectiecontroles.', 'Stop en meld direct een gevaar of ontbrekende startvoorwaarde. Een melding heft een blokkade niet automatisch op.'],
      en: ['Read the current drawing and work instruction; report unclear or conflicting revisions.', 'Complete required LMRA, work permit, material, and inspection checks.', 'Stop and report hazards or missing prerequisites immediately. A report does not automatically clear a blocker.'],
    },
  },
  {
    audience: 'field', destination: 'field',
    title: { nl: 'Voortgang, foto’s en afwijkingen melden', en: 'Report progress, photos, and exceptions' },
    summary: { nl: 'Leg vast wat af is, wat nog openstaat en wat het vervolg verhindert.', en: 'Record what is complete, what remains, and what is preventing progress.' },
    steps: {
      nl: ['Koppel je voortgang aan de juiste taak en gebruik de werkelijke hoeveelheid of status.', 'Voeg alleen noodzakelijke foto’s en context toe; vermijd onnodige persoonsgegevens.', 'Controleer de synchronisatiestatus. Probeer een lokale melding opnieuw te synchroniseren in plaats van dezelfde melding opnieuw aan te maken.'],
      en: ['Link progress to the correct task and enter the actual quantity or status.', 'Add only necessary photos and context; avoid unnecessary personal data.', 'Check sync status. Retry syncing a local report instead of creating a duplicate.'],
    },
  },
  {
    audience: 'field', destination: 'field',
    title: { nl: 'Onbeschikbaarheid of standby doorgeven', en: 'Report unavailability or standby' },
    summary: { nl: 'Geef operationele beschikbaarheid door zonder medische of privéredenen vast te leggen.', en: 'Share operational availability without recording medical or private reasons.' },
    steps: {
      nl: ['Meld zo vroeg mogelijk wanneer je niet beschikbaar bent of alleen op afroep kunt werken.', 'Geef de periode of het eerstvolgende moment voor afstemming op.', 'De planner controleert getroffen opdrachten en vervanging; een standby-reactie is geen automatische plaatsing.'],
      en: ['Report as early as possible when unavailable or only available on call.', 'Provide the period or next time to review availability.', 'The planner checks affected jobs and replacements; standby interest is not an automatic placement.'],
    },
  },
  {
    audience: 'client', destination: 'clients',
    title: { nl: 'Veilig het klantgesprek openen', en: 'Open the client conversation securely' },
    summary: { nl: 'Gebruik je persoonlijke projectlink en deel die niet met anderen.', en: 'Use your project link and do not share it with others.' },
    steps: {
      nl: ['Open de link die je van de aannemer hebt ontvangen.', 'Werkt de link niet of is deze verlopen, vraag de aannemer om hulp of een nieuwe link.', 'Je ziet alleen informatie die voor jou is vrijgegeven; interne notities en gegevens van anderen blijven afgeschermd.'],
      en: ['Open the link sent to you by the contractor.', 'If the link fails or has expired, contact the contractor for help or a new link.', 'You see only information released to you; internal notes and other people’s data remain private.'],
    },
  },
  {
    audience: 'client', destination: 'clients',
    title: { nl: 'Een vraag of foto meesturen', en: 'Send a question or photo' },
    summary: { nl: 'Geef aan waar je bericht over gaat, zodat het aan de juiste opdracht wordt gekoppeld.', en: 'Say what your message relates to so it can be linked to the right job.' },
    steps: {
      nl: ['Beschrijf de plek, het onderdeel en wat je ziet of nodig hebt.', 'Voeg alleen relevante foto’s toe en vermeld wanneer of waar ze zijn gemaakt.', 'AI kan informatie helpen ordenen of een conceptvoorstel maken; een medewerker controleert dit voordat een toezegging wordt gedaan.'],
      en: ['Describe the location, item, and what you see or need.', 'Attach relevant photos only and say when or where they were taken.', 'AI may help organize information or draft a response; a person reviews it before any commitment.'],
    },
  },
  {
    audience: 'client', destination: 'clients',
    title: { nl: 'Een keuze of wijziging bevestigen', en: 'Confirm a choice or change' },
    summary: { nl: 'Reageer op het genummerde voorstel zelf, niet alleen met een losse instemming.', en: 'Respond to the numbered proposal itself, not with an unqualified “yes”.' },
    steps: {
      nl: ['Open het voorstel en controleer omschrijving, gevolgen en versienummer.', 'Kies akkoord, aanpassing vragen of afwijzen. Licht een aanpassing toe.', 'Een datum, prijs of scope verandert pas nadat de bevoegde persoon het besluit heeft verwerkt en teruggekoppeld.'],
      en: ['Open the proposal and check its description, impacts, and revision number.', 'Choose accept, request a change, or reject. Explain any requested change.', 'A date, price, or scope changes only after an authorized person processes and confirms the decision.'],
    },
  },
]

function localized(locale, value) {
  return locale === 'nl-NL' ? value.nl : value.en
}

export default function HelpCenter({ locale = 'en-GB', fieldScoped = false, destinations = [], onNavigate }) {
  const initialAudience = fieldScoped ? 'field' : 'contractor'
  const [audience, setAudience] = useState(initialAudience)
  const [query, setQuery] = useState('')
  const isDutch = locale === 'nl-NL'
  const availableAudiences = fieldScoped ? AUDIENCES.filter(item => item.id === 'field') : AUDIENCES
  const topics = useMemo(() => {
    const search = query.trim().toLocaleLowerCase(locale)
    return TOPICS.filter(topic => topic.audience === audience && (!search || [
      localized(locale, topic.title),
      localized(locale, topic.summary),
      ...topic.steps[isDutch ? 'nl' : 'en'],
    ].join(' ').toLocaleLowerCase(locale).includes(search)))
  }, [audience, isDutch, locale, query])

  return (
    <section className="help-center panel page-panel" data-testid="help-center">
      <div className="panel-heading help-center-heading">
        <div className="help-center-title"><BookOpen size={20} aria-hidden="true" /><div><h2>{isDutch ? 'Praktische hulp' : 'Practical help'}</h2><p>{isDutch ? 'Stappen voor het werk dat je nu doet.' : 'Steps for the work you are doing now.'}</p></div></div>
        <label className="help-search"><Search size={17} aria-hidden="true" /><span className="visually-hidden">{isDutch ? 'Hulp doorzoeken' : 'Search help'}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={isDutch ? 'Zoek in hulp' : 'Search help'} /></label>
      </div>
      <div className="help-audiences" role="tablist" aria-label={isDutch ? 'Voor wie is de hulp?' : 'Choose a help audience'}>
        {availableAudiences.map(item => <button key={item.id} id={`help-tab-${item.id}`} type="button" role="tab" aria-controls="help-topics" aria-selected={audience === item.id} className={audience === item.id ? 'help-audience-active' : ''} onClick={() => setAudience(item.id)}>{localized(locale, { nl: item.nl, en: item.en })}</button>)}
      </div>
      <div className="help-topic-list" id="help-topics" role="tabpanel" aria-labelledby={`help-tab-${audience}`} tabIndex={0}>
        {topics.map(topic => (
          <details className="help-topic" key={topic.title.en}>
            <summary><span><strong>{localized(locale, topic.title)}</strong><small>{localized(locale, topic.summary)}</small></span><span className="help-disclosure" aria-hidden="true">+</span></summary>
            <div className="help-topic-body">
              <ol>{topic.steps[isDutch ? 'nl' : 'en'].map(step => <li key={step}>{step}</li>)}</ol>
              {destinations.includes(topic.destination) ? <button className="secondary-button" type="button" onClick={() => onNavigate(topic.destination)}><ArrowUpRight size={15} />{isDutch ? 'Open dit werkgebied' : 'Open this workspace'}</button> : null}
            </div>
          </details>
        ))}
        {!topics.length ? <p className="help-empty" role="status">{isDutch ? 'Geen onderwerpen gevonden. Probeer een ander woord.' : 'No topics found. Try another search.'}</p> : null}
      </div>
    </section>
  )
}
