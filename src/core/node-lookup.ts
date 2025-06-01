/**
 * Fast node lookup service with caching and efficient indexing
 */
import { logger } from '../utils/logger.js'
import { GraphStorage } from './graph-storage.js'
import type { KnowledgeGraph, GraphNode } from '../types/index.js'
import { normalizeNodeId, parseNodeId, findNodeByQuery } from '../utils/node-id.js'

// Cache structures for fast node lookups
interface NodeCache {
  byId: Map<string, GraphNode>
  byName: Map<string, GraphNode[]>
  byType: Map<string, GraphNode[]>
  byFile: Map<string, GraphNode[]>
  lastUpdated: number
}

class NodeLookupService {
  private storage: GraphStorage
  private caches: Map<string, NodeCache> = new Map()
  private cacheExpiryMs: number = 5 * 60 * 1000 // 5 minutes
  private initializing: Map<string, Promise<void>> = new Map()

  constructor() {
    this.storage = new GraphStorage()
  }

  /**
   * Initialize the cache for a specific graph
   * @param graphId The ID of the graph to initialize cache for
   */
  private async initializeCache(graphId: string): Promise<void> {
    // Return existing initialization promise if already in progress
    if (this.initializing.has(graphId)) {
      return this.initializing.get(graphId)!
    }

    // Create a new initialization promise
    const initPromise = (async () => {
      try {
        logger.info(`Initializing node lookup cache for graph ${graphId}`)
        const graph = await this.storage.getGraph(graphId)
        
        if (!graph) {
          throw new Error(`Graph not found: ${graphId}`)
        }
        
        const byId = new Map<string, GraphNode>()
        const byName = new Map<string, GraphNode[]>()
        const byType = new Map<string, GraphNode[]>()
        const byFile = new Map<string, GraphNode[]>()
        
        // Index all nodes
        for (const node of graph.nodes) {
          // Index by ID (unique)
          byId.set(node.id, node)
          
          // Index by name (can have multiple nodes with same name)
          if (!byName.has(node.name)) {
            byName.set(node.name, [])
          }
          byName.get(node.name)!.push(node)
          
          // Index by type
          if (!byType.has(node.type)) {
            byType.set(node.type, [])
          }
          byType.get(node.type)!.push(node)
          
          // Index by file (if applicable)
          if (node.file) {
            if (!byFile.has(node.file)) {
              byFile.set(node.file, [])
            }
            byFile.get(node.file)!.push(node)
          }
        }
        
        // Store the cache
        this.caches.set(graphId, {
          byId,
          byName,
          byType,
          byFile,
          lastUpdated: Date.now()
        })
        
        logger.info(`Cache initialized for graph ${graphId} with ${graph.nodes.length} nodes`)
      } catch (error) {
        logger.error(`Failed to initialize cache for graph ${graphId}:`, error)
        throw error
      } finally {
        // Remove from initializing map
        this.initializing.delete(graphId)
      }
    })()

    // Store the promise
    this.initializing.set(graphId, initPromise)
    return initPromise
  }

  /**
   * Get the cache for a graph, initializing if needed
   * @param graphId The ID of the graph to get cache for
   * @returns The node cache
   */
  private async getCache(graphId: string): Promise<NodeCache> {
    // Check if cache exists and is not expired
    const existing = this.caches.get(graphId)
    const now = Date.now()
    
    if (existing && (now - existing.lastUpdated < this.cacheExpiryMs)) {
      return existing
    }
    
    // Initialize or refresh cache
    await this.initializeCache(graphId)
    return this.caches.get(graphId)!
  }

  /**
   * Get a node by ID with fast lookup
   * @param graphId The ID of the graph to search in
   * @param nodeId The ID of the node to get
   * @returns The node or undefined if not found
   */
  public async getNode(graphId: string, nodeId: string): Promise<GraphNode | undefined> {
    try {
      const cache = await this.getCache(graphId)
      return cache.byId.get(nodeId)
    } catch (error) {
      logger.error(`Error getting node ${nodeId} in graph ${graphId}:`, error)
      throw error
    }
  }

  /**
   * Find a node by name, type or path
   * @param graphId The ID of the graph to search in
   * @param query The query to search for (name, ID, etc.)
   * @param type Optional node type to filter by
   * @returns The matching node or null if not found
   */
  public async findNode(
    graphId: string, 
    query: string,
    type?: string
  ): Promise<GraphNode | null> {
    try {
      const cache = await this.getCache(graphId)
      
      // Step 1: Try direct ID lookup (fastest)
      if (cache.byId.has(query)) {
        return cache.byId.get(query)!
      }
      
      // Step 2: Try exact name match with optional type filter
      if (cache.byName.has(query)) {
        const nameMatches = cache.byName.get(query)!
        
        // If type filter is provided, filter by type
        if (type) {
          const typeMatches = nameMatches.filter(node => node.type === type)
          if (typeMatches.length === 1) {
            return typeMatches[0]
          } else if (typeMatches.length > 0) {
            // Return exported/public node if available
            const exportedMatch = typeMatches.find(node => node.metadata?.isExported)
            return exportedMatch || typeMatches[0]
          }
        } else if (nameMatches.length === 1) {
          return nameMatches[0]
        } else if (nameMatches.length > 0) {
          // Return exported/public node if available
          const exportedMatch = nameMatches.find(node => node.metadata?.isExported)
          return exportedMatch || nameMatches[0]
        }
      }
      
      // Step 3: Try to match by normalized ID
      // For this we need the raw graph (expensive but needed for complex cases)
      const graph = await this.storage.getGraph(graphId)
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`)
      }
      
      // Try to normalize the ID
      const normalizedId = normalizeNodeId(query, graph)
      if (normalizedId !== query && cache.byId.has(normalizedId)) {
        return cache.byId.get(normalizedId)!
      }
      
      // Step 4: Try to parse the ID and match components
      const idParts = parseNodeId(query)
      if (idParts) {
        // If we have a type, filter nodes by that type
        if (idParts.type && cache.byType.has(idParts.type)) {
          const typeMatches = cache.byType.get(idParts.type)!
          
          // Find nodes matching name and path parts
          const matches = typeMatches.filter(node => {
            // Extract parts from the actual node ID for comparison
            const nodeParts = parseNodeId(node.id)
            if (!nodeParts) return false
            
            return (
              (!idParts.name || nodeParts.name === idParts.name) &&
              (!idParts.path || nodeParts.path.includes(idParts.path))
            )
          })
          
          if (matches.length === 1) {
            return matches[0]
          } else if (matches.length > 0) {
            // Return exported/public node if available
            const exportedMatch = matches.find(node => node.metadata?.isExported)
            return exportedMatch || matches[0]
          }
        }
      }
      
      // Step 5: Check if query looks like a file path
      if (query.includes('.') || query.includes('/') || query.includes('\\')) {
        // Try to find exact file path match
        if (cache.byFile.has(query)) {
          const fileMatches = cache.byFile.get(query)!
          // Prefer the node representing the file itself
          const fileNode = fileMatches.find(node => node.type === 'File')
          return fileNode || fileMatches[0]
        }
        
        // Try to find partial file path match
        for (const [filePath, nodes] of cache.byFile.entries()) {
          if (filePath.includes(query)) {
            // Prefer the node representing the file itself
            const fileNode = nodes.find(node => node.type === 'File')
            return fileNode || nodes[0]
          }
        }
      }
      
      // Step 6: Fall back to more expensive comprehensive search
      return findNodeByQuery(graph, query, type) || null
    } catch (error) {
      logger.error(`Error finding node for query "${query}" in graph ${graphId}:`, error)
      throw error
    }
  }

  /**
   * Find nodes by type with efficient indexing
   * @param graphId The ID of the graph to search in
   * @param type The node type to find
   * @param limit Maximum number of results
   * @returns Array of matching nodes
   */
  public async findNodesByType(
    graphId: string,
    type: string,
    limit: number = 100
  ): Promise<GraphNode[]> {
    try {
      const cache = await this.getCache(graphId)
      
      if (cache.byType.has(type)) {
        return cache.byType.get(type)!.slice(0, limit)
      }
      
      return []
    } catch (error) {
      logger.error(`Error finding nodes of type "${type}" in graph ${graphId}:`, error)
      throw error
    }
  }

  /**
   * Search for nodes by name pattern
   * @param graphId The ID of the graph to search in
   * @param namePattern String or regex pattern to match against node names
   * @param type Optional node type to filter by
   * @param limit Maximum number of results
   * @returns Array of matching nodes
   */
  public async searchNodesByName(
    graphId: string,
    namePattern: string | RegExp,
    type?: string,
    limit: number = 100
  ): Promise<GraphNode[]> {
    try {
      const cache = await this.getCache(graphId)
      const pattern = typeof namePattern === 'string' 
        ? new RegExp(namePattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')
        : namePattern
      
      let matches: GraphNode[] = []
      
      // If type is specified, search only within that type
      if (type && cache.byType.has(type)) {
        matches = cache.byType.get(type)!.filter(node => 
          pattern.test(node.name)
        )
      } else {
        // Search all nodes
        for (const node of cache.byId.values()) {
          if (pattern.test(node.name)) {
            matches.push(node)
            if (matches.length >= limit) break
          }
        }
      }
      
      return matches.slice(0, limit)
    } catch (error) {
      logger.error(`Error searching nodes by name "${namePattern}" in graph ${graphId}:`, error)
      throw error
    }
  }

  /**
   * Get nodes defined in a specific file
   * @param graphId The ID of the graph to search in
   * @param filePath The file path to find nodes for
   * @returns Array of nodes defined in the file
   */
  public async getNodesInFile(
    graphId: string,
    filePath: string
  ): Promise<GraphNode[]> {
    try {
      const cache = await this.getCache(graphId)
      
      // Normalize path (handle both / and \ separators)
      const normalizedPath = filePath.replace(/\\/g, '/')
      const backslashPath = filePath.replace(/\//g, '\\')
      
      // Try both path formats
      for (const path of [filePath, normalizedPath, backslashPath]) {
        if (cache.byFile.has(path)) {
          return cache.byFile.get(path)!
        }
      }
      
      // Try partial matches
      for (const [path, nodes] of cache.byFile.entries()) {
        if (path.endsWith(filePath) || filePath.endsWith(path)) {
          return nodes
        }
      }
      
      return []
    } catch (error) {
      logger.error(`Error getting nodes in file "${filePath}" in graph ${graphId}:`, error)
      throw error
    }
  }

  /**
   * Invalidate the cache for a specific graph
   * @param graphId The ID of the graph to invalidate cache for
   */
  public invalidateCache(graphId: string): void {
    this.caches.delete(graphId)
    logger.info(`Cache invalidated for graph ${graphId}`)
  }

  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.caches.clear()
    logger.info('All node lookup caches cleared')
  }
}

// Singleton instance
export const nodeLookup = new NodeLookupService()