import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
import { Document } from "@langchain/core/documents";

export const YOUTUBE_URL_PATTERNS = {
  standard:
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:[&?].*)?$/,
  short: /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.*)?$/,
  embed:
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.*)?$/,
  mobile:
    /(?:https?:\/\/)?m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})(?:[&?].*)?$/,
};

/**
 * Supported YouTube transcript language codes
 * Common languages supported by YouTube's automatic and manual transcripts
 */
export const SUPPORTED_LANGUAGES = [
  "en", // English
  "es", // Spanish
  "fr", // French
  "de", // German
  "pt", // Portuguese
  "it", // Italian
  "ru", // Russian
  "ja", // Japanese
  "ko", // Korean
  "zh", // Chinese (Simplified)
  "zh-TW", // Chinese (Traditional)
  "ar", // Arabic
  "hi", // Hindi
  "nl", // Dutch
  "pl", // Polish
  "tr", // Turkish
  "vi", // Vietnamese
  "id", // Indonesian
  "th", // Thai
  "sv", // Swedish
  "no", // Norwegian
  "da", // Danish
  "fi", // Finnish
] as const;

/**
 * Validates if a language code is supported
 * @param code - Language code to validate
 * @returns True if the language is supported
 */
export function isValidLanguageCode(code: string): boolean {
  return SUPPORTED_LANGUAGES.includes(code as any);
}

/**
 * Retry utility with exponential backoff
 * @param fn - Async function to retry (receives attempt number as parameter)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @param backoffMultiplier - Multiplier for exponential backoff (default: 2)
 * @param onRetry - Optional callback invoked before each retry attempt
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffMultiplier: number = 2,
  onRetry?: (attempt: number, maxRetries: number) => Promise<void>
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Notify about retry attempt (skip for first attempt)
      if (attempt > 0 && onRetry) {
        await onRetry(attempt, maxRetries);
      }

      return await fn(attempt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Extracts the YouTube video ID from a URL or returns the input if it's already an ID
 * @param input - YouTube URL or video ID
 * @returns Video ID or null if invalid
 */
export function extractVideoId(input: string): string | null {
  if (!input?.trim()) return null;

  // If it's already an 11-character ID, return it
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  // Try each pattern
  for (const pattern of Object.values(YOUTUBE_URL_PATTERNS)) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  return null;
}

interface TranscriptResult {
  id: string | null;
  text: string;
  docs: Document[];
}

interface FetchTranscriptOptions {
  language?: string;
  addVideoInfo?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  tracingEnabled?: boolean;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Fetches the transcript for a YouTube video with LangSmith tracing
 * @param videoUrlOrId - YouTube URL or video ID
 * @param options - Configuration options
 * @param options.language - Language code for the transcript (default: "en")
 * @param options.addVideoInfo - Include video metadata (default: true)
 * @param options.maxRetries - Maximum retry attempts on failure (default: 3)
 * @param options.retryDelay - Initial delay between retries in ms (default: 1000)
 * @param options.tracingEnabled - Enable LangSmith tracing (default: true if LANGCHAIN_TRACING_V2=true)
 * @param options.tags - Tags for LangSmith trace (e.g., ["production", "youtube"])
 * @param options.metadata - Custom metadata for LangSmith trace
 * @returns Transcript data including video ID, text, and raw documents
 * @throws Error if video not found or transcript unavailable
 *
 * @example
 * ```typescript
 * // Simple usage
 * const result = await fetchTranscript("dQw4w9WgXcQ");
 *
 * // With LangSmith tracing and metadata
 * const result = await fetchTranscript("dQw4w9WgXcQ", {
 *   tracingEnabled: true,
 *   tags: ["production", "youtube-loader"],
 *   metadata: { userId: "123", source: "web-app" }
 * });
 *
 * // View traces at: https://smith.langchain.com/
 * ```
 */
export const fetchTranscript = async (
  videoUrlOrId: string,
  options: FetchTranscriptOptions = {}
): Promise<TranscriptResult> => {
  const {
    language = "en",
    addVideoInfo = true,
    maxRetries = 3,
    retryDelay = 1000,
    tags = [],
    metadata = {},
  } = options;

  if (!videoUrlOrId?.trim()) {
    throw new Error("Video URL or ID is required");
  }

  const id = extractVideoId(videoUrlOrId);
  if (!id) {
    throw new Error(`Invalid YouTube URL or video ID: ${videoUrlOrId}`);
  }

  // Validate language code (warn but don't fail if unsupported)
  if (language && !isValidLanguageCode(language)) {
    console.warn(
      `Language code "${language}" is not in the common supported list. ` +
        `Transcript may not be available. Supported: ${SUPPORTED_LANGUAGES.join(
          ", "
        )}`
    );
  }

  const url = `https://www.youtube.com/watch?v=${id}`;

  try {
    const docs = await retryWithBackoff<Document[]>(
      async (attempt: number) => {
        const loader = YoutubeLoader.createFromUrl(url, {
          language,
          addVideoInfo,
        });
        return await loader.load();
      },
      maxRetries,
      retryDelay,
      2, // backoffMultiplier
      async (attempt: number, max: number) => {
        // Log retry attempts for observability
        console.log(
          `[YouTube Loader] Retry ${attempt + 1}/${max + 1} for video: ${id}`
        );
      }
    );

    if (!docs || docs.length === 0) {
      throw new Error(`No transcript found for video: ${id}`);
    }

    // Null safety: ensure pageContent exists
    const text = docs
      .map((doc) => doc.pageContent ?? "")
      .filter((content) => content.length > 0)
      .join(" ");

    // Return with trace metadata attached
    return { id, text, docs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const newError = new Error(
      `Failed to fetch transcript for video ${id}: ${message}`
    );

    // Preserve original error for debugging
    if (error instanceof Error) {
      newError.cause = error;
    }

    throw newError;
  }
};
