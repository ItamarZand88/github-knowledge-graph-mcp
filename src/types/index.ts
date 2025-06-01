/**
 * Core type definitions for the GitHub Knowledge Graph MCP Server
 */

/**
 * Represents a node in the knowledge graph
 */
export interface GraphNode {
  id: string
  name: string
  type: string
  file?: string
  description?: string
  metadata?: Record<string, any>
}

/**
 * Represents an edge (relationship) in the knowledge graph
 */
export interface GraphEdge {
  from: string
  to: string
  type: string
  metadata?: Record<string, any>
}

/**
 * Represents a complete knowledge graph
 */
export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Result of graph exploration
 */
export interface ExplorationResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  rootId: string | null
  exploredDepth: number
  truncated: boolean
  totalNodesCount: number
}

/**
 * A circular dependency found in the graph
 */
export interface CircularDependency {
  path: GraphNode[]
  severity: 'low' | 'medium' | 'high'
  cycleLength: number
  involvedTypes: string[]
}

/**
 * Configuration for the MCP server
 */
export interface MCPServerConfig {
  port: number
  host: string
  dataDir: string
  maxConcurrentJobs: number
  jobTimeout: number
  allowOrigins: string[]
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  auth?: {
    enabled: boolean
    apiKeyHeader: string
    apiKeys: string[]
  }
}

/**
 * Analysis job status
 */
export interface AnalysisJobStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  startTime: Date
  endTime?: Date
  error?: string
  repository: string
  branch: string
}

/**
 * Analysis job result
 */
export interface AnalysisResult {
  jobId: string
  repository: string
  graphId: string
  stats: {
    totalFiles: number
    totalNodes: number
    totalEdges: number
    nodeTypes: Record<string, number>
    edgeTypes: Record<string, number>
  }
}

/**
 * MCP Handler request context
 */
export interface MCPHandlerContext {
  graphId?: string
  params: Record<string, any>
}

/**
 * MCP Handler response
 */
export interface MCPHandlerResponse {
  result: any
  error?: string
  metadata?: Record<string, any>
}

/**
 * MCP Function definition
 */
export interface MCPFunction {
  name: string
  description: string
  parameters: {
    properties: Record<string, {
      type: string
      description: string
      [key: string]: any
    }>
    required: string[]
    [key: string]: any
  }
}

/**
 * GitHub repository analysis options
 */
export interface RepositoryAnalysisOptions {
  repository: string
  branch?: string
  excludePatterns?: string[]
  includeTests?: boolean
  includePrivate?: boolean
}

/**
 * Graph exploration options
 */
export interface GraphExplorationOptions {
  depth: number
  maxNodes?: number
  relationTypes?: string[]
  direction?: 'outgoing' | 'incoming' | 'both'
  excludeTypes?: string[]
  includeEdges?: boolean
}

/**
 * Node search options
 */
export interface NodeSearchOptions {
  limit?: number
  nodeTypes?: string[]
  includeEdges?: boolean
  exactMatch?: boolean
}

/**
 * Graph slice options
 */
export interface GraphSliceOptions {
  nodeLimit?: number
  edgeLimit?: number
  nodeTypes?: string[]
  edgeTypes?: string[]
}

/**
 * Dependency analysis options
 */
export interface DependencyAnalysisOptions {
  direction?: 'incoming' | 'outgoing' | 'both'
  maxDepth?: number
  includeTransitive?: boolean
}

/**
 * Path finding options
 */
export interface PathFindingOptions {
  maxDepth?: number
  relationTypes?: string[]
}

/**
 * Circular dependency analysis options
 */
export interface CircularDependencyOptions {
  maxCycles?: number
  minSeverity?: 'low' | 'medium' | 'high'
}