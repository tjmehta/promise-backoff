import { AbortSignal } from 'fast-abort-controller'
import promiseBackoff from '../index'
import timeout from 'abortable-timeout'

jest.useFakeTimers()

describe('promiseBackoff', () => {
  it('should resolve result', async () => {
    const result = 10
    const task = jest.fn(async function ({ retry }) {
      return Promise.resolve(result)
    })
    const timeouts = [10, 20, 30]
    const promise = promiseBackoff({ timeouts }, task)
    await expect(promise).resolves.toEqual(result)
  })

  it('should reject with error', async () => {
    const err = new Error('boom')
    const task = jest.fn(async function ({ retry }) {
      return Promise.reject(err)
    })
    const timeouts = [10, 20, 30]
    const promise = promiseBackoff({ timeouts }, task)
    await expect(promise).rejects.toThrow(err)
  })

  it('should backoff until failure', async () => {
    const err = new Error('boom')
    const taskDuration = 100
    const task = jest.fn(async function ({ retry }) {
      await timeout(taskDuration, new AbortSignal())
      return retry(err)
    })
    const timeouts = [10, 20, 30]
    const promise = promiseBackoff({ timeouts }, task)
    await waitForMockToHaveBeenCalledTimes(task, 1)
    await runTimersToTime(taskDuration)
    await runTimersToTime(timeouts[0])
    await waitForMockToHaveBeenCalledTimes(task, 2)
    await runTimersToTime(taskDuration)
    await runTimersToTime(timeouts[1])
    await waitForMockToHaveBeenCalledTimes(task, 3)
    await runTimersToTime(taskDuration)
    await runTimersToTime(timeouts[2])
    await waitForMockToHaveBeenCalledTimes(task, 4)
    await runTimersToTime(taskDuration)
    await expect(promise).rejects.toThrow(err)
  })
})

async function runTimersToTime(duration: number) {
  jest.runTimersToTime(duration)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function waitForMockToHaveBeenCalledTimes(
  fn: jest.Mock,
  times: number,
  maxTicks: number = 10,
) {
  let count = 0
  while (fn.mock.calls.length !== times) {
    count++
    await Promise.resolve()
    if (count === maxTicks) expect(fn).toHaveBeenCalledTimes(times)
  }
}
