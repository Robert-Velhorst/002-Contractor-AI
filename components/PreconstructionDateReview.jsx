export default function PreconstructionDateReview({ comparison, t }) {
  if (!comparison) return null
  return (
    <details className="work-plan-date-review" data-testid="preconstruction-date-review">
      <summary>{t('Planned work dates')}</summary>
      <p>{t('Work-date basis: {timeZone}', { timeZone: comparison.timeZone })}</p>
      {comparison.timeZoneSource === 'default' ? <p>{t('No site time zone is recorded; Europe/Amsterdam is used for this date comparison.')}</p> : null}
      {comparison.status === 'unavailable' ? <p>{t('The expected work window is missing or cannot be compared.')}</p> : <p>{t('Expected work window: {start} to {end}', { start: comparison.windowStart, end: comparison.windowEnd })}</p>}
      {comparison.roles.map((role, index) => (
        <section key={`${role.kind}:${role.role}:${index}`}>
          <strong>{role.kind === 'supervision' ? `${t('Supervision')}: ` : ''}{role.role}</strong>
          {!role.distributionRecorded ? <p>{t('No dated estimate is recorded for this role.')}</p> : null}
          {role.undatedHours > 0 ? <p role="status">{t('{hours} planned hours cannot be assigned to a work date; check the task times.', { hours: role.undatedHours })}</p> : null}
          <ul>{role.days.map(day => (
            <li key={day.date}>
              <time dateTime={day.date}>{day.date}</time>
              <span>{day.estimatedHours === null
                ? t('{hours} h planned; dated estimate unknown', { hours: day.plannedHours })
                : t('{estimated} h estimated · {planned} h planned · variance {variance} h', {
                  estimated: day.estimatedHours, planned: day.plannedHours,
                  variance: `${day.varianceHours > 0 ? '+' : ''}${day.varianceHours}`
                })}</span>
              {day.outsideWindow ? <strong className="work-plan-date-warning">{t('Outside expected work window')}</strong> : null}
            </li>
          ))}</ul>
        </section>
      ))}
    </details>
  )
}
