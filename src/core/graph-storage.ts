import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import type { KnowledgeGraph } from "../types/index.js";
import { NodeIndex } from "../core/node-index.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredGraph {
  id: string;
  metadata: {
    repository: string;
    branch: string;
    createdAt: string;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    analysisTime: number;
  };
  filePath: string;
}

export class GraphStorage {
  private storageDir: string;
  private indexFilePath: string;
  private indexCache = new Map<string, NodeIndex>();

  constructor(storageDir?: string) {
    // Use environment variable MCP_DATA_DIR or fall back to default
    const homeDir = os.homedir();
    const defaultDir = path.join(
      homeDir,
      ".github-knowledge-graph",
      "data",
      "graphs"
    );

    this.storageDir = storageDir || process.env.MCP_DATA_DIR || defaultDir;

    this.indexFilePath = path.join(this.storageDir, "index.json");
    this.ensureStorageDirectory();
    logger.info(`Graph storage directory: ${this.storageDir}`);
  }

  private async ensureStorageDirectory(): Promise<void> {
    await fs.ensureDir(this.storageDir);

    // Create index file if it doesn't exist
    if (!(await fs.pathExists(this.indexFilePath))) {
      await fs.writeJson(this.indexFilePath, []);
    }
  }

  async saveGraph(graph: KnowledgeGraph): Promise<string> {
    await this.ensureStorageDirectory();

    // Generate unique ID
    const timestamp = Date.now();
    const repoName = this.extractRepoName(
      graph.metadata?.repository || "unknown"
    );
    const graphId = `${repoName}-${timestamp}`;

    // Save graph data
    const graphFilePath = path.join(this.storageDir, `${graphId}.json`);
    await fs.writeJson(graphFilePath, graph, { spaces: 2 });

    // Update index
    const index = await this.loadIndex();
    const storedGraph: StoredGraph = {
      id: graphId,
      metadata: {
        repository: graph.metadata?.repository || "unknown",
        branch: graph.metadata?.branch || "main",
        createdAt: new Date().toISOString(),
        fileCount: graph.metadata?.fileCount || 0,
        nodeCount: graph.metadata?.nodeCount || graph.nodes.length,
        edgeCount: graph.metadata?.edgeCount || graph.edges.length,
        analysisTime: graph.metadata?.analysisTime || 0,
      },
      filePath: graphFilePath,
    };

    index.push(storedGraph);
    await fs.writeJson(this.indexFilePath, index, { spaces: 2 });

    return graphId;
  }

  async getGraph(graphId: string): Promise<KnowledgeGraph | null> {
    try {
      const index = await this.loadIndex();
      const storedGraph = index.find((g) => g.id === graphId);

      if (!storedGraph) {
        return null;
      }

      if (!(await fs.pathExists(storedGraph.filePath))) {
        // Remove from index if file doesn't exist
        await this.removeFromIndex(graphId);
        return null;
      }

      return await fs.readJson(storedGraph.filePath);
    } catch (error) {
      console.error("Error loading graph:", error);
      return null;
    }
  }

  async deleteGraph(graphId: string): Promise<boolean> {
    try {
      const index = await this.loadIndex();
      const storedGraph = index.find((g) => g.id === graphId);

      if (!storedGraph) {
        return false;
      }

      // Remove file
      if (await fs.pathExists(storedGraph.filePath)) {
        await fs.remove(storedGraph.filePath);
      }

      // Remove from index
      await this.removeFromIndex(graphId);
      return true;
    } catch (error) {
      console.error("Error deleting graph:", error);
      return false;
    }
  }

  async listGraphs(): Promise<StoredGraph[]> {
    try {
      const index = await this.loadIndex();

      // Verify files still exist and clean up index
      const validGraphs: StoredGraph[] = [];
      for (const graph of index) {
        if (await fs.pathExists(graph.filePath)) {
          validGraphs.push(graph);
        }
      }

      // Update index if some files were missing
      if (validGraphs.length !== index.length) {
        await fs.writeJson(this.indexFilePath, validGraphs, { spaces: 2 });
      }

      return validGraphs.sort(
        (a, b) =>
          new Date(b.metadata.createdAt).getTime() -
          new Date(a.metadata.createdAt).getTime()
      );
    } catch (error) {
      console.error("Error listing graphs:", error);
      return [];
    }
  }

  async getGraphsByRepository(repository: string): Promise<StoredGraph[]> {
    const allGraphs = await this.listGraphs();
    return allGraphs.filter((graph) =>
      graph.metadata.repository.toLowerCase().includes(repository.toLowerCase())
    );
  }

  async cleanupOldGraphs(
    maxAge: number = 30 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    const index = await this.loadIndex();
    const cutoffDate = new Date(Date.now() - maxAge);
    let deletedCount = 0;

    for (const graph of index) {
      const createdAt = new Date(graph.metadata.createdAt);
      if (createdAt < cutoffDate) {
        if (await this.deleteGraph(graph.id)) {
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  async getStorageStats(): Promise<{
    totalGraphs: number;
    totalSizeBytes: number;
    oldestGraph: string | null;
    newestGraph: string | null;
  }> {
    const graphs = await this.listGraphs();
    let totalSize = 0;

    for (const graph of graphs) {
      try {
        const stats = await fs.stat(graph.filePath);
        totalSize += stats.size;
      } catch (error) {
        // File might be missing, skip
      }
    }

    return {
      totalGraphs: graphs.length,
      totalSizeBytes: totalSize,
      oldestGraph: graphs.length > 0 ? graphs[graphs.length - 1].id : null,
      newestGraph: graphs.length > 0 ? graphs[0].id : null,
    };
  }

  private async loadIndex(): Promise<StoredGraph[]> {
    try {
      return await fs.readJson(this.indexFilePath);
    } catch (error) {
      // If index is corrupted, recreate it
      await fs.writeJson(this.indexFilePath, []);
      return [];
    }
  }

  private async removeFromIndex(graphId: string): Promise<void> {
    const index = await this.loadIndex();
    const filteredIndex = index.filter((g) => g.id !== graphId);
    await fs.writeJson(this.indexFilePath, filteredIndex, { spaces: 2 });
  }

  private extractRepoName(repository: string): string {
    try {
      // Extract repo name from GitHub URL
      const match = repository.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
      if (match) {
        return `${match[1]}-${match[2]}`;
      }

      // Fallback to simple extraction
      return (
        repository
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") || "unknown-repo"
      );
    } catch (error) {
      return "unknown-repo";
    }
  }

  async exportGraph(graphId: string, outputPath: string): Promise<boolean> {
    try {
      const graph = await this.getGraph(graphId);
      if (!graph) {
        return false;
      }

      await fs.writeJson(outputPath, graph, { spaces: 2 });
      return true;
    } catch (error) {
      console.error("Error exporting graph:", error);
      return false;
    }
  }

  async importGraph(
    filePath: string,
    metadata?: Partial<StoredGraph["metadata"]>
  ): Promise<string | null> {
    try {
      if (!(await fs.pathExists(filePath))) {
        throw new Error("Import file does not exist");
      }

      const graph: KnowledgeGraph = await fs.readJson(filePath);

      // Validate graph structure
      if (!graph.nodes || !graph.edges || !graph.metadata) {
        throw new Error("Invalid graph format");
      }

      // Update metadata if provided
      if (metadata) {
        graph.metadata = { ...graph.metadata, ...metadata };
      }

      return await this.saveGraph(graph);
    } catch (error) {
      console.error("Error importing graph:", error);
      return null;
    }
  }

  /**
   * Get a graph with its indexed nodes for fast lookups
   */
  async getIndexedGraph(graphId: string): Promise<NodeIndex | null> {
    // Check cache first
    if (this.indexCache.has(graphId)) {
      return this.indexCache.get(graphId)!;
    }

    // Load graph and create index
    const graph = await this.getGraph(graphId);
    if (!graph) {
      return null;
    }

    logger.info(`Creating node index for graph: ${graphId}`);
    const nodeIndex = new NodeIndex(graph);

    // Cache the index
    this.indexCache.set(graphId, nodeIndex);

    return nodeIndex;
  }

  /**
   * Clear the index cache for a specific graph
   */
  clearGraphCache(graphId: string): void {
    this.indexCache.delete(graphId);
  }

  /**
   * Clear all cached indexes
   */
  clearAllCaches(): void {
    this.indexCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedGraphs: number;
    totalMemoryUsage: string;
    cacheHitRate?: number;
  } {
    return {
      cachedGraphs: this.indexCache.size,
      totalMemoryUsage: `${this.indexCache.size} graphs indexed`,
      // In a production system, you'd track actual memory usage and hit rates
    };
  }
}
