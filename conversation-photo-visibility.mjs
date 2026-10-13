const observers = new WeakMap()
export const MAX_ACTIVE_PHOTO_PREVIEWS = 8

function photoObservers(document) {
  let group = observers.get(document)
  if (group) return group
  const callbacks = new Map()
  let sequence = 0, scheduled = false
  const Observer = document.defaultView?.IntersectionObserver
  let observer
  function reconcile() {
    const selected = new Set([...callbacks.values()].filter(record => record.eligible)
      .sort((left, right) => right.priority - left.priority || left.distance - right.distance || left.order - right.order)
      .slice(0, MAX_ACTIVE_PHOTO_PREVIEWS))
    // Revoke old leases before admitting replacements, including pending reads.
    for (const record of callbacks.values()) {
      if (record.active && !selected.has(record)) { record.active = false; record.onHidden() }
    }
    for (const record of selected) {
      if (!record.active) { record.active = true; record.onVisible() }
    }
  }
  try {
    if (typeof Observer === 'function') observer = new Observer(entries => {
      for (const entry of entries) {
        const record = callbacks.get(entry.target)
        if (!record) continue
        const rect = entry.boundingClientRect
        record.eligible = entry.isIntersecting && rect.width > 0 && rect.height > 0
        record.distance = Math.abs((rect.top || 0) + rect.height / 2 - (document.defaultView?.innerHeight || 768) / 2)
        if (!record.eligible) record.priority = 0
      }
      reconcile()
    }, { rootMargin: '256px 0px' })
  } catch { observer = undefined }
  group = {
    callbacks,
    register(element, onVisible, onHidden) {
      callbacks.set(element, { onVisible, onHidden, eligible: !observer, active: false, distance: 0, priority: 0, order: sequence++ })
      if (observer) observer.observe(element)
      else reconcile()
    },
    release(element) {
      callbacks.delete(element)
      observer?.unobserve(element)
      if (!callbacks.size) {
        observer?.disconnect()
        if (observers.get(document) === group) observers.delete(document)
      } else if (!scheduled) {
        scheduled = true
        // A whole timeline unmount must not start reads for siblings being removed.
        queueMicrotask(() => { scheduled = false; reconcile() })
      }
    },
    prioritize(element) {
      const record = callbacks.get(element)
      if (!record) return
      record.eligible = true
      record.priority = ++sequence
      reconcile()
    },
  }
  observers.set(document, group)
  return group
}

export function observeConversationPhoto(element, onVisible, onHidden = () => {}) {
  const group = photoObservers(element.ownerDocument)
  group.register(element, onVisible, onHidden)
  return () => group.release(element)
}

export function prioritizeConversationPhoto(element) {
  if (element) observers.get(element.ownerDocument)?.prioritize(element)
}
