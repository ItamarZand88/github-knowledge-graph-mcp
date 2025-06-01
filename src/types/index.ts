// Graph structure types
export interface GraphNode {
  id: string
  type:
    | 'File'
    | 'Class'
    | 'Function'
    | 'Method'
    | 'Interface'
    | 'Variable'
    | 'Import'
    | 'TypeAlias'
    | 'Enum'
  name: string
  file: string
  location?: {
    line: number
    column: number
  }
  metadata?: NodeMetadata
}

export interface NodeMetadata {
  isExported?: boolean
  isAsync?: boolean
  isStatic?: boolean
  isAbstract?: boolean
  visibility?: 'public' | 'private' | 'protected'
  parameters?: string[]
  returnType?: string
  documentation?: string
  decorators?: string[]
  [key: string]: any
}

export interface GraphEdge {
  from: string
  to: string
  type:
    | 'DEFINED_IN'
    | 'IMPORTS'
    | 'CALLS'
    | 'EXTENDS'
    | 'IMPLEMENTS'
    | 'USES'
    | 'REFERENCES'
  metadata?: {
    line?: number
    context?: string
    strength?: number
    [key: string]: any
  }
}

export interface KnowledgeGraph {
  metadata: {
    repository: string
    generatedAt: string
    nodeCount: number
    edgeCount: number
    fileCount: number
    analysisTime: number
    version: string
    branch?: string
  }
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AnalysisOptions {
  repository: string
  branch?: string
  includeTests?: boolean
  includePrivate?: boolean
  excludePatterns?: string[]
  includePatterns?: string[]
  cleanup?: boolean
  verbose?: boolean
  outputPath?: string
}

// Helper type aliases for compatibility
export type NodeType = GraphNode['type']
export type EdgeType = GraphEdge['type']
export type GraphMetadata = KnowledgeGraph['metadata']

// MCP-specific types
export interface MCPAnalysisOptions {
  repository: string
  branch?: string
  includeTests?: boolean
  includePrivate?: boolean
  excludePatterns?: string[]
  includePatterns?: string[]
}

export interface GraphExplorationOptions {
  depth?: number
  relationTypes?: string[]
  includeMetadata?: boolean
}

export interface SearchFilters {
  nodeTypes?: string[]
  filePatterns?: string[]
  excludeTypes?: string[]
  minConnections?: number
  maxConnections?: number
}

export interface DependencyAnalysisOptions {
  direction?: 'incoming' | 'outgoing' | 'both'
  maxDepth?: number
  includeTransitive?: boolean
  groupByType?: boolean
}

export interface GraphStatistics {
  nodeCount: number
  edgeCount: number
  fileCount: number
  analysisTime: number
  nodeTypes: Record<string, number>
  edgeTypes: Record<string, number>
  averageDegree: number
  maxDegree: number
  density: number
  connectedComponents: number
  diameter?: number
  clustering?: number
}

// Circular dependency structure
export interface CircularDependency {
  path: GraphNode[]
  severity: 'low' | 'medium' | 'high'
  cycleLength: number
  involvedTypes: string[]
}

// Error types
export class GraphNotFoundError extends Error {
  constructor(graphId: string) {
    super(`Graph not found: ${graphId}`)
    this.name = 'GraphNotFoundError'
  }
}

export class NodeNotFoundError extends Error {
  constructor(nodeId: string) {
    super(`Node not found: ${nodeId}`)
    this.name = 'NodeNotFoundError'
  }
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(`Analysis failed: ${message}`)
    this.name = 'AnalysisError'
  }
}