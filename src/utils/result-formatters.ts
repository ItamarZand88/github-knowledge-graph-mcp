/**
 * Utility functions for formatting analysis results for different output formats
 */
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  ExplorationResult,
  CircularDependency,
} from "../types/index.js";
import { DependencyResult } from "../core/dependency-analyzer.js";

/**
 * Format exploration result for JSON output
 * @param result Exploration result to format
 * @returns Formatted result for JSON output
 */
export function formatExplorationResult(result: ExplorationResult): {
  rootNode: string | null;
  nodeCount: number;
  edgeCount: number;
  truncated: boolean;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    file?: string;
    description?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
  }>;
  metadata: {
    exploredDepth: number;
    totalGraphSize: number;
  };
} {
  // Format the nodes with only essential information
  const formattedNodes = result.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    file: node.file,
    description: node.metadata?.documentation,
  }));

  // Format the edges
  const formattedEdges = result.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
  }));

  return {
    rootNode: result.rootId,
    nodeCount: result.nodes.length,
    edgeCount: result.edges.length,
    truncated: result.truncated,
    nodes: formattedNodes,
    edges: formattedEdges,
    metadata: {
      exploredDepth: result.exploredDepth,
      totalGraphSize: result.totalNodesCount,
    },
  };
}

/**
 * Format dependency analysis result for JSON output
 * @param result Dependency analysis result to format
 * @returns Formatted result for JSON output
 */
export function formatDependencyResult(result: DependencyResult): {
  node: {
    name: string;
    type: string;
  };
  dependencies: {
    incoming: Array<{
      name: string;
      type: string;
      relationship: string;
    }>;
    outgoing: Array<{
      name: string;
      type: string;
      relationship: string;
    }>;
  };
  stats: {
    directDependencies: number;
    transitiveDependencies: number;
    maxDepth: number;
  };
  criticalPath?: string[];
} {
  // Format incoming dependencies
  const incoming = result.incoming.map((dep) => ({
    name: dep.name,
    type: dep.type,
    relationship: dep.relationship,
  }));

  // Format outgoing dependencies
  const outgoing = result.outgoing.map((dep) => ({
    name: dep.name,
    type: dep.type,
    relationship: dep.relationship,
  }));

  return {
    node: {
      name: result.nodeName,
      type: result.nodeType,
    },
    dependencies: {
      incoming,
      outgoing,
    },
    stats: {
      directDependencies: result.directDependencies,
      transitiveDependencies: result.transitiveDependencies,
      maxDepth: result.maxDepth,
    },
    criticalPath: result.criticalPath,
  };
}

/**
 * Format circular dependencies for JSON output
 * @param cycles Circular dependencies to format
 * @returns Formatted result for JSON output
 */
export function formatCircularDependencies(result: {
  cycles: CircularDependency[];
  totalCycles: number;
  byCriticality: {
    high: number;
    medium: number;
    low: number;
  };
}): {
  summary: {
    totalCycles: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
  cycles: Array<{
    path: string[];
    severity: string;
    length: number;
    involvedTypes: string[];
  }>;
} {
  // Format cycles
  const formattedCycles = result.cycles.map((cycle) => ({
    path: cycle.path.map((node) => node.name),
    severity: cycle.severity,
    length: cycle.cycleLength,
    involvedTypes: cycle.involvedTypes,
  }));

  return {
    summary: {
      totalCycles: result.totalCycles,
      highSeverity: result.byCriticality.high,
      mediumSeverity: result.byCriticality.medium,
      lowSeverity: result.byCriticality.low,
    },
    cycles: formattedCycles,
  };
}

/**
 * Format graph statistics for JSON output
 * @param stats Graph statistics to format
 * @returns Formatted result for JSON output
 */
export function formatGraphStatistics(stats: {
  totalNodes: number;
  totalEdges: number;
  nodeTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  avgConnections: number;
  mostConnectedNodes: Array<{
    id: string;
    name: string;
    type: string;
    connections: number;
  }>;
}): {
  summary: {
    totalNodes: number;
    totalEdges: number;
    averageConnections: number;
    nodeTypesCount: number;
    edgeTypesCount: number;
  };
  nodeTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  edgeTypes: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  mostConnectedNodes: Array<{
    name: string;
    type: string;
    connections: number;
  }>;
} {
  // Format node types
  const formattedNodeTypes = Object.entries(stats.nodeTypes)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / stats.totalNodes) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Format edge types
  const formattedEdgeTypes = Object.entries(stats.edgeTypes)
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / stats.totalEdges) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Format most connected nodes
  const formattedMostConnectedNodes = stats.mostConnectedNodes.map((node) => ({
    name: node.name,
    type: node.type,
    connections: node.connections,
  }));

  return {
    summary: {
      totalNodes: stats.totalNodes,
      totalEdges: stats.totalEdges,
      averageConnections: Math.round(stats.avgConnections * 10) / 10,
      nodeTypesCount: Object.keys(stats.nodeTypes).length,
      edgeTypesCount: Object.keys(stats.edgeTypes).length,
    },
    nodeTypes: formattedNodeTypes,
    edgeTypes: formattedEdgeTypes,
    mostConnectedNodes: formattedMostConnectedNodes,
  };
}

/**
 * Format node details for JSON output
 * @param details Node details to format
 * @returns Formatted result for JSON output
 */
export function formatNodeDetails(details: {
  node: GraphNode | null;
  incomingEdges: Array<{
    edge: GraphEdge;
    fromNode: GraphNode;
  }>;
  outgoingEdges: Array<{
    edge: GraphEdge;
    toNode: GraphNode;
  }>;
  siblings: GraphNode[];
  file?: {
    path: string;
    nodes: GraphNode[];
  };
}): {
  node: {
    id: string;
    name: string;
    type: string;
    file?: string;
    description?: string;
    metadata?: Record<string, any>;
  } | null;
  relationships: {
    incoming: Array<{
      name: string;
      type: string;
      relationship: string;
    }>;
    outgoing: Array<{
      name: string;
      type: string;
      relationship: string;
    }>;
  };
  context: {
    siblings: Array<{
      name: string;
      type: string;
    }>;
    file?: {
      path: string;
      nodes: Array<{
        name: string;
        type: string;
      }>;
    };
  };
} {
  // Format node
  const formattedNode = details.node
    ? {
        id: details.node.id,
        name: details.node.name,
        type: details.node.type,
        file: details.node.file,
        description: details.node.metadata?.documentation,
        metadata: details.node.metadata,
      }
    : null;

  // Format incoming relationships
  const incoming = details.incomingEdges.map(({ edge, fromNode }) => ({
    name: fromNode.name,
    type: fromNode.type,
    relationship: edge.type,
  }));

  // Format outgoing relationships
  const outgoing = details.outgoingEdges.map(({ edge, toNode }) => ({
    name: toNode.name,
    type: toNode.type,
    relationship: edge.type,
  }));

  // Format siblings
  const siblings = details.siblings.map((node) => ({
    name: node.name,
    type: node.type,
  }));

  // Format file nodes
  const file = details.file
    ? {
        path: details.file.path,
        nodes: details.file.nodes.map((node) => ({
          name: node.name,
          type: node.type,
        })),
      }
    : undefined;

  return {
    node: formattedNode,
    relationships: {
      incoming,
      outgoing,
    },
    context: {
      siblings,
      file,
    },
  };
}

/**
 * Format path between nodes for JSON output
 * @param pathResult Path result to format
 * @returns Formatted result for JSON output
 */
export function formatPathResult(pathResult: {
  path: GraphNode[];
  edges: GraphEdge[];
  length: number;
  found: boolean;
}): {
  found: boolean;
  pathLength: number;
  nodes: Array<{
    name: string;
    type: string;
  }>;
  connections: Array<{
    from: string;
    to: string;
    type: string;
  }>;
} {
  // Format nodes in the path
  const formattedNodes = pathResult.path.map((node) => ({
    name: node.name,
    type: node.type,
  }));

  // Format edges in the path
  const formattedConnections = pathResult.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
  }));

  return {
    found: pathResult.found,
    pathLength: pathResult.length,
    nodes: formattedNodes,
    connections: formattedConnections,
  };
}

/**
 * Format search results for JSON output
 * @param searchResult Search result to format
 * @returns Formatted result for JSON output
 */
export function formatSearchResult(searchResult: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
  truncated: boolean;
}): {
  totalMatches: number;
  returned: number;
  truncated: boolean;
  results: Array<{
    id: string;
    name: string;
    type: string;
    file?: string;
    description?: string;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
  }>;
} {
  // Format nodes
  const formattedNodes = searchResult.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    file: node.file,
    description: node.metadata?.documentation,
  }));

  // Format edges
  const formattedEdges = searchResult.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
  }));

  return {
    totalMatches: searchResult.total,
    returned: searchResult.nodes.length,
    truncated: searchResult.truncated,
    results: formattedNodes,
    relationships: formattedEdges,
  };
}

/**
 * Format knowledge graph for graph visualization libraries
 * @param graph Knowledge graph to format
 * @returns Formatted graph for visualization
 */
export function formatGraphForVisualization(graph: KnowledgeGraph): {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    group?: string;
    data?: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
  }>;
} {
  // Format nodes
  const formattedNodes = graph.nodes.map((node) => ({
    id: node.id,
    label: node.name,
    type: node.type,
    group: node.type, // Group by type for styling
    data: {
      file: node.file,
      description: node.metadata?.documentation,
      metadata: node.metadata,
    },
  }));

  // Format edges
  const formattedEdges = graph.edges.map((edge, index) => ({
    id: `e${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.type,
  }));

  return {
    nodes: formattedNodes,
    edges: formattedEdges,
  };
}

/**
 * Format node for API response
 * @param node Graph node to format
 * @returns Formatted node for API response
 */
export function formatNode(node: GraphNode): {
  id: string;
  name: string;
  type: string;
  file?: string;
  description?: string;
  metadata?: Record<string, any>;
} {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    file: node.file,
    description: node.metadata?.documentation,
    metadata: node.metadata,
  };
}

/**
 * Format edge for API response
 * @param edge Graph edge to format
 * @returns Formatted edge for API response
 */
export function formatEdge(edge: GraphEdge): {
  from: string;
  to: string;
  type: string;
} {
  return {
    from: edge.from,
    to: edge.to,
    type: edge.type,
  };
}
