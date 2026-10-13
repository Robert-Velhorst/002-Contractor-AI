import { ArrowRight, CalendarDays, MapPin } from 'lucide-react'

export default function TodayAgenda({ jobs = [], now = new Date(), locale = 'nl-NL', onOpenJob, onOpenSchedule }) {
  const nl = locale === 'nl-NL'
  const date = new Date(now)
  const scheduled = jobs.filter(job => {
    if (!job.scheduledStart || ['completed', 'cancelled', 'archived'].includes(job.status)) return false
    const start = new Date(job.scheduledStart)
    return Number.isFinite(start.getTime()) && start.toDateString() === date.toDateString()
  }).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart))
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })

  return <section className="today-agenda" aria-labelledby="today-agenda-heading" data-testid="today-agenda">
    <header><h2 id="today-agenda-heading">{nl ? 'Vandaag gepland' : 'Scheduled today'}</h2><CalendarDays size={19} aria-hidden="true" /></header>
    {scheduled.length ? <ol className="agenda-list">
      {scheduled.map(job => <li key={job.id}>
        <time dateTime={job.scheduledStart}>{time.format(new Date(job.scheduledStart))}</time>
        <div>
          {onOpenJob ? <button type="button" onClick={() => onOpenJob(job)}>{job.title}</button> : <strong>{job.title}</strong>}
          {job.clientName ? <span>{job.clientName}</span> : null}
          {job.city || job.address ? <small><MapPin size={13} aria-hidden="true" />{job.city || job.address}</small> : null}
        </div>
      </li>)}
    </ol> : <div className="agenda-empty"><CalendarDays size={32} strokeWidth={1.4} aria-hidden="true" /><p>{nl ? 'Geen geplande opdrachten vandaag' : 'No jobs scheduled today'}</p></div>}
    {onOpenSchedule ? <button type="button" className="text-button agenda-link" onClick={onOpenSchedule}>{nl ? 'Planning bekijken' : 'View planning'}<ArrowRight size={16} aria-hidden="true" /></button> : null}
  </section>
}
