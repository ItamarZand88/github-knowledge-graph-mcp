/**
 * Graph exploration service for knowledge graphs
 */
import { logger } from "../utils/logger.js";
import { GraphStorage } from "./graph-storage.js";
import { nodeLookup } from "./node-lookup.js";
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  ExplorationResult,
} from "../types/index.js";

export class GraphExplorer {
  private storage: GraphStorage;

  constructor() {
    this.storage = new GraphStorage();
  }

  /**
   * Explore a knowledge graph starting from a specific node
   * @param graphId The ID of the graph to explore
   * @param nodeQuery The starting node ID or query
   * @param options Exploration options
   * @returns Exploration result with nodes and edges
   */
  public async exploreGraph(
    graphId: string,
    nodeQuery: string,
    options: {
      depth: number;
      maxNodes?: number;
      relationTypes?: string[];
      direction?: "outgoing" | "incoming" | "both";
      excludeTypes?: string[];
      includeEdges?: boolean;
    } = { depth: 2 }
  ): Promise<ExplorationResult> {
    try {
      logger.info(
        `Exploring graph ${graphId} from node ${nodeQuery} with depth ${options.depth}`
      );

      // Set defaults
      const depth = options.depth || 2;
      const maxNodes = options.maxNodes || 100;
      const direction = options.direction || "both";
      const includeEdges = options.includeEdges !== false;

      // Find the starting node
      const startNode = await nodeLookup.findNode(graphId, nodeQuery);
      if (!startNode) {
        logger.warn(`Starting node not found: ${nodeQuery}`);
        return {
          nodes: [],
          edges: [],
          rootId: null,
          exploredDepth: 0,
          truncated: false,
          totalNodesCount: 0,
        };
      }

      // Get the graph
      const graph = await this.storage.getGraph(graphId);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`);
      }

      // BFS exploration
      const exploredNodes = new Set<string>([startNode.id]);
      const nodesToExplore: Array<{ nodeId: string; level: number }> = [
        { nodeId: startNode.id, level: 0 },
      ];
      const resultNodes: GraphNode[] = [startNode];
      const resultEdges: GraphEdge[] = [];
      let truncated = false;

      while (nodesToExplore.length > 0 && resultNodes.length < maxNodes) {
        const { nodeId, level } = nodesToExplore.shift()!;

        // Stop if we've reached the maximum depth
        if (level >= depth) {
          continue;
        }

        // Get edges based on direction
        let edges: GraphEdge[] = [];
        if (direction === "outgoing" || direction === "both") {
          edges = edges.concat(
            graph.edges.filter((edge) => edge.from === nodeId)
          );
        }
        if (direction === "incoming" || direction === "both") {
          edges = edges.concat(
            graph.edges.filter((edge) => edge.to === nodeId)
          );
        }

        // Filter by relation types if specified
        if (options.relationTypes && options.relationTypes.length > 0) {
          edges = edges.filter((edge) =>
            options.relationTypes!.includes(edge.type)
          );
        }

        // Process each edge
        for (const edge of edges) {
          // Get the ID of the connected node
          const connectedNodeId = edge.from === nodeId ? edge.to : edge.from;

          // Skip if already explored
          if (exploredNodes.has(connectedNodeId)) {
            // Include the edge if it's not already included
            if (
              includeEdges &&
              !resultEdges.some(
                (e) =>
                  e.from === edge.from &&
                  e.to === edge.to &&
                  e.type === edge.type
              )
            ) {
              resultEdges.push(edge);
            }
            continue;
          }

          // Find the connected node
          const connectedNode = await nodeLookup.getNode(
            graphId,
            connectedNodeId
          );
          if (!connectedNode) {
            logger.warn(`Connected node not found: ${connectedNodeId}`);
            continue;
          }

          // Skip excluded types
          if (
            options.excludeTypes &&
            options.excludeTypes.includes(connectedNode.type)
          ) {
            continue;
          }

          // Add the node and edge to results
          resultNodes.push(connectedNode);
          if (includeEdges) {
            resultEdges.push(edge);
          }
          exploredNodes.add(connectedNodeId);

          // Add to exploration queue
          nodesToExplore.push({
            nodeId: connectedNodeId,
            level: level + 1,
          });

          // Check if we've reached the maximum nodes
          if (resultNodes.length >= maxNodes) {
            truncated = true;
            break;
          }
        }
      }

      logger.info(
        `Exploration complete: Found ${resultNodes.length} nodes and ${resultEdges.length} edges`
      );

      return {
        nodes: resultNodes,
        edges: resultEdges,
        rootId: startNode.id,
        exploredDepth: depth,
        truncated,
        totalNodesCount: graph.nodes.length,
      };
    } catch (error) {
      logger.error(`Error exploring graph: ${error}`);
      throw error;
    }
  }

  /**
   * Search for nodes in the graph
   * @param graphId The ID of the graph to search
   * @param query Search query (node name, type, or description)
   * @param options Search options
   * @returns Array of matching nodes
   */
  public async searchNodes(
    graphId: string,
    query: string,
    options: {
      limit?: number;
      nodeTypes?: string[];
      includeEdges?: boolean;
      exactMatch?: boolean;
    } = {}
  ): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    total: number;
    truncated: boolean;
  }> {
    try {
      logger.info(
        `Searching for nodes in graph ${graphId} with query "${query}"`
      );

      // Set defaults
      const limit = options.limit || 10;
      const includeEdges = options.includeEdges !== false;
      const exactMatch = options.exactMatch || false;

      // Get the graph
      const graph = await this.storage.getGraph(graphId);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`);
      }

      // Normalize query for case-insensitive search
      const normalizedQuery = query.toLowerCase();

      // Filter nodes based on search criteria
      let matchingNodes = graph.nodes.filter((node) => {
        // Filter by node types if specified
        if (options.nodeTypes && options.nodeTypes.length > 0) {
          if (!options.nodeTypes.includes(node.type)) {
            return false;
          }
        }

        // Exact match vs partial match
        if (exactMatch) {
          return (
            node.name.toLowerCase() === normalizedQuery ||
            node.id.toLowerCase() === normalizedQuery ||
            (node.metadata?.documentation &&
              node.metadata.documentation.toLowerCase() === normalizedQuery)
          );
        } else {
          return (
            node.name.toLowerCase().includes(normalizedQuery) ||
            node.id.toLowerCase().includes(normalizedQuery) ||
            (node.metadata?.documentation &&
              node.metadata.documentation
                .toLowerCase()
                .includes(normalizedQuery))
          );
        }
      });

      // Sort results by relevance (name match is most relevant)
      matchingNodes.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(normalizedQuery)
          ? 1
          : 0;
        const bNameMatch = b.name.toLowerCase().includes(normalizedQuery)
          ? 1
          : 0;
        return bNameMatch - aNameMatch;
      });

      // Check if we need to truncate
      const truncated = matchingNodes.length > limit;

      // Limit results
      const resultNodes = matchingNodes.slice(0, limit);

      // Get edges between result nodes if requested
      let resultEdges: GraphEdge[] = [];
      if (includeEdges && resultNodes.length > 0) {
        const nodeIds = new Set(resultNodes.map((node) => node.id));
        resultEdges = graph.edges.filter(
          (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)
        );
      }

      logger.info(
        `Search complete: Found ${matchingNodes.length} nodes, returning ${resultNodes.length}`
      );

      return {
        nodes: resultNodes,
        edges: resultEdges,
        total: matchingNodes.length,
        truncated,
      };
    } catch (error) {
      logger.error(`Error searching nodes: ${error}`);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific node
   * @param graphId The ID of the graph
   * @param nodeId The ID of the node
   * @returns Detailed node information
   */
  public async getNodeDetails(
    graphId: string,
    nodeQuery: string
  ): Promise<{
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
  }> {
    try {
      logger.info(`Getting details for node ${nodeQuery} in graph ${graphId}`);

      // Find the node
      const node = await nodeLookup.findNode(graphId, nodeQuery);
      if (!node) {
        logger.warn(`Node not found: ${nodeQuery}`);
        return {
          node: null,
          incomingEdges: [],
          outgoingEdges: [],
          siblings: [],
        };
      }

      // Get the graph
      const graph = await this.storage.getGraph(graphId);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`);
      }

      // Get incoming edges
      const incomingEdges = graph.edges
        .filter((edge) => edge.to === node.id)
        .map((edge) => {
          const fromNode = graph.nodes.find((n) => n.id === edge.from);
          return {
            edge,
            fromNode: fromNode || {
              id: edge.from,
              name: edge.from.split(/[_\/\\]/).pop() || "Unknown",
              type: "File",
            },
          };
        });

      // Get outgoing edges
      const outgoingEdges = graph.edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => {
          const toNode = graph.nodes.find((n) => n.id === edge.to);
          return {
            edge,
            toNode: toNode || {
              id: edge.to,
              name: edge.to.split(/[_\/\\]/).pop() || "Unknown",
              type: "File",
            },
          };
        });

      // Get siblings (nodes of the same type in the same file)
      let siblings: GraphNode[] = [];
      if (node.file) {
        siblings = graph.nodes.filter(
          (n) =>
            n.file === node.file && n.type === node.type && n.id !== node.id
        );
      }

      // Get file information if applicable
      let file: { path: string; nodes: GraphNode[] } | undefined;
      if (node.file) {
        const fileNodes = graph.nodes.filter((n) => n.file === node.file);
        file = {
          path: node.file,
          nodes: fileNodes,
        };
      }

      return {
        node,
        incomingEdges,
        outgoingEdges,
        siblings,
        file,
      };
    } catch (error) {
      logger.error(`Error getting node details: ${error}`);
      throw error;
    }
  }

  /**
   * Find a path between two nodes in the graph
   * @param graphId The ID of the graph
   * @param fromNodeId The ID of the source node
   * @param toNodeId The ID of the target node
   * @returns Path between the nodes if found
   */
  public async findPath(
    graphId: string,
    fromNodeQuery: string,
    toNodeQuery: string,
    options: {
      maxDepth?: number;
      relationTypes?: string[];
    } = {}
  ): Promise<{
    path: GraphNode[];
    edges: GraphEdge[];
    length: number;
    found: boolean;
  }> {
    try {
      logger.info(
        `Finding path from ${fromNodeQuery} to ${toNodeQuery} in graph ${graphId}`
      );

      // Set defaults
      const maxDepth = options.maxDepth || 10;

      // Find the nodes
      const fromNode = await nodeLookup.findNode(graphId, fromNodeQuery);
      const toNode = await nodeLookup.findNode(graphId, toNodeQuery);

      if (!fromNode || !toNode) {
        logger.warn(
          `One or both nodes not found: ${fromNodeQuery}, ${toNodeQuery}`
        );
        return {
          path: [],
          edges: [],
          length: 0,
          found: false,
        };
      }

      // Get the graph
      const graph = await this.storage.getGraph(graphId);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`);
      }

      // BFS to find shortest path
      const queue: Array<{
        nodeId: string;
        path: string[];
        edgePath: GraphEdge[];
      }> = [
        {
          nodeId: fromNode.id,
          path: [fromNode.id],
          edgePath: [],
        },
      ];

      const visited = new Set<string>([fromNode.id]);

      while (queue.length > 0) {
        const { nodeId, path, edgePath } = queue.shift()!;

        // Check if we've reached the target
        if (nodeId === toNode.id) {
          // Convert path of IDs to path of nodes
          const nodePath = path.map(
            (id) => graph.nodes.find((n) => n.id === id)!
          );

          return {
            path: nodePath,
            edges: edgePath,
            length: path.length - 1,
            found: true,
          };
        }

        // Stop if we've reached the maximum depth
        if (path.length > maxDepth) {
          continue;
        }

        // Get outgoing edges
        const outgoingEdges = graph.edges.filter(
          (edge) => edge.from === nodeId
        );

        // Filter by relation types if specified
        const filteredEdges =
          options.relationTypes && options.relationTypes.length > 0
            ? outgoingEdges.filter((edge) =>
                options.relationTypes!.includes(edge.type)
              )
            : outgoingEdges;

        // Process each edge
        for (const edge of filteredEdges) {
          const nextNodeId = edge.to;

          // Skip if already visited
          if (visited.has(nextNodeId)) {
            continue;
          }

          // Mark as visited
          visited.add(nextNodeId);

          // Add to queue
          queue.push({
            nodeId: nextNodeId,
            path: [...path, nextNodeId],
            edgePath: [...edgePath, edge],
          });
        }
      }

      // No path found
      return {
        path: [],
        edges: [],
        length: 0,
        found: false,
      };
    } catch (error) {
      logger.error(`Error finding path: ${error}`);
      throw error;
    }
  }

  /**
   * Get graph statistics and overview
   * @param graphId The ID of the graph
   * @returns Statistics about the graph
   */
  public async getGraphStatistics(graphId: string): Promise<{
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
  }> {
    try {
      logger.info(`Getting statistics for graph ${graphId}`);

      // Get the graph
      const graph = await this.storage.getGraph(graphId);
      if (!graph) {
        throw new Error(`Graph not found: ${graphId}`);
      }

      // Count node types
      const nodeTypes: Record<string, number> = {};
      for (const node of graph.nodes) {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      }

      // Count edge types
      const edgeTypes: Record<string, number> = {};
      for (const edge of graph.edges) {
        edgeTypes[edge.type] = (edgeTypes[edge.type] || 0) + 1;
      }

      // Count connections per node
      const connections: Record<string, number> = {};
      for (const edge of graph.edges) {
        connections[edge.from] = (connections[edge.from] || 0) + 1;
        connections[edge.to] = (connections[edge.to] || 0) + 1;
      }

      // Calculate average connections
      const totalConnections = Object.values(connections).reduce(
        (sum, count) => sum + count,
        0
      );
      const avgConnections =
        graph.nodes.length > 0 ? totalConnections / graph.nodes.length : 0;

      // Find most connected nodes
      const mostConnectedNodes = Object.entries(connections)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([nodeId, count]) => {
          const node = graph.nodes.find((n) => n.id === nodeId);
          return {
            id: nodeId,
            name: node?.name || nodeId.split(/[_\/\\]/).pop() || "Unknown",
            type: node?.type || "Unknown",
            connections: count,
          };
        });

      return {
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        nodeTypes,
        edgeTypes,
        avgConnections,
        mostConnectedNodes,
      };
    } catch (error) {
      logger.error(`Error getting graph statistics: ${error}`);
      throw error;
    }
  }
}

// Singleton instance
export const graphExplorer = new GraphExplorer();
