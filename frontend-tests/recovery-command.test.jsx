import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useRecoveryCommand } from '../recovery-command'

function commandHook(api, options = {}) {
  return renderHook(props => useRecoveryCommand({ api, jobId: 'job/1', canEdit: true,
    pending: null, setPending: vi.fn(), ...props }), { initialProps: options })
}

it('takes a synchronous lock before React can render the busy state', async () => {
  let finish
  const api = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const setPending = vi.fn(), callback = vi.fn()
  const hook = commandHook(api, { setPending })
  let first, duplicate
  act(() => {
    first = hook.result.current.execute({ entryKey: 'first' }, callback)
    duplicate = hook.result.current.execute({ entryKey: 'duplicate' }, callback)
  })
  expect(api).toHaveBeenCalledTimes(1)
  expect(hook.result.current.busy).toBe(true)
  expect(await duplicate).toBe(false)
  await act(async () => { finish({ replayed: false }); await first })
  expect(setPending.mock.calls).toEqual([[{ entryKey: 'first' }], [null]])
  expect(callback).toHaveBeenCalledExactlyOnceWith({ replayed: false })
  expect(hook.result.current.busy).toBe(false)
})

it.each([400, 403, 404, 409, 413, 423])('permits correction after definitive rejection %s', async status => {
  const error = Object.assign(new Error('Rejected'), { statusCode: status })
  const setPending = vi.fn(), onError = vi.fn(), callback = vi.fn()
  const hook = commandHook(vi.fn().mockRejectedValue(error), { setPending, onError })
  await act(async () => expect(await hook.result.current.execute({ entryKey: 'rejected' }, callback)).toBe(false))
  expect(setPending).toHaveBeenLastCalledWith(null)
  expect(onError).toHaveBeenCalledWith(error)
  expect(callback).not.toHaveBeenCalled()
})

it.each([undefined, 401, 429, 500, 503])('preserves uncertain or authentication-blocked command for status %s', async status => {
  const command = { action: 'actual_cost_attribution', entryKey: 'retained', amount: 25 }
  const api = vi.fn().mockRejectedValue(Object.assign(new Error('Uncertain'), { status }))
  const setPending = vi.fn()
  const hook = commandHook(api, { pending: command, setPending })
  await act(async () => { await hook.result.current.execute({ entryKey: 'different', amount: 50 }) })
  expect(setPending.mock.calls).toEqual([[command]])
  expect(api.mock.calls[0]).toEqual(['/api/ledger/jobs/job%2F1/operational-recovery', {
    method: 'POST', body: JSON.stringify(command),
  }])
})

it('checks current edit rights before replaying a retained command', async () => {
  const api = vi.fn(), setPending = vi.fn()
  const hook = commandHook(api, { pending: { entryKey: 'retained' }, canEdit: false, setPending })
  await act(async () => expect(await hook.result.current.execute({ entryKey: 'new' })).toBe(false))
  expect(api).not.toHaveBeenCalled()
  expect(setPending).not.toHaveBeenCalled()
})

it('does not classify a successful-request callback failure as an uncertain API write', async () => {
  const setPending = vi.fn(), onError = vi.fn(), callbackError = new Error('Display refresh failed')
  const hook = commandHook(vi.fn().mockResolvedValue({ retained: true }), { setPending, onError })
  await act(async () => expect(hook.result.current.execute({ entryKey: 'saved' }, () => { throw callbackError }))
    .rejects.toBe(callbackError))
  expect(setPending).toHaveBeenLastCalledWith(null)
  expect(onError).not.toHaveBeenCalled()
  expect(hook.result.current.busy).toBe(false)
})
