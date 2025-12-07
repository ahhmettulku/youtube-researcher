import { getPineConeIndex } from "./pinecone";

interface VectorsInfo {
  exists: boolean;
  videoId: string;
  chunkCount?: number;
  indexedAt?: Date;
}

/**
 * Check if a video has been indexed in Pinecone
 * @param videoId - YouTube video ID
 * @returns True if indexed, false otherwise
 */
export async function isVideoIndexed(videoId: string): Promise<boolean> {
  try {
    const index = await getPineConeIndex();
    const namespaceList = await index.listNamespaces();

    return namespaceList.namespaces?.some((ns) => ns.name === videoId) ?? false;
  } catch (error) {
    console.error(
      `[IndexChecker] Error checking if video ${videoId} is indexed:`,
      error
    );
    return false;
  }
}

/**
 * Get detailed namespace information from Pinecone
 * @param videoId - YouTube video ID
 * @returns Detailed information about the indexed video
 */
export async function getNamespaceInfo(videoId: string): Promise<VectorsInfo> {
  try {
    const pineConeIndex = await getPineConeIndex();
    const nameSpace = await pineConeIndex.describeNamespace(videoId);

    const recordCount = nameSpace.recordCount ?? 0;

    return {
      exists: recordCount > 0,
      videoId,
      chunkCount: recordCount,
    };
  } catch (error) {
    console.error(
      `[IndexChecker] Error getting namespace info for ${videoId}:`,
      error
    );
    // Return default info if namespace doesn't exist or error occurs
    return {
      exists: false,
      videoId,
      chunkCount: 0,
    };
  }
}
