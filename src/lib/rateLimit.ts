import { NextApiRequest, NextApiResponse } from "next";

/**
 * Simple in-memory rate limiter for API routes
 * Tracks requests per IP address with protection against IP spoofing
 */

/**
 * Configuration for trusted proxy detection
 * In production, you should configure this based on your deployment environment
 */
const TRUSTED_PROXY_CONFIG = {
  // Set to true if deployed behind a trusted proxy (Vercel, CloudFlare, AWS ALB, etc.)
  trustProxy: process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1",
  // Maximum number of proxy hops to trust (prevents header injection)
  maxProxyHops: 1,
};

/**
 * Safely extract client IP address with protection against IP spoofing
 * Only trusts x-forwarded-for when behind a trusted proxy
 */
function getClientIdentifier(req: NextApiRequest): string {
  // If not behind a trusted proxy, use direct connection IP
  if (!TRUSTED_PROXY_CONFIG.trustProxy) {
    return req.socket.remoteAddress || "unknown";
  }

  // Extract x-forwarded-for header
  const forwardedFor = req.headers["x-forwarded-for"];

  if (!forwardedFor) {
    // No forwarded header, use direct connection
    return req.socket.remoteAddress || "unknown";
  }

  // x-forwarded-for can be a string or array
  const forwardedIps = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;

  if (!forwardedIps) {
    return req.socket.remoteAddress || "unknown";
  }

  // Split by comma and take IPs based on trust level
  const ipList = forwardedIps.split(",").map((ip) => ip.trim());

  // Validate that we're not trusting too many hops (prevents header injection)
  if (ipList.length > TRUSTED_PROXY_CONFIG.maxProxyHops + 1) {
    console.warn(
      `[RateLimit] Suspicious x-forwarded-for with ${ipList.length} IPs: ${forwardedIps}`
    );
    // Fall back to direct connection to prevent spoofing
    return req.socket.remoteAddress || "unknown";
  }

  // Take the leftmost IP (original client)
  const clientIp = ipList[0];

  // Validate IP format (basic validation)
  if (!isValidIp(clientIp)) {
    console.warn(`[RateLimit] Invalid IP format in x-forwarded-for: ${clientIp}`);
    return req.socket.remoteAddress || "unknown";
  }

  return clientIp;
}

/**
 * Validate IP address format (IPv4 or IPv6)
 * Basic validation to prevent obvious spoofing attempts
 */
function isValidIp(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex =
    /^(\d{1,3}\.){3}\d{1,3}$/;

  // IPv6 regex (simplified)
  const ipv6Regex =
    /^([\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}$|^::1$|^fe80:/;

  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    return false;
  }

  // Additional validation for IPv4: check octets are 0-255
  if (ipv4Regex.test(ip)) {
    const octets = ip.split(".");
    return octets.every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  return true;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class RateLimiter {
  private store: RateLimitStore = {};
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be allowed
   */
  public isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.store[identifier];

    if (!record || now > record.resetTime) {
      // New window or expired window
      this.store[identifier] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      return true;
    }

    if (record.count < this.maxRequests) {
      record.count++;
      return true;
    }

    return false;
  }

  /**
   * Get rate limit info for an identifier
   */
  public getInfo(identifier: string): {
    remaining: number;
    resetTime: number;
    limit: number;
  } {
    const record = this.store[identifier];
    const now = Date.now();

    if (!record || now > record.resetTime) {
      return {
        remaining: this.maxRequests,
        resetTime: now + this.windowMs,
        limit: this.maxRequests,
      };
    }

    return {
      remaining: Math.max(0, this.maxRequests - record.count),
      resetTime: record.resetTime,
      limit: this.maxRequests,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keys = Object.keys(this.store);

    for (const key of keys) {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  public reset(identifier: string): void {
    delete this.store[identifier];
  }
}

// Create singleton instance
// 10 requests per minute per IP
const rateLimiter = new RateLimiter(10, 60000);

/**
 * Rate limiting middleware for Next.js API routes
 * Uses secure IP extraction with anti-spoofing protection
 */
export function withRateLimit(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Get client identifier securely (protects against IP spoofing)
    const identifier = getClientIdentifier(req);

    const info = rateLimiter.getInfo(identifier);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", info.limit.toString());
    res.setHeader("X-RateLimit-Remaining", info.remaining.toString());
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(info.resetTime).toISOString()
    );

    // Check if request is allowed
    if (!rateLimiter.isAllowed(identifier)) {
      const retryAfter = Math.ceil((info.resetTime - Date.now()) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());

      return res.status(429).json({
        error: "Too many requests",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    // Continue to the actual handler
    return handler(req, res);
  };
}

export default rateLimiter;
