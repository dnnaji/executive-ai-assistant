import type { ChatError } from '../types/errors';

export const createProviderError = (
  provider: 'vercel' | 'cli',
  message: string,
  originalError?: unknown
): ChatError => ({
  kind: 'provider',
  provider,
  message,
  originalError
});

export const createNetworkError = (
  message: string,
  statusCode?: number,
  retryable = true
): ChatError => ({
  kind: 'network',
  message,
  statusCode,
  retryable
});
