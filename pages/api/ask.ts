import type { NextApiRequest, NextApiResponse } from "next";
import "dotenv/config";
import AgentManager from "../../src/lib/agentManager";
import { withRateLimit } from "../../src/lib/rateLimit";
import { ValidationError } from "../../src/lib/errors";
import {
  sanitizeHTML,
  sanitizeToolArgs,
  sanitizeErrorMessage,
  truncate,
} from "../../src/lib/sanitize";

/**
 * Request body interface
 */
interface AskRequest {
  url?: string;
  question?: string;
}

/**
 * Streaming endpoint for YouTube Q&A
 * Returns Server-Sent Events (SSE) for real-time progress updates
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. Validate HTTP method
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method Not Allowed",
        message: "Only POST requests are accepted",
      });
    }

    // 2. Validate request body
    const { url, question } = req.body as AskRequest;

    if (!url?.trim()) {
      throw new ValidationError(
        "URL parameter is required and cannot be empty"
      );
    }

    if (!question?.trim()) {
      throw new ValidationError(
        "Question parameter is required and cannot be empty"
      );
    }

    // Validate URL format
    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      throw new ValidationError(
        "Invalid YouTube URL. Please provide a valid youtube.com or youtu.be URL"
      );
    }

    // Validate question length
    if (question.length > 500) {
      throw new ValidationError(
        "Question is too long. Maximum 500 characters allowed"
      );
    }

    console.log(
      `[API Stream] Processing request - URL: ${url}, Question length: ${question.length}`
    );

    // 3. Set up Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering

    // 4. Get singleton agent instance
    const agentManager = AgentManager.getInstance();
    const agent = agentManager.getAgent();

    // 5. Stream agent execution with values mode
    const stream = await agent.stream(
      {
        messages: [
          { role: "user", content: `URL: ${url}\nQuestion: ${question}` },
        ],
      },
      { streamMode: "values" }
    );

    let messageBuffer = "";
    let lastToolName = "";
    let sentMessages = new Set<string>();

    // 6. Process stream chunks
    for await (const chunk of stream) {
      const messages = chunk.messages || [];
      const lastMessage = messages.at?.(messages.length - 1);

      if (!lastMessage) continue;

      // Create a unique key for this message to avoid duplicates
      const messageKey = `${lastMessage.type}-${JSON.stringify(lastMessage.content || "")}`;

      // Handle AI messages with content (final answer)
      if (
        lastMessage.type === "ai" &&
        lastMessage.content &&
        !lastMessage.tool_calls?.length
      ) {
        const content =
          typeof lastMessage.content === "string"
            ? lastMessage.content
            : Array.isArray(lastMessage.content)
            ? lastMessage.content
                .map((c: any) => (typeof c === "string" ? c : c.text || ""))
                .join("")
            : String(lastMessage.content);

        if (content && content !== messageBuffer && !sentMessages.has(messageKey)) {
          messageBuffer = content;
          sentMessages.add(messageKey);
          // Sanitize content to prevent XSS attacks
          const sanitizedContent = sanitizeHTML(content);
          res.write(
            `data: ${JSON.stringify({ type: "token", content: sanitizedContent })}\n\n`
          );
          console.log(`[API Stream] Sent answer: ${content.slice(0, 100)}...`);
        }
      }

      // Handle tool calls
      if (
        lastMessage.type === "ai" &&
        "tool_calls" in lastMessage &&
        lastMessage.tool_calls?.length
      ) {
        const toolCall = lastMessage.tool_calls[0];
        if (toolCall.name !== lastToolName) {
          lastToolName = toolCall.name;
          // Sanitize tool name and arguments to prevent XSS
          const sanitizedToolName = sanitizeHTML(toolCall.name);
          const sanitizedArgs = sanitizeToolArgs(toolCall.args);
          res.write(
            `data: ${JSON.stringify({
              type: "tool_start",
              tool: sanitizedToolName,
              args: sanitizedArgs,
            })}\n\n`
          );
          console.log(`[API Stream] Tool started: ${toolCall.name}`);
        }
      }

      // Handle tool results
      if (lastMessage.type === "tool") {
        const toolKey = `tool-${lastMessage.name}`;
        if (!sentMessages.has(toolKey)) {
          sentMessages.add(toolKey);
          // Sanitize tool name and result content
          const sanitizedToolName = sanitizeHTML(lastMessage.name || "");
          const resultContent =
            typeof lastMessage.content === "string"
              ? truncate(sanitizeHTML(lastMessage.content), 200)
              : "Result received";
          res.write(
            `data: ${JSON.stringify({
              type: "tool_end",
              tool: sanitizedToolName,
              result: resultContent,
            })}\n\n`
          );
          console.log(`[API Stream] Tool completed: ${lastMessage.name}`);
        }
      }
    }

    // 7. Send completion signal
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

    console.log(`[API Stream] Request completed successfully`);
  } catch (error: any) {
    // Log full error details server-side for debugging
    console.error(`[API Stream] Error:`, error);

    // Send error via SSE if headers not sent yet
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
    }

    // Sanitize error message to prevent information disclosure and XSS
    const safeErrorMessage = sanitizeErrorMessage(error);

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: safeErrorMessage,
      })}\n\n`
    );
    res.end();
  }
}

/**
 * Export handler with rate limiting middleware
 */
export default withRateLimit(handler);

/**
 * Next.js API config for streaming
 */
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
    responseLimit: false, // Disable for streaming
  },
};
