// Application constants
export const JWT_EXPIRATION_SECONDS = 60;
export const MAX_CREDITS_PER_TRANSACTION = 10000;
export const DEFAULT_TRANSACTION_LIMIT = 50;
export const MAX_TRANSACTION_LIMIT = 100;

// Centralized error messages
export const ERROR_MESSAGES = {
  INVALID_USER_ID: 'Valid user ID is required',
  INVALID_AMOUNT: `Valid amount between 1 and ${MAX_CREDITS_PER_TRANSACTION} is required`,
  INVALID_TOKEN: 'Valid token is required',
  INSUFFICIENT_CREDITS: 'Insufficient credits',
  UNAUTHORIZED: 'Unauthorized',
  USER_EXISTS: 'User already exists',
  INTERNAL_ERROR: 'Internal server error'
} as const;
