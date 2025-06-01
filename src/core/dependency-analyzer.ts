import { logger } from '../utils/logger.js'
import { GraphStorage } from './graph-storage.js'
import { nodeLookup } from './node-lookup.js'
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  CircularDependency,
} from '../types/index.js'

export interface DependencyResult {
  nodeName: string
  nodeType: string
  incoming: Array<{
    id: string
    name: string
    type: string
    relationship: string
    distance: number
  }>
  outgoing: Array<{
    id: string
    name: string
    type: string
    relationship: string
    distance: number
  }>
  directDependencies: number
  transitiveDependencies: number
  maxDepth: number
  criticalPath?: string[]
}

export class DependencyAnalyzer {
  private storage: GraphStorage

  constructor() {
    this.storage = new GraphStorage()
  }

  /**
   * Find dependencies for a node in the graph - now with fast O(1) lookups
   * @param graphId The ID of the graph to search in
   * @param nodeQuery The query to find the node (ID, name, etc.)
   * @param direction Direction of dependencies to analyze ('incoming', 'outgoing', 'both')
   * @returns Analysis of dependencies
   */
  public async findDependencies(
    graphId: string,
    nodeQuery: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<{
    nodeInfo: GraphNode | null
    incoming: Array<{
      id: string
      name: string
      type: string
      relationship: string
      distance: number
    }>
    outgoing: Array<{
      id: string
      name: string
      type: string
      relationship: string
      distance: number
    }>
    directDependencies: number
    transitiveDependencies: number
  }> {
    try {
      // Fast node lookup using the new system
      const node = await nodeLookup.findNode(graphId, nodeQuery)

      if (!node) {
        logger.warn(`Node not found for dependency analysis: ${nodeQuery}`)
        return {
          nodeInfo: null,
          incoming: [],
          outgoing: [],
          directDependencies: 0,
          transitiveDependencies: 0,
        }
      }

      logger.info(
        `Found node for dependency analysis: ${nodeQuery} -> ${node.name} (${node.type})`
      )

      // Get the raw graph for edge analysis
      const graph = await this.storage.getGraph(graphId)
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`)
      }

      // Use the resolved node ID for collecting edges
      const resolvedNodeId = node.id

      // Collect edges - this is still O(n) but only for edges, not nodes
      const incomingEdges =
        direction === 'both' || direction === 'incoming'
          ? graph.edges.filter(e => e.to === resolvedNodeId)
          : []

      const outgoingEdges =
        direction === 'both' || direction === 'outgoing'
          ? graph.edges.filter(e => e.from === resolvedNodeId)
          : []

      // Build dependency info with fast node lookups
      const incoming = await Promise.all(
        incomingEdges.map(async edge => {
          // Try to find the source node using the indexed lookup
          const sourceNode = await nodeLookup.getNode(graphId, edge.from)
          return {
            id: edge.from,
            name:
              sourceNode?.name || edge.from.split(/[_\/\\]/).pop() || 'Unknown',
            type: sourceNode?.type || 'Unknown',
            relationship: edge.type,
            distance: 1,
          }
        })
      )

      const outgoing = await Promise.all(
        outgoingEdges.map(async edge => {
          const targetNode = await nodeLookup.getNode(graphId, edge.to)
          return {
            id: edge.to,
            name:
              targetNode?.name || edge.to.split(/[_\/\\]/).pop() || 'Unknown',
            type: targetNode?.type || 'Unknown',
            relationship: edge.type,
            distance: 1,
          }
        })
      )

      return {
        nodeInfo: node,
        incoming,
        outgoing,
        directDependencies: incoming.length + outgoing.length,
        transitiveDependencies: 0, // We'll implement this in a future update
      }
    } catch (error) {
      logger.error('Dependency analysis failed:', error)
      throw error
    }
  }

  /**
   * Analyzes a graph for circular dependencies
   * @param graph_id The ID of the graph to analyze
   * @param maxCycles Maximum number of cycles to find
   * @returns List of circular dependency chains
   */
  async findCircularDependencies(
    graphId: string,
    maxCycles: number = 10
  ): Promise<{
    cycles: CircularDependency[]
    totalCycles: number
    byCriticality: {
      high: number
      medium: number
      low: number
    }
  }> {
    try {
      const graph = await this.storage.getGraph(graphId)
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`)
      }

      logger.info(`Analyzing circular dependencies in graph ${graphId}`)
      const cycles = await this.findCircularDependenciesInGraph(graph, maxCycles)

      // Count by criticality
      const byCriticality = {
        high: cycles.filter(c => c.severity === 'high').length,
        medium: cycles.filter(c => c.severity === 'medium').length,
        low: cycles.filter(c => c.severity === 'low').length,
      }

      return {
        cycles,
        totalCycles: cycles.length,
        byCriticality,
      }
    } catch (error) {
      logger.error(`Error finding circular dependencies: ${error}`)
      throw error
    }
  }

  /**
   * Implementation of circular dependency detection algorithm
   */
  private async findCircularDependenciesInGraph(
    graph: KnowledgeGraph,
    maxCycles: number = 10
  ): Promise<CircularDependency[]> {
    const cycles: CircularDependency[] = []
    const visitedPaths = new Set<string>()

    // DFS to find cycles
    const dfs = (nodeId: string, path: GraphNode[] = [], visited = new Set<string>()) => {
      if (cycles.length >= maxCycles) return

      // Stop if we've already visited this node in the current path (cycle found)
      if (visited.has(nodeId)) {
        // Extract the cycle part of the path
        const cycleStartIndex = path.findIndex(node => node.id === nodeId)
        if (cycleStartIndex >= 0) {
          const cyclePath = path.slice(cycleStartIndex)
          const cycleKey = cyclePath.map(n => n.id).join('->')

          // Skip if we've already recorded this cycle
          if (!visitedPaths.has(cycleKey)) {
            visitedPaths.add(cycleKey)

            // Create a new cycle entry
            const cycle: CircularDependency = {
              path: cyclePath,
              severity: this.calculateCycleSeverity(cyclePath),
              cycleLength: cyclePath.length,
              involvedTypes: Array.from(new Set(cyclePath.map(n => n.type))),
            }

            cycles.push(cycle)
          }
        }
        return
      }

      // Find the node object
      const node = graph.nodes.find(n => n.id === nodeId)
      if (!node) return

      // Mark as visited for this path
      visited.add(nodeId)
      path.push(node)

      // Explore outgoing edges
      const outgoingEdges = graph.edges.filter(e => e.from === nodeId)
      for (const edge of outgoingEdges) {
        dfs(edge.to, [...path], new Set(visited))
      }
    }

    // Start DFS from each node to find all cycles
    for (const node of graph.nodes) {
      if (cycles.length >= maxCycles) break
      dfs(node.id)
    }

    return cycles
  }

  /**
   * Full dependency analysis with metrics
   */
  async analyzeDependencies(
    graphId: string,
    nodeId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<DependencyResult> {
    const graph = await this.storage.getGraph(graphId)
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`)
    }

    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`)
    }

    // Get direct dependencies
    const deps = await this.findDependencies(graphId, nodeId, direction)
    
    // Calculate max depth and critical path
    const maxDepth = await this.calculateMaxDepth(graph, nodeId)
    const criticalPath = await this.findCriticalPath(graph, nodeId)

    return {
      nodeName: node.name,
      nodeType: node.type,
      incoming: deps.incoming,
      outgoing: deps.outgoing,
      directDependencies: deps.directDependencies,
      transitiveDependencies: deps.transitiveDependencies,
      maxDepth,
      criticalPath,
    }
  }

  /**
   * Find a dependency chain between two nodes
   */
  async findDependencyChain(
    graphId: string,
    fromNodeId: string,
    toNodeId: string
  ): Promise<{ path: GraphNode[]; edges: GraphEdge[] } | null> {
    const graph = await this.storage.getGraph(graphId)
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`)
    }

    // BFS to find shortest path
    const queue: Array<{
      nodeId: string
      path: string[]
      edgePath: GraphEdge[]
    }> = [
      {
        nodeId: fromNodeId,
        path: [fromNodeId],
        edgePath: [],
      },
    ]

    const visited = new Set<string>()
    visited.add(fromNodeId)

    while (queue.length > 0) {
      const { nodeId, path, edgePath } = queue.shift()!

      if (nodeId === toNodeId) {
        // Found the path
        const nodePath = path.map(
          id => graph.nodes.find(n => n.id === id)!
        )
        return { path: nodePath, edges: edgePath }
      }

      // Explore neighbors
      const outgoingEdges = graph.edges.filter(e => e.from === nodeId)
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to)
          queue.push({
            nodeId: edge.to,
            path: [...path, edge.to],
            edgePath: [...edgePath, edge],
          })
        }
      }
    }

    return null // No path found
  }

  /**
   * Find the critical path (longest dependency chain)
   */
  private async findCriticalPath(
    graph: KnowledgeGraph,
    nodeId: string
  ): Promise<string[]> {
    let longestPath: string[] = []
    let maxLength = 0

    // DFS to find longest path
    const dfs = (currentId: string, path: string[]): string[] => {
      const outgoingEdges = graph.edges.filter(e => e.from === currentId)
      
      if (outgoingEdges.length === 0) {
        // Leaf node
        if (path.length > maxLength) {
          maxLength = path.length
          longestPath = [...path]
        }
        return path
      }

      let longestSubpath: string[] = []
      
      for (const edge of outgoingEdges) {
        // Skip if would create a cycle
        if (path.includes(edge.to)) continue
        
        const subpath = dfs(edge.to, [...path, edge.to])
        if (subpath.length > longestSubpath.length) {
          longestSubpath = subpath
        }
      }
      
      return longestSubpath
    }

    dfs(nodeId, [nodeId])
    
    // Convert IDs to names for readability
    return longestPath.map(id => {
      const node = graph.nodes.find(n => n.id === id)
      return node ? node.name : id
    })
  }

  /**
   * Calculate severity of a circular dependency
   */
  private calculateCycleSeverity(
    cyclePath: GraphNode[]
  ): 'low' | 'medium' | 'high' {
    // More complex cycles (longer) are usually more problematic
    if (cyclePath.length > 4) {
      return 'high'
    }
    
    // Cycles involving multiple file types are more serious
    const involvedTypes = new Set(cyclePath.map(node => node.type))
    if (involvedTypes.size > 2) {
      return 'high'
    }
    
    // Cycles with Files or Classes are more serious than just functions
    if (
      cyclePath.some(node => 
        node.type === 'File' || 
        node.type === 'Class' ||
        node.type === 'Interface'
      )
    ) {
      return 'medium'
    }
    
    return 'low'
  }

  /**
   * Calculate maximum dependency depth
   */
  private async calculateMaxDepth(
    graph: KnowledgeGraph,
    startNodeId: string
  ): Promise<number> {
    let maxDepth = 0
    const visited = new Set<string>()
    
    const dfs = (nodeId: string, depth: number): number => {
      if (visited.has(nodeId)) return depth
      
      visited.add(nodeId)
      let localMaxDepth = depth
      
      // Get outgoing edges
      const outgoingEdges = graph.edges.filter(e => e.from === nodeId)
      
      for (const edge of outgoingEdges) {
        const childDepth = dfs(edge.to, depth + 1)
        localMaxDepth = Math.max(localMaxDepth, childDepth)
      }
      
      return localMaxDepth
    }
    
    maxDepth = dfs(startNodeId, 0)
    return maxDepth
  }
}