/**
 * Graph storage service for persisting and retrieving knowledge graphs
 */
import fs from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger.js'
import type { KnowledgeGraph } from '../types/index.js'

export class GraphStorage {
  private baseDir: string
  private graphs: Map<string, KnowledgeGraph> = new Map()
  private metadata: Map<string, {
    created: Date
    updated: Date
    repository?: string
    size: {
      nodes: number
      edges: number
    }
  }> = new Map()

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'data', 'graphs')
    this.initStorage()
  }

  /**
   * Initialize storage by creating directories if they don't exist
   */
  private async initStorage(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true })
      logger.info(`Graph storage initialized at ${this.baseDir}`)
      await this.loadMetadata()
    } catch (error) {
      logger.error('Error initializing graph storage:', error)
      throw error
    }
  }

  /**
   * Load metadata for all graphs
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadataFile = path.join(this.baseDir, 'metadata.json')
      const exists = await this.fileExists(metadataFile)
      
      if (exists) {
        const data = await fs.readFile(metadataFile, 'utf-8')
        const parsed = JSON.parse(data)
        
        // Convert to Map
        for (const [id, meta] of Object.entries(parsed)) {
          this.metadata.set(id, {
            ...(meta as any),
            created: new Date((meta as any).created),
            updated: new Date((meta as any).updated)
          })
        }
        
        logger.info(`Loaded metadata for ${this.metadata.size} graphs`)
      } else {
        logger.info('No metadata file found, creating a new one')
        await this.saveMetadata()
      }
    } catch (error) {
      logger.error('Error loading graph metadata:', error)
      throw error
    }
  }

  /**
   * Save metadata for all graphs
   */
  private async saveMetadata(): Promise<void> {
    try {
      const metadataFile = path.join(this.baseDir, 'metadata.json')
      
      // Convert Map to object
      const metadataObj: Record<string, any> = {}
      for (const [id, meta] of this.metadata.entries()) {
        metadataObj[id] = meta
      }
      
      await fs.writeFile(metadataFile, JSON.stringify(metadataObj, null, 2))
      logger.info(`Saved metadata for ${this.metadata.size} graphs`)
    } catch (error) {
      logger.error('Error saving graph metadata:', error)
      throw error
    }
  }

  /**
   * Check if a file exists
   * @param filePath Path to the file
   * @returns True if the file exists, false otherwise
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Save a graph to storage
   * @param id ID of the graph
   * @param graph Graph to save
   * @param metadata Optional metadata for the graph
   * @returns True if saved successfully
   */
  public async saveGraph(
    id: string,
    graph: KnowledgeGraph,
    metadata: {
      repository?: string
    } = {}
  ): Promise<boolean> {
    try {
      // Save to memory
      this.graphs.set(id, graph)
      
      // Update metadata
      const now = new Date()
      const existing = this.metadata.get(id)
      
      this.metadata.set(id, {
        created: existing?.created || now,
        updated: now,
        repository: metadata.repository || existing?.repository,
        size: {
          nodes: graph.nodes.length,
          edges: graph.edges.length
        }
      })
      
      // Save to disk
      const graphDir = path.join(this.baseDir, id)
      await fs.mkdir(graphDir, { recursive: true })
      
      // Split the graph into chunks for better performance with large graphs
      await this.saveGraphChunks(id, graph)
      
      // Save metadata
      await this.saveMetadata()
      
      logger.info(`Saved graph ${id} with ${graph.nodes.length} nodes and ${graph.edges.length} edges`)
      return true
    } catch (error) {
      logger.error(`Error saving graph ${id}:`, error)
      throw error
    }
  }

  /**
   * Save a graph in chunks to improve performance with large graphs
   * @param id ID of the graph
   * @param graph Graph to save
   */
  private async saveGraphChunks(id: string, graph: KnowledgeGraph): Promise<void> {
    const graphDir = path.join(this.baseDir, id)
    
    // Save graph info
    const infoFile = path.join(graphDir, 'info.json')
    await fs.writeFile(infoFile, JSON.stringify({
      id,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length
    }, null, 2))
    
    // Save nodes in chunks of 5000
    const nodeChunks: GraphNode[][] = []
    for (let i = 0; i < graph.nodes.length; i += 5000) {
      nodeChunks.push(graph.nodes.slice(i, i + 5000))
    }
    
    for (let i = 0; i < nodeChunks.length; i++) {
      const nodeFile = path.join(graphDir, `nodes_${i}.json`)
      await fs.writeFile(nodeFile, JSON.stringify(nodeChunks[i], null, 2))
    }
    
    // Save edges in chunks of 10000
    const edgeChunks: GraphEdge[][] = []
    for (let i = 0; i < graph.edges.length; i += 10000) {
      edgeChunks.push(graph.edges.slice(i, i + 10000))
    }
    
    for (let i = 0; i < edgeChunks.length; i++) {
      const edgeFile = path.join(graphDir, `edges_${i}.json`)
      await fs.writeFile(edgeFile, JSON.stringify(edgeChunks[i], null, 2))
    }
    
    // Save chunk info
    const chunksFile = path.join(graphDir, 'chunks.json')
    await fs.writeFile(chunksFile, JSON.stringify({
      nodeChunks: nodeChunks.length,
      edgeChunks: edgeChunks.length
    }, null, 2))
  }

  /**
   * Get a graph from storage
   * @param id ID of the graph to get
   * @returns The graph or null if not found
   */
  public async getGraph(id: string): Promise<KnowledgeGraph | null> {
    try {
      // Check memory cache first
      if (this.graphs.has(id)) {
        return this.graphs.get(id)!
      }
      
      // Check if graph exists on disk
      const graphDir = path.join(this.baseDir, id)
      const exists = await this.fileExists(graphDir)
      
      if (!exists) {
        logger.warn(`Graph ${id} not found in storage`)
        return null
      }
      
      // Load graph from chunks
      const graph = await this.loadGraphChunks(id)
      
      // Cache in memory
      this.graphs.set(id, graph)
      
      logger.info(`Loaded graph ${id} with ${graph.nodes.length} nodes and ${graph.edges.length} edges`)
      return graph
    } catch (error) {
      logger.error(`Error getting graph ${id}:`, error)
      throw error
    }
  }

  /**
   * Load a graph from chunks
   * @param id ID of the graph to load
   * @returns The loaded graph
   */
  private async loadGraphChunks(id: string): Promise<KnowledgeGraph> {
    const graphDir = path.join(this.baseDir, id)
    
    // Load chunk info
    const chunksFile = path.join(graphDir, 'chunks.json')
    const chunksExists = await this.fileExists(chunksFile)
    
    if (!chunksExists) {
      // Old format or single file
      const graphFile = path.join(graphDir, 'graph.json')
      const exists = await this.fileExists(graphFile)
      
      if (exists) {
        const data = await fs.readFile(graphFile, 'utf-8')
        return JSON.parse(data)
      }
      
      throw new Error(`Graph ${id} not found or invalid format`)
    }
    
    const chunksData = await fs.readFile(chunksFile, 'utf-8')
    const chunks = JSON.parse(chunksData)
    
    // Load nodes
    let nodes: GraphNode[] = []
    for (let i = 0; i < chunks.nodeChunks; i++) {
      const nodeFile = path.join(graphDir, `nodes_${i}.json`)
      const nodeData = await fs.readFile(nodeFile, 'utf-8')
      const nodeChunk = JSON.parse(nodeData)
      nodes = nodes.concat(nodeChunk)
    }
    
    // Load edges
    let edges: GraphEdge[] = []
    for (let i = 0; i < chunks.edgeChunks; i++) {
      const edgeFile = path.join(graphDir, `edges_${i}.json`)
      const edgeData = await fs.readFile(edgeFile, 'utf-8')
      const edgeChunk = JSON.parse(edgeData)
      edges = edges.concat(edgeChunk)
    }
    
    return { nodes, edges }
  }

  /**
   * Delete a graph from storage
   * @param id ID of the graph to delete
   * @returns True if deleted successfully
   */
  public async deleteGraph(id: string): Promise<boolean> {
    try {
      // Remove from memory
      this.graphs.delete(id)
      this.metadata.delete(id)
      
      // Remove from disk
      const graphDir = path.join(this.baseDir, id)
      const exists = await this.fileExists(graphDir)
      
      if (exists) {
        await fs.rm(graphDir, { recursive: true, force: true })
      }
      
      // Save updated metadata
      await this.saveMetadata()
      
      logger.info(`Deleted graph ${id}`)
      return true
    } catch (error) {
      logger.error(`Error deleting graph ${id}:`, error)
      throw error
    }
  }

  /**
   * List all available graphs
   * @returns List of graph IDs and metadata
   */
  public async listGraphs(): Promise<Array<{
    id: string
    created: Date
    updated: Date
    repository?: string
    size: {
      nodes: number
      edges: number
    }
  }>> {
    try {
      return Array.from(this.metadata.entries()).map(([id, meta]) => ({
        id,
        ...meta
      }))
    } catch (error) {
      logger.error('Error listing graphs:', error)
      throw error
    }
  }

  /**
   * Get metadata for a specific graph
   * @param id ID of the graph to get metadata for
   * @returns Graph metadata or null if not found
   */
  public async getGraphMetadata(id: string): Promise<{
    created: Date
    updated: Date
    repository?: string
    size: {
      nodes: number
      edges: number
    }
  } | null> {
    return this.metadata.get(id) || null
  }

  /**
   * Update metadata for a specific graph
   * @param id ID of the graph to update metadata for
   * @param metadata Metadata to update
   * @returns True if updated successfully
   */
  public async updateGraphMetadata(
    id: string,
    metadata: {
      repository?: string
    }
  ): Promise<boolean> {
    try {
      const existing = this.metadata.get(id)
      
      if (!existing) {
        logger.warn(`Graph ${id} not found, cannot update metadata`)
        return false
      }
      
      this.metadata.set(id, {
        ...existing,
        updated: new Date(),
        repository: metadata.repository || existing.repository
      })
      
      await this.saveMetadata()
      
      logger.info(`Updated metadata for graph ${id}`)
      return true
    } catch (error) {
      logger.error(`Error updating metadata for graph ${id}:`, error)
      throw error
    }
  }

  /**
   * Get a slice of a graph (limited nodes and edges)
   * @param id ID of the graph to slice
   * @param options Slice options
   * @returns Sliced graph or null if not found
   */
  public async getGraphSlice(
    id: string,
    options: {
      nodeLimit?: number
      edgeLimit?: number
      nodeTypes?: string[]
      edgeTypes?: string[]
    } = {}
  ): Promise<KnowledgeGraph | null> {
    try {
      const graph = await this.getGraph(id)
      
      if (!graph) {
        return null
      }
      
      // Default limits
      const nodeLimit = options.nodeLimit || 1000
      const edgeLimit = options.edgeLimit || 2000
      
      // Filter nodes by type if specified
      let nodes = options.nodeTypes && options.nodeTypes.length > 0
        ? graph.nodes.filter(node => options.nodeTypes!.includes(node.type))
        : graph.nodes
      
      // Limit nodes
      nodes = nodes.slice(0, nodeLimit)
      
      // Get node IDs for edge filtering
      const nodeIds = new Set(nodes.map(node => node.id))
      
      // Filter edges
      let edges = graph.edges.filter(edge => 
        nodeIds.has(edge.from) && nodeIds.has(edge.to)
      )
      
      // Filter edges by type if specified
      if (options.edgeTypes && options.edgeTypes.length > 0) {
        edges = edges.filter(edge => options.edgeTypes!.includes(edge.type))
      }
      
      // Limit edges
      edges = edges.slice(0, edgeLimit)
      
      return {
        nodes,
        edges
      }
    } catch (error) {
      logger.error(`Error getting graph slice for ${id}:`, error)
      throw error
    }
  }
}

// For type augmentation
type GraphNode = any
type GraphEdge = any