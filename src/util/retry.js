/**
 * @file Retry helper for transient failures.
 *
 * Uses exponential backoff with jitter.
 */

/**
 * @typedef {object} RetryOptions
 * @property {number}  [maxAttempts=3]       Maximum number of attempts
 * @property {number}  [baseDelayMs=500]     Base delay for exponential backoff
 * @property {number}  [maxDelayMs=8000]     Maximum delay
 * @property {(attempt: number, error: Error) => boolean} [shouldRetry]  Predicate
 */

const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

/**
 * Wrap an async function with retry logic.
 *
 * @template T
 * @param {() => Promise<T>} fn  Async function to retry
 * @param {RetryOptions}      [options]
 * @returns {Promise<T>}
 */
export async function retry(fn, options = {}) {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxAttempts) {
        break;
      }

      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(attempt, err)
        : isTransientError(err);

      if (!shouldRetry) {
        break;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs,
        maxDelayMs
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine whether an error is likely transient and worth a retry.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isTransientError(err) {
  // Network / connectivity errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
    return true;
  }

  // Rate limit — we handle this specially in the request layer, but allow retry
  if (err.statusCode === 429 || err.code === 'RATE_LIMITED') {
    return true;
  }

  // 5xx server errors
  if (err.statusCode >= 500 && err.statusCode < 600) {
    return true;
  }

  // Don't retry 4xx (client errors)
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return false;
  }

  return false;
}
