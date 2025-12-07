/**
 * Custom error types for better error handling
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class TranscriptNotFoundError extends Error {
  constructor(videoId: string) {
    super(`No transcript available for video: ${videoId}`);
    this.name = "TranscriptNotFoundError";
  }
}

export class VideoNotFoundError extends Error {
  constructor(videoId: string) {
    super(`Video not found: ${videoId}`);
    this.name = "VideoNotFoundError";
  }
}

export class IndexingError extends Error {
  constructor(message: string) {
    super(`Indexing failed: ${message}`);
    this.name = "IndexingError";
  }
}

export class QueryError extends Error {
  constructor(message: string) {
    super(`Query failed: ${message}`);
    this.name = "QueryError";
  }
}

export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class RateLimitError extends Error {
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    this.name = "RateLimitError";
  }
}

/**
 * Error response formatter
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

/**
 * Map errors to appropriate HTTP status codes and messages
 */
export function handleError(error: unknown): ErrorResponse {
  // Known error types
  if (error instanceof ValidationError) {
    return {
      error: "Validation Error",
      message: error.message,
      statusCode: 400,
    };
  }

  if (error instanceof TranscriptNotFoundError) {
    return {
      error: "Transcript Not Found",
      message: error.message,
      statusCode: 404,
    };
  }

  if (error instanceof VideoNotFoundError) {
    return {
      error: "Video Not Found",
      message: error.message,
      statusCode: 404,
    };
  }

  if (error instanceof IndexingError) {
    return {
      error: "Indexing Error",
      message: error.message,
      statusCode: 500,
    };
  }

  if (error instanceof QueryError) {
    return {
      error: "Query Error",
      message: error.message,
      statusCode: 500,
    };
  }

  if (error instanceof TimeoutError) {
    return {
      error: "Timeout Error",
      message: error.message,
      statusCode: 504,
    };
  }

  if (error instanceof RateLimitError) {
    return {
      error: "Rate Limit Exceeded",
      message: error.message,
      statusCode: 429,
    };
  }

  // Generic error handling
  if (error instanceof Error) {
    // Check for specific error messages
    const message = error.message.toLowerCase();

    if (message.includes("transcript")) {
      return {
        error: "Transcript Error",
        message: error.message,
        statusCode: 404,
      };
    }

    if (message.includes("video")) {
      return {
        error: "Video Error",
        message: error.message,
        statusCode: 404,
      };
    }

    if (message.includes("timeout")) {
      return {
        error: "Timeout Error",
        message: error.message,
        statusCode: 504,
      };
    }

    if (message.includes("api key") || message.includes("unauthorized")) {
      return {
        error: "Authentication Error",
        message: "Invalid API key or authentication failed",
        statusCode: 401,
      };
    }

    // Generic server error
    return {
      error: "Server Error",
      message: error.message,
      statusCode: 500,
    };
  }

  // Unknown error type
  return {
    error: "Unknown Error",
    message: "An unexpected error occurred",
    statusCode: 500,
    details: error,
  };
}

/**
 * Promise wrapper with timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = "operation"
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}
