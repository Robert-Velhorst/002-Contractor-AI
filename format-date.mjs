export function formatDate(value, fallback = 'Niet vastgelegd') {
  return value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : fallback
}

// Scope reuse to one render so a later render picks up the current system time zone.
export function createDateFormatter(timeZone) {
  let formatter
  return (value, fallback = 'Niet vastgelegd') => {
    if (!value) return fallback
    formatter ??= new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone })
    return formatter.format(new Date(value))
  }
}
