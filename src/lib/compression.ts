import { Document } from "@langchain/core/documents";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Contextual compression using LLM to extract only relevant information
 * This reduces context size while preserving the most important content
 */
export class ContextualCompressor {
  private model: ChatOpenAI;

  constructor(modelName: string = "gpt-4o-mini") {
    this.model = new ChatOpenAI({
      modelName,
      temperature: 0, // Deterministic extraction
      maxTokens: 500, // Limit output size
    });
  }

  /**
   * Compresses a single document by extracting only content relevant to the query
   */
  async compressDocument(
    doc: Document,
    query: string
  ): Promise<{ content: string; compressed: boolean }> {
    const prompt = `Given the following text excerpt and a question, extract ONLY the sentences or phrases that are directly relevant to answering the question. If nothing is relevant, return "NOT_RELEVANT".

Question: ${query}

Excerpt:
${doc.pageContent}

Relevant content (be concise):`;

    try {
      const response = await this.model.invoke(prompt);
      const content =
        typeof response.content === "string"
          ? response.content.trim()
          : String(response.content);

      if (content === "NOT_RELEVANT" || !content) {
        return { content: "", compressed: true };
      }

      // Only compress if we reduced size by at least 20%
      const originalLength = doc.pageContent.length;
      const compressedLength = content.length;

      if (compressedLength < originalLength * 0.8) {
        return { content, compressed: true };
      }

      // Not worth compressing, return original
      return { content: doc.pageContent, compressed: false };
    } catch (error) {
      console.error("[Compression] Error compressing document:", error);
      // Fallback to original content on error
      return { content: doc.pageContent, compressed: false };
    }
  }

  /**
   * Compresses multiple documents in parallel
   */
  async compressDocuments(
    docs: Document[],
    query: string,
    maxConcurrent: number = 3
  ): Promise<
    Array<{
      doc: Document;
      compressed: string;
      wasCompressed: boolean;
      originalLength: number;
      compressedLength: number;
    }>
  > {
    const results = [];

    // Process in batches to avoid rate limits
    for (let i = 0; i < docs.length; i += maxConcurrent) {
      const batch = docs.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(async (doc) => {
          const { content, compressed } = await this.compressDocument(
            doc,
            query
          );
          return {
            doc,
            compressed: content,
            wasCompressed: compressed,
            originalLength: doc.pageContent.length,
            compressedLength: content.length,
          };
        })
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Simple extraction without LLM (faster, cheaper)
   * Extracts sentences containing query keywords
   */
  static extractRelevantSentences(
    text: string,
    query: string,
    maxSentences: number = 3
  ): string {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 3); // Ignore short words

    // Split into sentences
    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20); // Filter out very short fragments

    // Score sentences by keyword matches
    const scoredSentences = sentences.map((sentence) => {
      const lowerSentence = sentence.toLowerCase();
      const score = queryTerms.filter((term) =>
        lowerSentence.includes(term)
      ).length;
      return { sentence, score };
    });

    // Sort by score and take top N
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .filter((s) => s.score > 0) // Only include sentences with matches
      .map((s) => s.sentence);

    if (topSentences.length === 0) {
      // Fallback: return first few sentences
      return sentences.slice(0, maxSentences).join(". ") + ".";
    }

    return topSentences.join(". ") + ".";
  }
}

/**
 * Quick compression without LLM API calls
 * Use this for faster, cheaper compression
 */
export function quickCompress(
  docs: Document[],
  query: string,
  sentencesPerDoc: number = 2
): Array<{ doc: Document; compressed: string }> {
  return docs.map((doc) => ({
    doc,
    compressed: ContextualCompressor.extractRelevantSentences(
      doc.pageContent,
      query,
      sentencesPerDoc
    ),
  }));
}
