/**
 * Unified node lookup system with multiple search strategies
 * Provides backward compatibility with legacy node ID formats
 */

import { GraphNode, KnowledgeGraph } from '../types/index.js'
import { GraphStorage } from './graph-storage.js'
import { logger } from '../utils/logger.js'

export interface NodeLookupOptions {
  nodeType?: string
  maxResults?: number
  includeFuzzy?: boolean
  exactMatchOnly?: boolean
  searchInFiles?: string[]
}

export interface NodeDetails {
  node: GraphNode
  relatedNodes: GraphNode[]
  incomingRelations: any[]
  outgoingRelations: any[]
  relationshipCount: number
}

export interface SearchResult {
  node: GraphNode
  score: number
  reason: string
}

class NodeLookup {
  private static instance: NodeLookup
  private storage: GraphStorage
  private graphIndexCache = new Map<string, Map<string, GraphNode>>()

  private constructor() {
    this.storage = new GraphStorage()
  }

  public static getInstance(): NodeLookup {
    if (!NodeLookup.instance) {
      NodeLookup.instance = new NodeLookup()
    }
    return NodeLookup.instance
  }

  /**
   * Normalized node ID lookup with flexible formats
   * Supports both normalized IDs and legacy formats
   */
  public async findNode(
    graphId: string,
    nodeQuery: string,
    options: NodeLookupOptions = {}
  ): Promise<GraphNode | null> {
    const results = await this.findNodes(graphId, nodeQuery, {
      ...options,
      maxResults: 1,
    })
    return results.length > 0 ? results[0].node : null
  }

  /**
   * Find multiple nodes matching the query
   */
  public async findNodes(
    graphId: string,
    nodeQuery: string,
    options: NodeLookupOptions = {}
  ): Promise<SearchResult[]> {
    const nodeIndex = await this.getIndexForGraph(graphId)
    if (!nodeIndex || nodeIndex.size === 0) {
      logger.error(`No index found for graph ${graphId}`)
      return []
    }

    // Handle file filtering - convert to more specific queries if needed
    if (options.searchInFiles && options.searchInFiles.length > 0) {
      const fileResults: SearchResult[] = []

      // Search in each specified file
      for (const filePath of options.searchInFiles) {
        // Get all nodes in this file from the index
        const nodesInFile = Array.from(nodeIndex.values()).filter(node => 
          node.file && node.file.includes(filePath)
        )

        // Filter nodes that match the query
        for (const node of nodesInFile) {
          if (this.nodeMatchesQuery(node, nodeQuery)) {
            fileResults.push({
              node,
              score: this.calculateScore(node, nodeQuery),
              reason: 'file_filtered',
            })
          }
        }
      }

      return fileResults
        .sort((a, b) => b.score - a.score)
        .slice(0, options.maxResults || 10)
    }

    // Regular search
    const results: SearchResult[] = []
    
    // Exact match by ID
    const exactNode = nodeIndex.get(nodeQuery);
    if (exactNode) {
      results.push({
        node: exactNode,
        score: 1.0,
        reason: 'exact_id'
      });
      
      if (options.exactMatchOnly) {
        return results;
      }
    }
    
    // Name match
    for (const node of nodeIndex.values()) {
      if (node.name.toLowerCase() === nodeQuery.toLowerCase()) {
        if (!results.some(r => r.node.id === node.id)) {
          results.push({
            node,
            score: 0.9,
            reason: 'exact_name'
          });
        }
      }
    }
    
    // Fuzzy matching if requested
    if (options.includeFuzzy !== false) {
      for (const node of nodeIndex.values()) {
        // Skip nodes already added via exact matches
        if (results.some(r => r.node.id === node.id)) {
          continue;
        }
        
        // Filter by node type if specified
        if (options.nodeType && node.type !== options.nodeType) {
          continue;
        }
        
        // Fuzzy name match
        if (node.name.toLowerCase().includes(nodeQuery.toLowerCase()) ||
            node.id.toLowerCase().includes(nodeQuery.toLowerCase())) {
          results.push({
            node,
            score: 0.7,
            reason: 'fuzzy'
          });
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.maxResults || 10);
  }

  /**
   * Get a specific node by exact ID
   */
  public async getNode(
    graphId: string,
    nodeId: string
  ): Promise<GraphNode | null> {
    const nodeIndex = await this.getIndexForGraph(graphId)
    if (!nodeIndex) return null

    // Try direct lookup
    const node = nodeIndex.get(nodeId);
    if (node) return node;

    // Try to find by name as fallback
    const results = await this.findNodes(graphId, nodeId, {
      maxResults: 1,
      includeFuzzy: false,
    })

    return results.length > 0 ? results[0].node : null
  }

  /**
   * Get nodes by type
   */
  public async getNodesByType(
    graphId: string,
    nodeType: string
  ): Promise<GraphNode[]> {
    const nodeIndex = await this.getIndexForGraph(graphId)
    if (!nodeIndex) return []

    return Array.from(nodeIndex.values()).filter(node => node.type === nodeType)
  }

  /**
   * Get nodes defined in specific files
   */
  public async getNodesInFile(
    graphId: string,
    filePath: string
  ): Promise<GraphNode[]> {
    const nodeIndex = await this.getIndexForGraph(graphId)
    if (!nodeIndex) return []

    return Array.from(nodeIndex.values()).filter(node => 
      node.file && node.file.includes(filePath)
    )
  }

  /**
   * Clear the graph cache for a specific graph
   */
  public clearGraphCache(graphId: string): void {
    this.graphIndexCache.delete(graphId)
  }

  /**
   * Get or create an index for a graph
   */
  private async getIndexForGraph(graphId: string): Promise<Map<string, GraphNode> | null> {
    if (this.graphIndexCache.has(graphId)) {
      return this.graphIndexCache.get(graphId) || null
    }

    const graph = await this.storage.getGraph(graphId)
    if (!graph) {
      logger.error(`Graph not found: ${graphId}`)
      return null
    }

    // Create a simple map index of nodes by ID
    const nodeIndex = new Map<string, GraphNode>()
    for (const node of graph.nodes) {
      nodeIndex.set(node.id, node)
    }

    this.graphIndexCache.set(graphId, nodeIndex)
    return nodeIndex
  }

  /**
   * Check if a node matches a query
   */
  private nodeMatchesQuery(node: GraphNode, query: string): boolean {
    const queryLower = query.toLowerCase()
    
    // Check node ID
    if (node.id.toLowerCase().includes(queryLower)) {
      return true
    }
    
    // Check node name
    if (node.name.toLowerCase().includes(queryLower)) {
      return true
    }
    
    // Check file path
    if (node.file && node.file.toLowerCase().includes(queryLower)) {
      return true
    }
    
    // Check documentation
    if (node.metadata?.documentation && 
        node.metadata.documentation.toLowerCase().includes(queryLower)) {
      return true
    }
    
    return false
  }

  /**
   * Calculate a score for how well a node matches a query
   */
  private calculateScore(node: GraphNode, query: string): number {
    const queryLower = query.toLowerCase()
    
    // Exact ID match
    if (node.id.toLowerCase() === queryLower) {
      return 1.0
    }
    
    // Exact name match
    if (node.name.toLowerCase() === queryLower) {
      return 0.9
    }
    
    // Partial ID match
    if (node.id.toLowerCase().includes(queryLower)) {
      return 0.7
    }
    
    // Partial name match
    if (node.name.toLowerCase().includes(queryLower)) {
      return 0.6
    }
    
    // File path match
    if (node.file && node.file.toLowerCase().includes(queryLower)) {
      return 0.4
    }
    
    // Documentation match
    if (node.metadata?.documentation && 
        node.metadata.documentation.toLowerCase().includes(queryLower)) {
      return 0.3
    }
    
    return 0.1
  }
}

// Singleton instance
export const nodeLookup = NodeLookup.getInstance()