// Structured logging helper
export const logError = (context: string, error: unknown, userId?: string) => {
  const errorInfo = {
    context,
    timestamp: new Date().toISOString(),
    userId: userId || 'unknown',
    error: error instanceof Error ? error.message : String(error)
  };
  console.error(JSON.stringify(errorInfo));
};
