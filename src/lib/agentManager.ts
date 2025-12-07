import { createYouTubeAgent } from "@/yt/agent";

/**
 * Singleton Agent Manager
 * Ensures only one agent instance is created and reused across requests
 * This improves performance and reduces memory overhead
 */
class AgentManager {
  private static instance: AgentManager;
  private agent: ReturnType<typeof createYouTubeAgent> | null = null;
  private modelName: string = "gpt-4o-mini";

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Get or create the agent instance
   */
  public getAgent(): ReturnType<typeof createYouTubeAgent> {
    if (!this.agent) {
      console.log("[AgentManager] Creating new agent instance");
      this.agent = createYouTubeAgent(this.modelName);
    }
    return this.agent;
  }

  /**
   * Reset the agent (useful for testing or if agent needs to be recreated)
   */
  public resetAgent(): void {
    console.log("[AgentManager] Resetting agent instance");
    this.agent = null;
  }

  /**
   * Update model configuration (will reset agent on next getAgent call)
   */
  public setModelName(modelName: string): void {
    if (this.modelName !== modelName) {
      console.log(`[AgentManager] Model changed from ${this.modelName} to ${modelName}`);
      this.modelName = modelName;
      this.resetAgent();
    }
  }
}

export default AgentManager;
