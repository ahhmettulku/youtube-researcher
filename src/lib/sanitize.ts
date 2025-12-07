/**
 * Security utilities for sanitizing user input and preventing XSS attacks
 */

/**
 * Sanitize a string by escaping HTML special characters
 * Prevents XSS attacks by converting potentially dangerous characters
 */
export function sanitizeHTML(str: string): string {
  if (typeof str !== "string") {
    return String(str);
  }

  const htmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return str.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Sanitize an object by recursively sanitizing all string values
 * Useful for sanitizing tool arguments and other nested objects
 */
export function sanitizeObject(obj: any, maxDepth: number = 5): any {
  if (maxDepth <= 0) {
    return "[Max depth reached]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeHTML(obj);
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, maxDepth - 1));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeHTML(key)] = sanitizeObject(value, maxDepth - 1);
    }
    return sanitized;
  }

  // For functions, symbols, etc., convert to string
  return String(obj);
}

/**
 * Sanitize error messages to prevent information disclosure
 * Returns safe, user-friendly error messages
 */
export function sanitizeErrorMessage(error: any): string {
  // Define safe error patterns that can be shown to users
  const safeErrorPatterns = [
    /rate limit/i,
    /validation error/i,
    /invalid (url|youtube|video)/i,
    /not found/i,
    /timeout/i,
    /too (long|large|many)/i,
  ];

  const errorMessage =
    error?.message || error?.toString?.() || "An error occurred";

  // Check if error message matches safe patterns
  for (const pattern of safeErrorPatterns) {
    if (pattern.test(errorMessage)) {
      return sanitizeHTML(errorMessage);
    }
  }

  // For any other errors, return a generic message
  // This prevents leaking stack traces, file paths, or internal details
  return "An unexpected error occurred. Please try again later.";
}

/**
 * Truncate a string to a maximum length with ellipsis
 * Useful for limiting the size of data sent to clients
 */
export function truncate(str: string, maxLength: number = 200): string {
  if (typeof str !== "string") {
    str = String(str);
  }

  if (str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength) + "...";
}

/**
 * Sanitize tool arguments before sending to client
 * Combines sanitization, truncation, and removes sensitive fields
 */
export function sanitizeToolArgs(args: any): any {
  // List of potentially sensitive field names to redact
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "apiKey",
    "api_key",
    "credentials",
  ];

  const sanitized = sanitizeObject(args);

  // Redact sensitive fields
  if (typeof sanitized === "object" && sanitized !== null) {
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = "[REDACTED]";
      }
    }
  }

  return sanitized;
}
