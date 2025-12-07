import { createMiddleware } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import {
  ValidationError,
  TranscriptNotFoundError,
  VideoNotFoundError,
  IndexingError,
  QueryError,
} from "./errors";

/**
 * Middleware for consistent tool error handling
 * Catches errors from tool execution and returns user-friendly messages
 */
export const toolErrorHandlingMiddleware = createMiddleware({
  name: "ToolErrorHandler",
  wrapToolCall: async (request, handler) => {
    try {
      // Execute the tool
      return await handler(request);
    } catch (error) {
      console.error(
        `[ToolError] Error in tool "${request.toolCall.name}":`,
        error
      );

      let errorMessage: string;

      // Handle specific error types
      if (error instanceof ValidationError) {
        errorMessage = `Input validation error: ${error.message}`;
      } else if (error instanceof VideoNotFoundError) {
        errorMessage = `Video not found: ${error.message}. Please check the URL and try again.`;
      } else if (error instanceof TranscriptNotFoundError) {
        errorMessage = `Transcript not available: ${error.message}. This video may not have captions/subtitles enabled.`;
      } else if (error instanceof IndexingError) {
        errorMessage = `Indexing failed: ${error.message}. Please try again or contact support if the issue persists.`;
      } else if (error instanceof QueryError) {
        errorMessage = `Search failed: ${error.message}. Make sure the video has been indexed first.`;
      } else if (error instanceof Error) {
        // Generic error
        errorMessage = `Tool error: ${error.message}`;
      } else {
        // Unknown error type
        errorMessage = `An unexpected error occurred: ${String(error)}`;
      }

      // Return error as a ToolMessage so the agent can see it and react
      return new ToolMessage({
        content: errorMessage,
        tool_call_id: request.toolCall.id!,
      });
    }
  },
});

/**
 * Creates a user-friendly error message with suggestions
 */
export function createToolErrorMessage(
  toolName: string,
  error: Error
): string {
  const baseMessage = `Error in ${toolName}: ${error.message}`;

  // Add context-specific suggestions
  const suggestions: Record<string, string> = {
    fetch_transcript:
      "Make sure the video URL is correct and the video has captions enabled.",
    index_content:
      "Ensure the video ID and transcript text are valid. The indexing service may be temporarily unavailable.",
    query_video_content:
      "The video must be indexed before querying. Try indexing it first.",
    extract_video_id:
      "Please provide a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...)",
    is_video_indexed:
      "Unable to check index status. The database may be temporarily unavailable.",
  };

  const suggestion = suggestions[toolName];
  return suggestion ? `${baseMessage}\n\nSuggestion: ${suggestion}` : baseMessage;
}
