import { expect, it } from 'vitest'
import { snapshotWorkerNotifications } from '../offline-work-packs.mjs'

it('retains only bounded worker-visible notification fields in the encrypted offline snapshot', () => {
  const inbox = snapshotWorkerNotifications({ unreadCount: 2, notifications: [{
    id: 'notice-1', type: 'position_offer', title: 'Werk aangeboden', body: 'Arnhem · 8 uur',
    createdAt: '2026-09-26T08:00:00.000Z', readAt: null, href: 'https://unsafe.example', workerId: 'private-id'
  }] })
  expect(inbox.unreadCount).toBe(2)
  expect(inbox.notifications).toHaveLength(1)
  expect(inbox.notifications[0]).toMatchObject({ id: 'notice-1', type: 'position_offer', title: 'Werk aangeboden', body: 'Arnhem · 8 uur', readAt: null })
  expect(inbox.notifications[0]).not.toHaveProperty('href')
  expect(inbox.notifications[0]).not.toHaveProperty('workerId')
})

it('bounds the saved inbox and rejects unsafe unread counters', () => {
  const notifications = Array.from({ length: 130 }, (_, index) => ({ id: `notice-${index}`, title: 'n'.repeat(220), body: 'b'.repeat(1400) }))
  const inbox = snapshotWorkerNotifications({ unreadCount: -1, notifications })
  expect(inbox.notifications).toHaveLength(100)
  expect(inbox.notifications[0].title).toHaveLength(200)
  expect(inbox.notifications[0].body).toHaveLength(1200)
  expect(inbox.unreadCount).toBe(0)
})
