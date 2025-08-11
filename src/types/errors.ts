export type ChatError = 
  | ProviderError
  | ValidationError
  | NetworkError
  | UnknownError;

export interface ProviderError {
  kind: 'provider';
  provider: 'vercel' | 'cli';
  message: string;
  originalError?: unknown;
}

export interface ValidationError {
  kind: 'validation';
  field?: string;
  message: string;
}

export interface NetworkError {
  kind: 'network';
  message: string;
  statusCode?: number;
  retryable: boolean;
}

export interface UnknownError {
  kind: 'unknown';
  message: string;
  originalError: unknown;
}
