/**
 * Core type definitions for the GitHub Knowledge Graph MCP Server
 */

/**
 * Represents a node in the knowledge graph
 */
export interface GraphNode {
  id: string;
  type:
    | "File"
    | "Class"
    | "Function"
    | "Method"
    | "Interface"
    | "Variable"
    | "Import"
    | "TypeAlias"
    | "Enum";
  name: string;
  file?: string;
  location?: {
    line: number;
    column: number;
  };
  metadata?: NodeMetadata;
}

/**
 * Node metadata information
 */
export interface NodeMetadata {
  isExported?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  isAbstract?: boolean;
  visibility?: "public" | "private" | "protected";
  parameters?: string[];
  returnType?: string;
  documentation?: string;
  decorators?: string[];
  [key: string]: any;
}

/**
 * Represents an edge (relationship) in the knowledge graph
 */
export interface GraphEdge {
  from: string;
  to: string;
  type:
    | "DEFINED_IN"
    | "IMPORTS"
    | "CALLS"
    | "EXTENDS"
    | "IMPLEMENTS"
    | "USES"
    | "REFERENCES";
  metadata?: {
    line?: number;
    context?: string;
    strength?: number;
    [key: string]: any;
  };
}

/**
 * Represents a complete knowledge graph
 */
export interface KnowledgeGraph {
  metadata: {
    repository: string;
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    analysisTime: number;
    version: string;
    branch?: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Result of graph exploration
 */
export interface ExplorationResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId: string | null;
  exploredDepth: number;
  truncated: boolean;
  totalNodesCount: number;
}

/**
 * A circular dependency found in the graph
 */
export interface CircularDependency {
  path: GraphNode[];
  severity: "low" | "medium" | "high";
  cycleLength: number;
  involvedTypes: string[];
}

/**
 * Configuration for the MCP server
 */
export interface MCPServerConfig {
  port: number;
  host: string;
  dataDir: string;
  maxConcurrentJobs: number;
  jobTimeout: number;
  allowOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  auth?: {
    enabled: boolean;
    apiKeyHeader: string;
    apiKeys: string[];
  };
}

/**
 * Analysis job status
 */
export interface AnalysisJobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  repository: string;
  branch: string;
}

/**
 * Analysis job result
 */
export interface AnalysisResult {
  jobId: string;
  repository: string;
  graphId: string;
  stats: {
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    nodeTypes: Record<string, number>;
    edgeTypes: Record<string, number>;
  };
}

/**
 * MCP Handler request context
 */
export interface MCPHandlerContext {
  graphId?: string;
  params: Record<string, any>;
}

/**
 * MCP Handler response
 */
export interface MCPHandlerResponse {
  result: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * MCP Function definition
 */
export interface MCPFunction {
  name: string;
  description: string;
  parameters: {
    properties: Record<
      string,
      {
        type: string;
        description: string;
        [key: string]: any;
      }
    >;
    required: string[];
    [key: string]: any;
  };
}

/**
 * GitHub repository analysis options
 */
export interface RepositoryAnalysisOptions {
  repository: string;
  branch?: string;
  excludePatterns?: string[];
  includeTests?: boolean;
  includePrivate?: boolean;
}

/**
 * Graph exploration options
 */
export interface GraphExplorationOptions {
  depth?: number;
  relationTypes?: string[];
  direction?: "outgoing" | "incoming" | "both";
  excludeTypes?: string[];
  includeEdges?: boolean;
  includeMetadata?: boolean;
}

/**
 * Node search options
 */
export interface NodeSearchOptions {
  limit?: number;
  nodeTypes?: string[];
  includeEdges?: boolean;
  exactMatch?: boolean;
}

/**
 * Graph slice options
 */
export interface GraphSliceOptions {
  nodeLimit?: number;
  edgeLimit?: number;
  nodeTypes?: string[];
  edgeTypes?: string[];
}

/**
 * Dependency analysis options
 */
export interface DependencyAnalysisOptions {
  direction?: "incoming" | "outgoing" | "both";
  maxDepth?: number;
  includeTransitive?: boolean;
  groupByType?: boolean;
}

/**
 * Path finding options
 */
export interface PathFindingOptions {
  maxDepth?: number;
  relationTypes?: string[];
}

/**
 * Circular dependency analysis options
 */
export interface CircularDependencyOptions {
  maxCycles?: number;
  minSeverity?: "low" | "medium" | "high";
  minCycleLength?: number;
  includeWeakReferences?: boolean;
  groupBySeverity?: boolean;
}

/**
 * Search filters for node queries
 */
export interface SearchFilters {
  nodeTypes?: string[];
  excludeTypes?: string[];
  filePatterns?: string[];
  metadataFilters?: Record<string, any>;
  relationTypes?: string[];
  connectedToNode?: string;
  minConnections?: number;
  maxConnections?: number;
}

/**
 * Helper type aliases for compatibility
 */
export type NodeType = GraphNode["type"];
export type EdgeType = GraphEdge["type"];
export type GraphMetadata = KnowledgeGraph["metadata"];
