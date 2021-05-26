import { AbortSignal } from 'fast-abort-controller'
import BaseError from 'baseerr'
import raceAbort from 'race-abort'
import timeout from 'abortable-timeout'

class BackoffError extends BaseError<{ attemptNumber: number }> {
  attemptNumber!: number
}

type Opts = {
  timeouts: Iterable<number> | AsyncIterable<number>
  minTimeout?: number
  maxTimeout?: number
  jitter?: (duration: number) => number
  signal?: AbortSignal
}

type TaskOpts<T> = {
  retry: (err: Error) => Promise<T>
  signal: AbortSignal
}

export default async function promiseBackoff<T>(
  opts: Opts,
  task: (opts: TaskOpts<T>) => Promise<T>,
): Promise<T> {
  const timeouts = opts.timeouts
  const minTimeout = opts.minTimeout ?? 0
  const maxTimeout = opts.maxTimeout ?? Infinity
  const signal = opts.signal ?? new AbortSignal() // unaborted signal
  const jitter = opts.jitter ?? fullJitter

  let iterator: Iterator<number> | null = null
  if (Symbol.iterator in timeouts) {
    iterator = (timeouts as Iterable<number>)[Symbol.iterator]()
  }
  let asyncIterator: AsyncIterator<number> | null = null
  if (Symbol.asyncIterator in timeouts) {
    asyncIterator = (timeouts as AsyncIterable<number>)[Symbol.asyncIterator]()
  }

  async function attempt(): Promise<T> {
    let taskResult: Promise<T> | null = null
    let retryCalled = false

    return task({
      retry: async (err: Error) => {
        if (taskResult) return taskResult // lost race
        if (retryCalled) throw new BackoffError('retry already called')
        retryCalled = true

        // get backoff timeout duration from iterator
        let result: IteratorResult<number> = { done: true, value: null }
        if (iterator) result = iterator.next()
        if (asyncIterator) {
          result = await raceAbort(signal, asyncIterator.next())
        }

        // no more retries
        if (result.done) {
          retryCalled = false
          throw err
        }

        // calculate backoff timeout duration
        let timeoutDuration = result.value
        timeoutDuration = jitter(timeoutDuration)
        timeoutDuration = Math.max(timeoutDuration, minTimeout)
        timeoutDuration = Math.min(timeoutDuration, maxTimeout)

        // backoff timeout
        await timeout(timeoutDuration, signal)

        // attempt to retry task
        return await raceAbort(signal, attempt())
      },
      signal,
    }).then(
      (val) => {
        if (retryCalled || taskResult) return val // lost race
        taskResult = Promise.resolve(val)
        return val
      },
      (err) => {
        if (retryCalled || taskResult) throw err // lost race
        taskResult = Promise.reject(err)
        throw err
      },
    )
  }
  // todo
  return raceAbort(signal, attempt())
}

function fullJitter(duration: number): number {
  return Math.random() * duration
}
