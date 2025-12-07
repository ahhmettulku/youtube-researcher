import { Pinecone } from "@pinecone-database/pinecone";
import defaults from "../defaults";

let pc: Pinecone | null = null;

export function getPineCone() {
  if (!pc) {
    pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY || "",
    });
  }

  return pc;
}

export async function getPineConeIndex() {
  const client = getPineCone();
  return client.Index(defaults.PINECONE_INDEX);
}
