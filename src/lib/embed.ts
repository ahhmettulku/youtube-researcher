import defaults from "@/defaults";
import { OpenAIEmbeddings } from "@langchain/openai";

export function getEmbeddings() {
  return new OpenAIEmbeddings({
    model: defaults.OPENAI_EMBEDDINGS_MODEL,
  });
}
