/**
 * @file Entry point for the valorant-api package.
 *
 * ```js
 * import { Valorant } from 'valorant-api';
 * // or
 * import Valorant from 'valorant-api';
 * ```
 */

export { Valorant } from './Valorant.js';
export { default as default } from './Valorant.js';

export {
  ValorantError,
  RiotClientNotRunningError,
  InvalidLockfileError,
  AuthenticationError,
  TokenExpiredError,
  NetworkError,
  RateLimitError,
  APIError,
  LoadoutError,
  MetadataError,
} from './errors.js';

export { ItemTypes } from './endpoints/inventory.js';

export { CLIENT_PLATFORM } from './util/request.js';

export { MetadataCache } from './metadata/cache.js';
