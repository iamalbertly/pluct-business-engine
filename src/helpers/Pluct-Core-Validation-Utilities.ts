// Input validation helpers
export const validateUserId = (userId: string): boolean => {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0 || userId.length > 100) {
    return false;
  }
  // Sanitize the input to prevent SQL injection
  const sanitized = sanitizeInput(userId);
  return sanitized === userId; // Only valid if no sanitization was needed
};

export const validateAmount = (amount: number): boolean => {
  const MAX_CREDITS_PER_TRANSACTION = 10000;
  return typeof amount === 'number' && amount > 0 && amount <= MAX_CREDITS_PER_TRANSACTION;
};

// Sanitize input to prevent SQL injection
export const sanitizeInput = (input: string): string => {
  return input.replace(/['"\\;]/g, '');
};

// Safe parseInt with error handling
export const safeParseInt = (value: string | null, defaultValue: number = 0): number => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};
