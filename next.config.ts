import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  reactStrictMode: true,

  /**
   * Security Headers Configuration
   * Implements comprehensive security headers to protect against common attacks
   */
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          {
            // Prevent clickjacking attacks by disallowing the site to be framed
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Prevent MIME type sniffing
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Enable browser XSS protection (legacy, but still useful)
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            // Control referrer information sent to other sites
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Enforce HTTPS connections (only in production)
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            // Permissions Policy: Restrict access to browser features
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            /**
             * Content Security Policy (CSP)
             * Defines allowed sources for scripts, styles, and other resources
             *
             * Note: This is a basic CSP. You may need to adjust based on your needs:
             * - Add 'unsafe-inline' for styles if using styled-components or similar
             * - Add 'unsafe-eval' if required by dependencies (not recommended)
             * - Add specific domains for external resources
             */
            key: "Content-Security-Policy",
            value: [
              // Default fallback for all resource types
              "default-src 'self'",
              // Allow scripts from self and Next.js
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Allow styles from self and inline styles (needed for Next.js)
              "style-src 'self' 'unsafe-inline'",
              // Allow images from self and data URIs
              "img-src 'self' data: https:",
              // Allow fonts from self and data URIs
              "font-src 'self' data:",
              // Allow connections to self (API routes) and external APIs
              "connect-src 'self' https://api.openai.com https://*.pinecone.io",
              // Restrict frames to same origin
              "frame-ancestors 'none'",
              // Require all resources to be loaded over HTTPS in production
              "upgrade-insecure-requests",
            ]
              .join("; ")
              .trim(),
          },
        ],
      },
      {
        // Additional headers for API routes
        source: "/api/:path*",
        headers: [
          {
            // Prevent caching of API responses
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            // Prevent browser from caching
            key: "Pragma",
            value: "no-cache",
          },
          {
            // Set expiry to past date
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
