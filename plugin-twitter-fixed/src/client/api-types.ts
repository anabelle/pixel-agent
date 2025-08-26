/**
 * Common types for Twitter plugin API responses
 */

import type { Tweet } from "./tweets";
import type { Profile } from "./profile";

/**
 * Rate limit information from Twitter API headers
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  resetDate: Date;
}

/**
 * User-specific rate limit information (24-hour limits)
 */
export interface UserRateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  resetDate: Date;
}

/**
 * Combined rate limit status
 */
export interface RateLimitStatus {
  rateLimit?: RateLimitInfo;
  userRateLimit?: UserRateLimitInfo;
  isRateLimited: boolean;
  retryAfter?: number; // seconds until reset
}

/**
 * Authentication result with rate limit awareness
 */
export type AuthResult<T> =
  | { success: true; data: T; rateLimit?: RateLimitStatus }
  | { success: false; error: Error; rateLimit?: RateLimitStatus };

/**
 * Response for paginated tweets queries
 */
export interface QueryTweetsResponse {
  tweets: Tweet[];
  next?: string;
  previous?: string;
}

/**
 * Response for paginated profiles queries
 */
export interface QueryProfilesResponse {
  profiles: Profile[];
  next?: string;
  previous?: string;
}

/**
 * Generic API result container
 */
export type RequestApiResult<T> =
  | { success: true; value: T }
  | { success: false; err: Error };

/**
 * Options for request transformation
 */
export interface FetchTransformOptions {
  /**
   * Transforms the request options before a request is made.
   */
  request: (
    ...args: [input: RequestInfo | URL, init?: RequestInit]
  ) =>
    | [input: RequestInfo | URL, init?: RequestInit]
    | Promise<[input: RequestInfo | URL, init?: RequestInit]>;

  /**
   * Transforms the response after a request completes.
   */
  response: (response: Response) => Response | Promise<Response>;
}