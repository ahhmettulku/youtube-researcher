import { createAgent, tool } from "langchain";
import { z } from "zod";
import { fetchTranscript, extractVideoId } from "./loader";
import { indexTranscript, queryRag } from "./rag";
import { isVideoIndexed } from "@/lib/indexChecker";
import { toolErrorHandlingMiddleware } from "@/lib/toolErrorHandler";
import { VideoNotFoundError } from "@/lib/errors";

/**
 * Tool: Fetch YouTube Transcript
 * Downloads the transcript from YouTube without indexing
 * Allows the agent to inspect transcript quality before deciding to index
 */
const fetchTranscriptTool = tool(
  async ({ videoUrlOrId, language }) => {
    const transcriptResult = await fetchTranscript(videoUrlOrId, {
      language,
    });

    if (!transcriptResult.id) {
      throw new Error("Failed to extract video ID");
    }

    // Return both content (for LLM to see) and artifact (for next tool)
    const preview = transcriptResult.text.slice(0, 500);
    const wordCount = transcriptResult.text.split(/\s+/).length;

    return [
      `Successfully fetched transcript for video ${transcriptResult.id}.\n` +
        `Language: ${language}\n` +
        `Word count: ~${wordCount}\n` +
        `Preview: ${preview}...`,
      transcriptResult, // Artifact for downstream tools
    ];
  },
  {
    name: "fetch_transcript",
    description:
      "Downloads the transcript from a YouTube video. Use this to get the transcript text before indexing. " +
      "Returns a preview of the transcript and metadata. The full transcript is available for the next tool.",
    schema: z.object({
      videoUrlOrId: z
        .string()
        .describe("YouTube video URL or 11-character video ID"),
      language: z
        .string()
        .optional()
        .default("en")
        .describe("Language code for transcript (e.g., 'en', 'es', 'fr')"),
    }),
    responseFormat: "content_and_artifact",
  }
);

/**
 * Tool: Index Transcript Content
 * Fetches and indexes transcript into the vector database for semantic search
 * Can be called after checking if video is indexed, or after fetching to preview
 */
const indexContentTool = tool(
  async ({ videoUrlOrId, language }) => {
    // Fetch the full transcript
    const transcriptResult = await fetchTranscript(videoUrlOrId, { language });

    if (!transcriptResult.id) {
      throw new Error("Failed to extract video ID");
    }

    // Index the full transcript text
    const indexResult = await indexTranscript(
      transcriptResult.id,
      transcriptResult.text
    );

    return `Successfully indexed video ${transcriptResult.id} into ${indexResult.chunks} chunks. Ready for querying.`;
  },
  {
    name: "index_content",
    description:
      "Fetches the transcript from YouTube and indexes it into the vector database. " +
      "This operation downloads the transcript, splits it into chunks, generates embeddings, and stores them in Pinecone. " +
      "Call this after checking if the video is indexed (if not indexed) or after previewing the transcript.",
    schema: z.object({
      videoUrlOrId: z
        .string()
        .describe("YouTube video URL or 11-character video ID to index"),
      language: z
        .string()
        .optional()
        .default("en")
        .describe("Language code for transcript (e.g., 'en', 'es', 'fr')"),
    }),
  }
);

/**
 * Tool: Query Video Content
 * Searches the indexed video transcript for relevant information
 * Returns context as content (for LLM) and raw results as artifact (for logging)
 */
const queryVideoTool = tool(
  async ({ videoId, question, k }) => {
    const result = await queryRag(videoId, question, k);

    // Format context for the LLM to use in its response
    const contextMessage =
      `Relevant excerpts from video ${videoId}:\n\n` +
      `${result.context}\n\n` +
      `Use these ${result.results.length} excerpts to answer the user's question. ` +
      `Synthesize the information and cite which excerpt number supports each claim.`;

    // Return context as CONTENT (goes to LLM) and raw results as ARTIFACT
    return [contextMessage, result.results];
  },
  {
    name: "query_video_content",
    description:
      "Searches a YouTube video transcript for information relevant to a question. " +
      "Returns the most relevant excerpts from the video that you should use to answer the user's question. " +
      "Always synthesize the excerpts into a comprehensive answer with citations (e.g., 'According to excerpt #2...'). " +
      "The video must be indexed first.",
    schema: z.object({
      videoId: z
        .string()
        .describe("11-character YouTube video ID to query (not a full URL)"),
      question: z.string().describe("The question to answer from the video"),
      k: z
        .number()
        .optional()
        .default(4)
        .describe("Number of relevant chunks to retrieve (default: 4)"),
    }),
    responseFormat: "content_and_artifact",
  }
);

/**
 * Tool: Extract Video ID
 * Utility tool to extract video ID from various YouTube URL formats
 * Now throws errors instead of returning JSON error objects
 */
const extractVideoIdTool = tool(
  async ({ url }) => {
    const videoId = extractVideoId(url);

    if (!videoId) {
      throw new VideoNotFoundError(
        `Could not extract video ID from URL: ${url}`
      );
    }

    return `Extracted video ID: ${videoId}`;
  },
  {
    name: "extract_video_id",
    description:
      "Extracts the video ID from a YouTube URL. Supports standard, short (youtu.be), embed, and mobile URL formats. " +
      "Returns the 11-character video ID.",
    schema: z.object({
      url: z.string().describe("YouTube URL to extract video ID from"),
    }),
  }
);

/** Tool: Check if Video is Indexed
 * Utility tool to check if a video's transcript has been indexed in Pinecone
 * Returns a simple string message
 */
const isVideoIndexedTool = tool(
  async ({ videoId }) => {
    const indexed = await isVideoIndexed(videoId);
    return indexed
      ? `Video ${videoId} is indexed in Pinecone and ready to query.`
      : `Video ${videoId} is NOT indexed in Pinecone. You must fetch and index it first.`;
  },
  {
    name: "is_video_indexed",
    description:
      "Checks if a YouTube video's transcript has been indexed in the Pinecone vector database. " +
      "Returns a message indicating whether the video is indexed.",
    schema: z.object({
      videoId: z
        .string()
        .describe("11-character YouTube video ID to check indexing status"),
    }),
  }
);

/**
 * System prompt for the YouTube Researcher agent
 */
const AGENT_SYSTEM_PROMPT = `You are a YouTube video analyst AI. Your job is to help users understand video content through comprehensive Q&A.

## Available Tools

- **extract_video_id**: Parse YouTube URLs to get the 11-character video ID
- **is_video_indexed**: Check if a video's transcript is already in the database
- **fetch_transcript**: Download the transcript from YouTube (returns preview)
- **index_content**: Index transcript into vector database for semantic search
- **query_video_content**: Search indexed content (returns numbered excerpts with timestamps and relevance scores)

## Standard Workflow

1. Extract video ID from the user's URL
2. Check if the video is already indexed (saves cost and time)
3. If NOT indexed:
   a. **Optional:** Use fetch_transcript to preview the transcript (if you need to inspect quality/language)
   b. Use index_content to fetch and index the full transcript
4. Query the indexed content with the user's question
5. **Synthesize** the excerpts into a comprehensive answer

**Note:** The index_content tool handles both fetching and indexing, so you don't need to call fetch_transcript unless you want to preview the content first.

## Answer Format Requirements

**Structure:**
- Start with a direct answer to the question
- Support each claim with excerpt citations: "According to excerpt #2..."
- Include timestamps when available: "At 3:42, the speaker mentions..."
- If asked about specific topics, quote relevant passages
- If information isn't in the video, explicitly state: "This topic wasn't covered in the video"

**Synthesis (CRITICAL):**
- NEVER just return raw excerpts
- ALWAYS analyze and synthesize the information
- Combine information from multiple excerpts when relevant
- If excerpts conflict, acknowledge and explain the discrepancy
- Provide your own analysis and interpretation

**Citations:**
- Every major claim must cite an excerpt number
- Format: "According to excerpt #3 (at 5:23)..."
- When combining multiple sources: "Excerpts #1 and #4 both mention..."

## Tone & Style

- **Concise but thorough**: Answer completely without unnecessary verbosity
- **Objective and analytical**: Focus on what the video actually says
- **Educational, not conversational**: Informative rather than chatty
- **Evidence-based**: Every claim backed by excerpt citations

## Important Rules

✅ DO:
- Check if video is indexed before fetching (saves money)
- Use all available excerpt information (timestamps, relevance scores)
- Synthesize and analyze, not just quote
- Cite which excerpt supports each claim
- Acknowledge when information is missing

❌ DON'T:
- Skip the indexing check (wastes resources)
- Return raw excerpts without analysis
- Make claims without citation
- Hallucinate information not in the excerpts
- Index a video that's already indexed

## Example Answer Format

"The video discusses three main approaches to task decomposition. According to excerpt #1 (at 2:15), the first method is Chain of Thought (CoT), which breaks complex tasks into step-by-step reasoning. Excerpt #3 (at 5:42) explains that Tree of Thoughts extends this by exploring multiple reasoning paths. The speaker emphasizes in excerpt #2 that these methods significantly improve LLM performance on complex tasks, showing a 25% improvement in benchmarks."`;


/**
 * Creates and configures the YouTube Researcher agent
 * @param modelName - OpenAI model to use (default: "gpt-4o-mini")
 * @param systemPrompt - Optional custom system prompt
 * @returns Configured agent
 */
export function createYouTubeAgent(
  modelName: string = "gpt-4o-mini",
  systemPrompt?: string
) {
  const tools = [
    fetchTranscriptTool,
    indexContentTool,
    queryVideoTool,
    extractVideoIdTool,
    isVideoIndexedTool,
  ];

  const agent = createAgent({
    model: modelName,
    tools,
    systemPrompt: systemPrompt || AGENT_SYSTEM_PROMPT,
    middleware: [toolErrorHandlingMiddleware] as const,
  });

  return agent;
}

/**
 * Simplified function to run the agent with a query
 * @param input - User's question or command
 * @param modelName - OpenAI model to use
 * @returns Agent's response
 *
 * @example
 * ```typescript
 * const response = await runYouTubeAgent(
 *   "Index the video https://youtube.com/watch?v=dQw4w9WgXcQ and tell me what it's about"
 * );
 * console.log(response);
 * ```
 */
export async function runYouTubeAgent(
  input: string,
  modelName: string = "gpt-4o-mini"
) {
  const agent = createYouTubeAgent(modelName);

  const result = await agent.invoke({
    messages: [{ role: "user", content: input }],
  });

  return result;
}
