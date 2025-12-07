import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PineconeStore } from "@langchain/pinecone";
import { getPineConeIndex } from "@/lib/pinecone";
import { getEmbeddings } from "@/lib/embed";
import { quickCompress, ContextualCompressor } from "@/lib/compression";

// Improved splitter with larger chunks and semantic boundaries
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 2000, // Larger for better context
  chunkOverlap: 400, // 20% overlap
  separators: ["\n\n", "\n", ". ", " ", ""], // Respect semantic boundaries
});

/**
 * Helper to format timestamp in MM:SS format
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Indexes transcript with preserved metadata including timestamps
 */
export async function indexTranscript(videoId: string, text: string, sourceMetadata?: Record<string, any>) {
  const docs = (
    await splitter.splitDocuments([
      new Document({
        pageContent: text,
        metadata: {
          videoId,
          ...(sourceMetadata || {}), // Preserve any metadata from source
        }
      }),
    ])
  ).map((document, i) => ({
    ...document,
    metadata: {
      ...document.metadata,
      chunk: i,
      indexedAt: new Date().toISOString(),
    },
  }));

  const pineconeIndex = await getPineConeIndex();
  const embeddings = getEmbeddings();

  await PineconeStore.fromDocuments(docs, embeddings, {
    pineconeIndex,
    namespace: videoId,
  });
  return { chunks: docs.length };
}

/**
 * Query the RAG system with improved context formatting
 * Returns context with relevance scores and timestamps
 * @param videoId - The video ID to query
 * @param question - The question to answer
 * @param k - Number of chunks to retrieve (default: 4)
 * @param useCompression - Whether to use contextual compression (default: false)
 */
export async function queryRag(
  videoId: string,
  question: string,
  k = 4,
  useCompression = false
) {
  const pineconeIndex = await getPineConeIndex();
  const embeddings = getEmbeddings();

  const store = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: videoId,
  });

  // Retrieve more documents if using compression (we'll filter them down)
  const retrievalK = useCompression ? Math.min(k * 2, 10) : k;

  // Use similaritySearchWithScore to get relevance information
  const resultsWithScores = await store.similaritySearchWithScore(
    question,
    retrievalK
  );

  let processedResults = resultsWithScores;

  // Apply compression if requested
  if (useCompression && resultsWithScores.length > 0) {
    const docs = resultsWithScores.map(([doc]) => doc);

    // Use quick compression (no LLM calls, faster)
    const compressed = quickCompress(docs, question, 3);

    // Filter out empty compressions and rebuild results
    processedResults = compressed
      .map((comp, i) => {
        const [_, score] = resultsWithScores[i];
        return [
          new Document({
            pageContent: comp.compressed,
            metadata: comp.doc.metadata,
          }),
          score,
        ] as [Document, number];
      })
      .filter(([doc]) => doc.pageContent.trim().length > 0)
      .slice(0, k); // Take top k after compression
  }

  // Format context with timestamps, relevance scores, and (possibly compressed) content
  const context = processedResults
    .map(([doc, score], index) => {
      const timestamp =
        doc.metadata.startTime !== undefined
          ? `[${formatTimestamp(doc.metadata.startTime)}]`
          : "";
      const relevance = `${(score * 100).toFixed(1)}%`;

      return (
        `Excerpt #${index + 1} ${timestamp} (relevance: ${relevance}):\n` +
        `${doc.pageContent}\n`
      );
    })
    .join("\n---\n");

  return {
    context,
    results: processedResults.map(([doc, score]) => ({ doc, score })),
    compressionUsed: useCompression,
  };
}
