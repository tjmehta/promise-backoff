import { AbortSignal } from 'fast-abort-controller'
import BaseError from 'baseerr'
import raceAbort from 'race-abort'
import timeout from 'abortable-timeout'

class RetryableError extends BaseError<{ originalError: Error }> {
  originalError!: number
}

export type Opts = {
  timeouts: Iterable<number> | AsyncIterable<number>
  minTimeout?: number | null | undefined
  maxTimeout?: number | null | undefined
  jitter?: ((duration: number) => number) | null | undefined
  signal?: AbortSignal | null | undefined
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
    try {
      return await task({
        retry: (err: Error) => {
          throw new RetryableError('retryable', { originalError: err })
        },
        signal,
      })
    } catch (err) {
      if (err instanceof RetryableError) {
        // get backoff timeout duration from iterator
        let result: IteratorResult<number> = { done: true, value: null }
        if (iterator) result = iterator.next()
        if (asyncIterator) {
          result = await raceAbort(signal, asyncIterator.next())
        }

        // no more retries
        if (result.done) {
          throw err.originalError
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
      }
      throw err
    }
  }
  // todo
  return raceAbort(signal, attempt())
}

function fullJitter(duration: number): number {
  return Math.random() * duration
}
