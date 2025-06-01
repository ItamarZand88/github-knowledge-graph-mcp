/**
 * Enhanced NodeIndex with Edge Indexing and Readable IDs
 * Replaces the existing node-index.ts with optimized performance
 */

import type { KnowledgeGraph, GraphNode, GraphEdge } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { ReadableIdSystem } from "./readable-id-system.js";

export interface SearchResult {
  node: GraphNode;
  score: number;
  reason: "exact_id" | "exact_name" | "partial_name" | "file_path" | "fuzzy" | "pattern";
}

export interface ConnectedNodeResult {
  edge: GraphEdge;
  node: GraphNode;
  distance: number;
}

export interface PathResult {
  path: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

export interface LLMGraphContext {
  systemDescription: string;
  graphStats: {
    totalNodes: number;
    totalEdges: number;
    byType: Record<string, number>;
    byDomain: Record<string, number>;
  };
  searchCapabilities: {
    patterns: string[];
    domains: string[];
    types: string[];
    examples: string[];
  };
}

export class EnhancedNodeIndex {
  private idSystem = new ReadableIdSystem();
  
  // Core indexes with new ID system
  private nodes = new Map<string, GraphNode>();
  private typeIndex = new Map<string, Set<string>>();
  private domainIndex = new Map<string, Set<string>>();
  private nameIndex = new Map<string, Set<string>>();
  
  // Edge indexes for O(1) traversal
  private outgoingEdgeIndex = new Map<string, GraphEdge[]>();
  private incomingEdgeIndex = new Map<string, GraphEdge[]>();
  private edgeTypeIndex = new Map<string, GraphEdge[]>();
  private edgeIndex = new Map<string, GraphEdge>();

  // Original ID mapping for backward compatibility
  private originalIdMapping = new Map<string, string>(); // old -> new
  private reverseIdMapping = new Map<string, string>(); // new -> old

  constructor(graph: KnowledgeGraph) {
    this.buildIndexes(graph);
  }

  /**
   * 🔥 Build indexes with readable ID system
   */
  private buildIndexes(graph: KnowledgeGraph): void {
    logger.info(`Building enhanced indexes with readable IDs for ${graph.nodes.length} nodes...`);

    // Phase 1: Create new IDs for all nodes
    for (const node of graph.nodes) {
      const newId = this.idSystem.createNodeId(node.type, node.name, node.file || 'unknown');
      this.originalIdMapping.set(node.id, newId);
      this.reverseIdMapping.set(newId, node.id);
      
      // Create enhanced node with new ID
      const enhancedNode: GraphNode = {
        ...node,
        id: newId,
        metadata: {
          ...node.metadata,
          originalId: node.id,
          readable: true
        }
      };

      this.nodes.set(newId, enhancedNode);
      this.indexNode(enhancedNode);
    }

    // Phase 2: Update edges with new IDs
    for (const edge of graph.edges) {
      const newFromId = this.originalIdMapping.get(edge.from);
      const newToId = this.originalIdMapping.get(edge.to);
      
      if (newFromId && newToId) {
        const enhancedEdge: GraphEdge = {
          ...edge,
          from: newFromId,
          to: newToId
        };
        
        this.indexEdge(enhancedEdge);
      }
    }

    logger.info(`Enhanced indexes built: ${this.nodes.size} nodes with readable IDs`);
  }

  /**
   * Index a single node with multiple access patterns
   */
  private indexNode(node: GraphNode): void {
    // Index by type
    if (!this.typeIndex.has(node.type)) {
      this.typeIndex.set(node.type, new Set());
    }
    this.typeIndex.get(node.type)!.add(node.id);

    // Index by domain (extracted from ID)
    const parsed = this.idSystem.parseId(node.id);
    if (parsed) {
      if (!this.domainIndex.has(parsed.domain)) {
        this.domainIndex.set(parsed.domain, new Set());
      }
      this.domainIndex.get(parsed.domain)!.add(node.id);
    }

    // Index by name (for LLM searches)
    const nameKey = node.name.toLowerCase();
    if (!this.nameIndex.has(nameKey)) {
      this.nameIndex.set(nameKey, new Set());
    }
    this.nameIndex.get(nameKey)!.add(node.id);
  }

  /**
   * Index a single edge
   */
  private indexEdge(edge: GraphEdge): void {
    const edgeId = this.idSystem.createEdgeId(edge.from, edge.to, edge.type);
    this.edgeIndex.set(edgeId, edge);

    // Outgoing edges
    if (!this.outgoingEdgeIndex.has(edge.from)) {
      this.outgoingEdgeIndex.set(edge.from, []);
    }
    this.outgoingEdgeIndex.get(edge.from)!.push(edge);

    // Incoming edges  
    if (!this.incomingEdgeIndex.has(edge.to)) {
      this.incomingEdgeIndex.set(edge.to, []);
    }
    this.incomingEdgeIndex.get(edge.to)!.push(edge);

    // Edge type index
    if (!this.edgeTypeIndex.has(edge.type)) {
      this.edgeTypeIndex.set(edge.type, []);
    }
    this.edgeTypeIndex.get(edge.type)!.push(edge);
  }

  // ================================================================================
  // 🔥 PUBLIC API - Fast lookups and searches
  // ================================================================================

  /**
   * Get node by ID (supports both old and new IDs)
   */
  getNode(nodeId: string): GraphNode | null {
    // Try new ID first
    let node = this.nodes.get(nodeId);
    if (node) return node;

    // Try old ID mapping
    const newId = this.originalIdMapping.get(nodeId);
    if (newId) {
      return this.nodes.get(newId) || null;
    }

    return null;
  }

  /**
   * Search by pattern matching (for LLM)
   */
  searchByPattern(pattern: string): GraphNode[] {
    const results: GraphNode[] = [];
    
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    
    for (const [nodeId, node] of this.nodes) {
      if (regex.test(nodeId)) {
        results.push(node);
      }
    }
    
    return results;
  }

  /**
   * Advanced search with multiple criteria
   */
  advancedSearch(query: {
    type?: string;
    domain?: string;
    nameContains?: string;
    pattern?: string;
    limit?: number;
  }): SearchResult[] {
    let candidateIds = new Set<string>(this.nodes.keys());
    const limit = query.limit || 50;

    // Filter by type
    if (query.type) {
      const typeNodes = this.typeIndex.get(query.type) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => typeNodes.has(id)));
    }

    // Filter by domain
    if (query.domain) {
      const domainNodes = this.domainIndex.get(query.domain) || new Set();
      candidateIds = new Set([...candidateIds].filter(id => domainNodes.has(id)));
    }

    // Filter by name
    if (query.nameContains) {
      candidateIds = new Set([...candidateIds].filter(id => {
        const node = this.nodes.get(id);
        return node && node.name.toLowerCase().includes(query.nameContains!.toLowerCase());
      }));
    }

    // Filter by pattern
    if (query.pattern) {
      const patternResults = this.searchByPattern(query.pattern);
      const patternIds = new Set(patternResults.map(n => n.id));
      candidateIds = new Set([...candidateIds].filter(id => patternIds.has(id)));
    }

    const results = [...candidateIds]
      .slice(0, limit)
      .map(id => ({
        node: this.nodes.get(id)!,
        score: 1.0,
        reason: query.pattern ? 'pattern' as const : 'exact_name' as const
      }))
      .filter(r => r.node);

    return results;
  }

  /**
   * Find nodes by name with fuzzy matching
   */
  findNodes(query: string, options: {
    maxResults?: number;
    includePartial?: boolean;
  } = {}): SearchResult[] {
    const { maxResults = 10, includePartial = true } = options;
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    // Exact name match
    const exactMatches = this.nameIndex.get(queryLower) || new Set();
    for (const nodeId of exactMatches) {
      const node = this.nodes.get(nodeId);
      if (node) {
        results.push({ node, score: 1.0, reason: 'exact_name' });
      }
    }

    // Partial matches if enabled
    if (includePartial && results.length < maxResults) {
      for (const [nodeId, node] of this.nodes) {
        if (results.some(r => r.node.id === nodeId)) continue;
        
        if (node.name.toLowerCase().includes(queryLower)) {
          results.push({ node, score: 0.7, reason: 'partial_name' });
        }
        
        if (results.length >= maxResults) break;
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ================================================================================
  // 🔥 EDGE OPERATIONS - O(1) to O(k) complexity
  // ================================================================================

  /**
   * Get all outgoing edges from a node - O(1)
   */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const resolvedId = this.resolveNodeId(nodeId);
    return this.outgoingEdgeIndex.get(resolvedId) || [];
  }

  /**
   * Get all incoming edges to a node - O(1)
   */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    const resolvedId = this.resolveNodeId(nodeId);
    return this.incomingEdgeIndex.get(resolvedId) || [];
  }

  /**
   * Get all edges of a specific type - O(1)
   */
  getEdgesByType(edgeType: string): GraphEdge[] {
    return this.edgeTypeIndex.get(edgeType) || [];
  }

  /**
   * Get connected nodes (outgoing) with edge information - O(k)
   */
  getConnectedNodes(nodeId: string, edgeTypes?: string[]): ConnectedNodeResult[] {
    const outgoingEdges = this.getOutgoingEdges(nodeId);
    const filteredEdges = edgeTypes 
      ? outgoingEdges.filter(edge => edgeTypes.includes(edge.type))
      : outgoingEdges;

    return filteredEdges
      .map(edge => {
        const node = this.getNode(edge.to);
        return node ? { edge, node, distance: 1 } : null;
      })
      .filter((item): item is ConnectedNodeResult => item !== null);
  }

  /**
   * Get dependent nodes (incoming) with edge information - O(k)
   */
  getDependentNodes(nodeId: string, edgeTypes?: string[]): ConnectedNodeResult[] {
    const incomingEdges = this.getIncomingEdges(nodeId);
    const filteredEdges = edgeTypes 
      ? incomingEdges.filter(edge => edgeTypes.includes(edge.type))
      : incomingEdges;

    return filteredEdges
      .map(edge => {
        const node = this.getNode(edge.from);
        return node ? { edge, node, distance: 1 } : null;
      })
      .filter((item): item is ConnectedNodeResult => item !== null);
  }

  /**
   * Find shortest path between two nodes using BFS
   */
  findShortestPath(fromId: string, toId: string, maxDepth: number = 5): PathResult | null {
    const resolvedFromId = this.resolveNodeId(fromId);
    const resolvedToId = this.resolveNodeId(toId);
    
    if (resolvedFromId === resolvedToId) {
      const node = this.getNode(resolvedFromId);
      return node ? { path: [node], edges: [], length: 0 } : null;
    }

    const queue: Array<{nodeId: string, path: string[], edgePath: GraphEdge[]}> = [
      { nodeId: resolvedFromId, path: [resolvedFromId], edgePath: [] }
    ];
    const visited = new Set<string>([resolvedFromId]);

    while (queue.length > 0) {
      const { nodeId, path, edgePath } = queue.shift()!;
      
      if (path.length > maxDepth) continue;

      const outgoingEdges = this.getOutgoingEdges(nodeId);
      
      for (const edge of outgoingEdges) {
        if (edge.to === resolvedToId) {
          // Found target!
          const fullPath = [...path, edge.to];
          const fullEdgePath = [...edgePath, edge];
          const nodePath = fullPath
            .map(id => this.getNode(id)!)
            .filter(Boolean);
          
          return {
            path: nodePath,
            edges: fullEdgePath,
            length: fullPath.length - 1
          };
        }

        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({
            nodeId: edge.to,
            path: [...path, edge.to],
            edgePath: [...edgePath, edge]
          });
        }
      }
    }

    return null;
  }

  // ================================================================================
  // 🔥 LLM INTEGRATION
  // ================================================================================

  /**
   * Build context for LLM integration
   */
  buildLLMContext(): LLMGraphContext {
    const examples = this.idSystem.generateExamples();
    const stats = this.getStats();
    
    return {
      systemDescription: `
This codebase uses a readable ID system for nodes:

FORMAT: type.name.domain_file
- type: function|class|interface|variable|enum
- name: actual name (sanitized)  
- domain: functional area (api, business, data, etc.)
- file: source file name (sanitized)

EXAMPLES:
${examples.nodeExamples.map(ex => `- ${ex}`).join('\n')}

EDGE FORMAT: fromId--EDGE_TYPE-->toId
${examples.edgeExamples.map(ex => `- ${ex}`).join('\n')}

SEARCH PATTERNS:
${examples.searchPatterns.map(ex => `- ${ex}`).join('\n')}
      `,
      graphStats: {
        totalNodes: this.nodes.size,
        totalEdges: this.edgeIndex.size,
        byType: stats.byType,
        byDomain: stats.byDomain
      },
      searchCapabilities: {
        patterns: examples.searchPatterns,
        domains: Array.from(this.domainIndex.keys()),
        types: Array.from(this.typeIndex.keys()),
        examples: [
          'Search "data processing" → patterns: function.*.business_*, *.process*.*',
          'Search "API endpoints" → patterns: function.*.api_*, class.*controller*',
          'Search "validation logic" → patterns: *.*validation*, function.validate*.*'
        ]
      }
    };
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): {
    totalNodes: number;
    totalEdges: number;
    byType: Record<string, number>;
    byDomain: Record<string, number>;
    mostConnectedNodes: Array<{
      id: string;
      name: string;
      type: string;
      outgoingCount: number;
      incomingCount: number;
      totalConnections: number;
    }>;
  } {
    const byType: Record<string, number> = {};
    for (const [type, nodeIds] of this.typeIndex) {
      byType[type] = nodeIds.size;
    }

    const byDomain: Record<string, number> = {};
    for (const [domain, nodeIds] of this.domainIndex) {
      byDomain[domain] = nodeIds.size;
    }

    // Calculate most connected nodes
    const connectionCounts = new Map<string, {outgoing: number, incoming: number}>();
    
    for (const [nodeId, edges] of this.outgoingEdgeIndex) {
      if (!connectionCounts.has(nodeId)) {
        connectionCounts.set(nodeId, {outgoing: 0, incoming: 0});
      }
      connectionCounts.get(nodeId)!.outgoing = edges.length;
    }
    
    for (const [nodeId, edges] of this.incomingEdgeIndex) {
      if (!connectionCounts.has(nodeId)) {
        connectionCounts.set(nodeId, {outgoing: 0, incoming: 0});
      }
      connectionCounts.get(nodeId)!.incoming = edges.length;
    }

    const mostConnectedNodes = Array.from(connectionCounts.entries())
      .map(([nodeId, counts]) => {
        const node = this.getNode(nodeId);
        return {
          id: nodeId,
          name: node?.name || 'Unknown',
          type: node?.type || 'Unknown',
          outgoingCount: counts.outgoing,
          incomingCount: counts.incoming,
          totalConnections: counts.outgoing + counts.incoming
        };
      })
      .sort((a, b) => b.totalConnections - a.totalConnections)
      .slice(0, 10);

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edgeIndex.size,
      byType,
      byDomain,
      mostConnectedNodes
    };
  }

  // ================================================================================
  // PRIVATE HELPERS
  // ================================================================================

  /**
   * Resolve node ID (handle both old and new IDs)
   */
  private resolveNodeId(nodeId: string): string {
    // If it's already a new ID, return as-is
    if (this.nodes.has(nodeId)) {
      return nodeId;
    }
    
    // Try to convert from old ID
    const newId = this.originalIdMapping.get(nodeId);
    return newId || nodeId;
  }
}
