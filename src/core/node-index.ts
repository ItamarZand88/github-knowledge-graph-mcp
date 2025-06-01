/**
 * Efficient node indexing system for GitHub Knowledge Graph
 * Provides O(1) or O(log n) lookups instead of O(n) scans
 */

import type { KnowledgeGraph, GraphNode } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { createHash } from "crypto";

export interface SearchResult {
  node: GraphNode;
  score: number;
  reason:
    | "exact_id"
    | "exact_name"
    | "partial_name"
    | "file_path"
    | "fuzzy"
    | "file_filtered";
}

export class NodeIndex {
  private nodes = new Map<string, GraphNode>();
  private nameIndex = new Map<string, Set<string>>();
  private fileIndex = new Map<string, Set<string>>();
  private typeIndex = new Map<string, Set<string>>();
  private originalIdIndex = new Map<string, string>();
  private reverseIdIndex = new Map<string, string>(); // normalized -> original

  // For fuzzy search
  private nameTrigrams = new Map<string, Set<string>>();

  // Counter for unique IDs
  private nodeCounter = 0;

  constructor(graph: KnowledgeGraph) {
    this.buildIndexes(graph);
  }

  /**
   * Fast node lookup - O(1) for exact matches, O(log n) for fuzzy
   */
  findNodes(
    query: string,
    options: {
      nodeType?: string;
      maxResults?: number;
      includeFuzzy?: boolean;
    } = {}
  ): SearchResult[] {
    const { nodeType, maxResults = 10, includeFuzzy = true } = options;
    const results: SearchResult[] = [];

    // 1. Exact ID match (O(1)) - try both normalized and original
    let exactNode = this.nodes.get(query);
    if (!exactNode) {
      const normalizedId = this.originalIdIndex.get(query);
      if (normalizedId) {
        exactNode = this.nodes.get(normalizedId);
      }
    }

    if (exactNode && this.matchesType(exactNode, nodeType)) {
      results.push({ node: exactNode, score: 1.0, reason: "exact_id" });
    }

    // 2. Exact name match (O(1))
    const nameMatches = this.nameIndex.get(query.toLowerCase()) || new Set();
    for (const nodeId of nameMatches) {
      const node = this.nodes.get(nodeId);
      if (
        node &&
        this.matchesType(node, nodeType) &&
        !this.hasNode(results, node)
      ) {
        results.push({ node, score: 0.9, reason: "exact_name" });
      }
    }

    // 3. File path match (O(1))
    if (query.includes(".") || query.includes("/") || query.includes("\\")) {
      const normalizedQuery = query.replace(/\\/g, "/").toLowerCase();
      const fileMatches = this.fileIndex.get(normalizedQuery) || new Set();
      for (const nodeId of fileMatches) {
        const node = this.nodes.get(nodeId);
        if (
          node &&
          this.matchesType(node, nodeType) &&
          !this.hasNode(results, node)
        ) {
          results.push({ node, score: 0.8, reason: "file_path" });
        }
      }

      // Also try partial file path matching
      for (const [filePath, nodeIds] of this.fileIndex) {
        if (filePath.includes(normalizedQuery)) {
          for (const nodeId of nodeIds) {
            const node = this.nodes.get(nodeId);
            if (
              node &&
              this.matchesType(node, nodeType) &&
              !this.hasNode(results, node)
            ) {
              results.push({ node, score: 0.6, reason: "file_path" });
            }
          }
        }
      }
    }

    // 4. Fuzzy search using trigrams (O(log n))
    if (includeFuzzy && query.length >= 3) {
      const fuzzyResults = this.fuzzySearch(query, nodeType);
      for (const result of fuzzyResults) {
        if (!this.hasNode(results, result.node)) {
          results.push(result);
        }
      }
    }

    // Sort by score and limit results
    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * Get node by exact ID - O(1)
   * Supports both normalized and original IDs
   */
  getNode(nodeId: string): GraphNode | null {
    // Try normalized ID first
    let node = this.nodes.get(nodeId);
    if (node) return node;

    // Try original ID
    const normalizedId = this.originalIdIndex.get(nodeId);
    if (normalizedId) {
      return this.nodes.get(normalizedId) || null;
    }

    return null;
  }

  /**
   * Get the original ID for a normalized ID
   */
  getOriginalId(normalizedId: string): string | null {
    return this.reverseIdIndex.get(normalizedId) || null;
  }

  /**
   * Get nodes by type - O(1)
   */
  getNodesByType(nodeType: string): GraphNode[] {
    const nodeIds = this.typeIndex.get(nodeType) || new Set();
    return Array.from(nodeIds)
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get all nodes matching a file pattern
   */
  getNodesByFilePattern(pattern: string): GraphNode[] {
    const results: GraphNode[] = [];
    const normalizedPattern = pattern.replace(/\\/g, "/").toLowerCase();

    for (const [filePath, nodeIds] of this.fileIndex) {
      if (
        filePath.includes(normalizedPattern) ||
        filePath.match(normalizedPattern)
      ) {
        for (const nodeId of nodeIds) {
          const node = this.nodes.get(nodeId);
          if (node) results.push(node);
        }
      }
    }

    return results;
  }

  /**
   * Get comprehensive statistics about the index
   */
  getStats(): {
    totalNodes: number;
    nodeTypes: Record<string, number>;
    indexSizes: {
      names: number;
      files: number;
      types: number;
      trigrams: number;
    };
  } {
    const nodeTypes: Record<string, number> = {};
    for (const [type, nodeIds] of this.typeIndex) {
      nodeTypes[type] = nodeIds.size;
    }

    return {
      totalNodes: this.nodes.size,
      nodeTypes,
      indexSizes: {
        names: this.nameIndex.size,
        files: this.fileIndex.size,
        types: this.typeIndex.size,
        trigrams: this.nameTrigrams.size,
      },
    };
  }

  /**
   * Debug method to understand node structure
   */
  debugNode(query: string): {
    found: boolean;
    normalizedId?: string;
    originalId?: string;
    allMatches: Array<{
      id: string;
      name: string;
      type: string;
      file?: string;
      matchType: string;
    }>;
  } {
    const results = this.findNodes(query, {
      maxResults: 20,
      includeFuzzy: true,
    });

    return {
      found: results.length > 0,
      normalizedId: results[0]?.node.id,
      originalId: results[0]
        ? this.getOriginalId(results[0].node.id) || undefined
        : undefined,
      allMatches: results.map((r) => ({
        id: r.node.id,
        name: r.node.name,
        type: r.node.type,
        file: r.node.file,
        matchType: r.reason,
      })),
    };
  }

  private buildIndexes(graph: KnowledgeGraph): void {
    logger.info(`Building node indexes for ${graph.nodes.length} nodes...`);

    for (const node of graph.nodes) {
      // Create a unique normalized ID
      const normalizedId = this.normalizeId(node.id);

      // Store the node with normalized ID but preserve original metadata
      const indexedNode: GraphNode = {
        ...node,
        id: normalizedId,
        metadata: {
          ...node.metadata,
          originalId: node.id, // Keep original ID in metadata
        },
      };

      this.nodes.set(normalizedId, indexedNode);

      // Keep bidirectional mapping for BOTH the original ID and the actual node name
      this.originalIdIndex.set(node.id, normalizedId);
      this.originalIdIndex.set(node.name, normalizedId); // Add this for name-based lookup
      this.reverseIdIndex.set(normalizedId, node.id);

      // Index by name (case-insensitive)
      const nameKey = node.name.toLowerCase();
      if (!this.nameIndex.has(nameKey)) {
        this.nameIndex.set(nameKey, new Set());
      }
      this.nameIndex.get(nameKey)!.add(normalizedId);

      // Index by file path (normalized)
      if (node.file) {
        const fileKey = node.file.replace(/\\/g, "/").toLowerCase();
        if (!this.fileIndex.has(fileKey)) {
          this.fileIndex.set(fileKey, new Set());
        }
        this.fileIndex.get(fileKey)!.add(normalizedId);
      }

      // Index by type
      if (!this.typeIndex.has(node.type)) {
        this.typeIndex.set(node.type, new Set());
      }
      this.typeIndex.get(node.type)!.add(normalizedId);

      // Build trigrams for fuzzy search
      this.addTrigrams(node.name.toLowerCase(), normalizedId);
    }

    logger.info(
      `Node indexes built successfully: ${
        this.getStats().totalNodes
      } nodes indexed`
    );
  }

  private normalizeId(originalId: string): string {
    // Create a hash-based ID for consistency and collision avoidance
    const hash = createHash("sha256")
      .update(originalId)
      .digest("hex")
      .substring(0, 8);
    return `node_${++this.nodeCounter}_${hash}`;
  }

  private addTrigrams(text: string, nodeId: string): void {
    if (text.length < 3) return;

    for (let i = 0; i <= text.length - 3; i++) {
      const trigram = text.slice(i, i + 3);
      if (!this.nameTrigrams.has(trigram)) {
        this.nameTrigrams.set(trigram, new Set());
      }
      this.nameTrigrams.get(trigram)!.add(nodeId);
    }
  }

  private fuzzySearch(query: string, nodeType?: string): SearchResult[] {
    if (query.length < 3) return [];

    const queryTrigrams = new Set<string>();
    const queryLower = query.toLowerCase();

    // Generate trigrams for query
    for (let i = 0; i <= queryLower.length - 3; i++) {
      queryTrigrams.add(queryLower.slice(i, i + 3));
    }

    // Find nodes with matching trigrams
    const candidateScores = new Map<string, number>();

    for (const trigram of queryTrigrams) {
      const matchingNodes = this.nameTrigrams.get(trigram) || new Set();
      for (const nodeId of matchingNodes) {
        candidateScores.set(nodeId, (candidateScores.get(nodeId) || 0) + 1);
      }
    }

    // Calculate similarity scores and filter results
    const results: SearchResult[] = [];
    const minScore = Math.max(1, queryTrigrams.size * 0.3); // At least 30% match

    for (const [nodeId, trigramMatches] of candidateScores) {
      if (trigramMatches >= minScore) {
        const node = this.nodes.get(nodeId);
        if (node && this.matchesType(node, nodeType)) {
          const similarity = trigramMatches / queryTrigrams.size;
          results.push({
            node,
            score: similarity * 0.6, // Scale down fuzzy scores
            reason: "fuzzy",
          });
        }
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private matchesType(node: GraphNode, nodeType?: string): boolean {
    return !nodeType || node.type === nodeType;
  }

  private hasNode(results: SearchResult[], node: GraphNode): boolean {
    return results.some((r) => r.node.id === node.id);
  }
}
