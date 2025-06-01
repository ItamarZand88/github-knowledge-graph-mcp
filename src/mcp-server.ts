/**
 * MCP (Model Context Protocol) Server implementation
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { logger, logApiRequest } from "./utils/logger.js";
import { nodeLookup } from "./core/node-lookup.js";
import { graphExplorer } from "./core/graph-explorer.js";
import { DependencyAnalyzer } from "./core/dependency-analyzer.js";
import { GraphStorage } from "./core/graph-storage.js";
import {
  formatExplorationResult,
  formatDependencyResult,
  formatCircularDependencies,
  formatGraphStatistics,
  formatNodeDetails,
  formatPathResult,
  formatSearchResult,
} from "./utils/result-formatters.js";
import type {
  MCPServerConfig,
  MCPFunction,
  MCPHandlerContext,
  MCPHandlerResponse,
} from "./types/index.js";

// Define MCP Function handlers
type MCPHandler = (context: MCPHandlerContext) => Promise<MCPHandlerResponse>;

export class MCPServer {
  private app: express.Express;
  private server: any;
  private io: SocketIOServer;
  private config: MCPServerConfig;
  private graphStorage: GraphStorage;
  private dependencyAnalyzer: DependencyAnalyzer;
  private handlers: Map<string, MCPHandler> = new Map();
  private functions: MCPFunction[] = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.allowOrigins,
        methods: ["GET", "POST"],
      },
    });

    this.graphStorage = new GraphStorage(this.config.dataDir);
    this.dependencyAnalyzer = new DependencyAnalyzer();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.registerFunctions();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS middleware
    this.app.use(
      cors({
        origin: this.config.allowOrigins,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
      })
    );

    // JSON parsing middleware
    this.app.use(express.json({ limit: "10mb" }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      const startTime = performance.now();
      res.on("finish", () => {
        logApiRequest(req, res, startTime);
      });
      next();
    });

    // Authentication middleware (if enabled)
    if (this.config.auth?.enabled) {
      this.app.use((req, res, next) => {
        const apiKey =
          req.headers[this.config.auth!.apiKeyHeader.toLowerCase()];

        if (!apiKey || !this.config.auth!.apiKeys.includes(apiKey as string)) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        next();
        return;
      });
    }
  }

  /**
   * Set up Express routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.status(200).json({ status: "ok" });
    });

    // MCP functions endpoint
    this.app.get("/api/functions", (req, res) => {
      res.status(200).json({ functions: this.functions });
    });

    // MCP function call endpoint
    this.app.post("/api/call", async (req, res) => {
      try {
        const { name, parameters } = req.body;

        if (!name || !parameters) {
          return res
            .status(400)
            .json({ error: "Missing function name or parameters" });
        }

        const handler = this.handlers.get(name);

        if (!handler) {
          return res.status(404).json({ error: `Function ${name} not found` });
        }

        const result = await handler({ params: parameters });

        return res.status(200).json(result);
      } catch (error: any) {
        logger.error(`Error calling function: ${error}`);
        return res
          .status(500)
          .json({ error: error.message || "Internal server error" });
      }
    });

    // Graph information endpoint
    this.app.get("/api/graphs", async (req, res) => {
      try {
        const graphs = await this.graphStorage.listGraphs();
        res.status(200).json({ graphs });
      } catch (error: any) {
        logger.error(`Error listing graphs: ${error}`);
        res
          .status(500)
          .json({ error: error.message || "Internal server error" });
      }
    });

    // Not found handler
    this.app.use((req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    // Error handler
    this.app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        logger.error(`Express error: ${err}`);
        res.status(500).json({ error: err.message || "Internal server error" });
      }
    );
  }

  /**
   * Set up Socket.IO for real-time updates
   */
  private setupSocketIO(): void {
    this.io.on("connection", (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      socket.on("subscribe", (graphId) => {
        socket.join(`graph:${graphId}`);
        logger.info(`Socket ${socket.id} subscribed to graph ${graphId}`);
      });

      socket.on("unsubscribe", (graphId) => {
        socket.leave(`graph:${graphId}`);
        logger.info(`Socket ${socket.id} unsubscribed from graph ${graphId}`);
      });

      socket.on("disconnect", () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Register all MCP functions and handlers
   */
  private registerFunctions(): void {
    // Define all MCP functions
    this.functions = [
      {
        name: "analyze_repository",
        description:
          "Analyze a GitHub repository and generate a knowledge graph",
        parameters: {
          properties: {
            repository_url: {
              type: "string",
              description: "GitHub repository URL to analyze",
            },
            branch: {
              type: "string",
              description: "Git branch to analyze (default: main)",
              default: "main",
            },
            exclude_patterns: {
              type: "array",
              description: "Patterns to exclude from analysis",
              items: {
                type: "string",
              },
            },
            include_tests: {
              type: "boolean",
              description: "Include test files in analysis",
              default: false,
            },
            include_private: {
              type: "boolean",
              description: "Include private members in analysis",
              default: false,
            },
          },
          required: ["repository_url"],
          type: "object",
        },
      },
      {
        name: "explore_graph",
        description: "Explore the knowledge graph and find related nodes",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID to explore",
            },
            node_id: {
              type: "string",
              description: "Starting node ID for exploration",
            },
            depth: {
              type: "number",
              description: "Exploration depth (default: 2)",
              default: 2,
            },
            relation_types: {
              type: "array",
              description:
                "Types of relations to follow (imports, exports, calls, etc.)",
              items: {
                type: "string",
              },
            },
          },
          required: ["graph_id", "node_id"],
          type: "object",
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID to search in",
            },
            query: {
              type: "string",
              description: "Search query (node name, type, or description)",
            },
            node_types: {
              type: "array",
              description:
                "Filter by node types (function, class, interface, etc.)",
              items: {
                type: "string",
              },
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
              default: 10,
            },
          },
          required: ["graph_id", "query"],
          type: "object",
        },
      },
      {
        name: "get_node_details",
        description: "Get detailed information about a specific node",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID",
            },
            node_id: {
              type: "string",
              description: "Node ID to get details for",
            },
          },
          required: ["graph_id", "node_id"],
          type: "object",
        },
      },
      {
        name: "find_dependencies",
        description: "Find dependencies and dependents of a node",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID",
            },
            node_id: {
              type: "string",
              description: "Node ID to analyze dependencies for",
            },
            direction: {
              type: "string",
              description: "Direction of dependencies to analyze",
              enum: ["incoming", "outgoing", "both"],
              default: "both",
            },
          },
          required: ["graph_id", "node_id"],
          type: "object",
        },
      },
      {
        name: "get_graph_statistics",
        description: "Get statistics and overview of the knowledge graph",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID",
            },
          },
          required: ["graph_id"],
          type: "object",
        },
      },
      {
        name: "find_circular_dependencies",
        description: "Find circular dependencies in the codebase",
        parameters: {
          properties: {
            graph_id: {
              type: "string",
              description: "Knowledge graph ID",
            },
            max_cycles: {
              type: "number",
              description: "Maximum number of cycles to find",
              default: 10,
            },
          },
          required: ["graph_id"],
          type: "object",
        },
      },
      {
        name: "get_analysis_status",
        description: "Check the status of a repository analysis job",
        parameters: {
          properties: {
            job_id: {
              type: "string",
              description: "Job ID returned from analyze_repository",
            },
          },
          required: ["job_id"],
          type: "object",
        },
      },
      {
        name: "get_analysis_result",
        description:
          "Get the completed analysis result and save it as a knowledge graph",
        parameters: {
          properties: {
            job_id: {
              type: "string",
              description: "Job ID of completed analysis",
            },
          },
          required: ["job_id"],
          type: "object",
        },
      },
    ];

    // Register handlers for each function
    this.registerHandler("explore_graph", this.handleExploreGraph.bind(this));
    this.registerHandler("search_nodes", this.handleSearchNodes.bind(this));
    this.registerHandler(
      "get_node_details",
      this.handleGetNodeDetails.bind(this)
    );
    this.registerHandler(
      "find_dependencies",
      this.handleFindDependencies.bind(this)
    );
    this.registerHandler(
      "get_graph_statistics",
      this.handleGetGraphStatistics.bind(this)
    );
    this.registerHandler(
      "find_circular_dependencies",
      this.handleFindCircularDependencies.bind(this)
    );

    // Stub handlers for analysis functions (would be implemented in full version)
    this.registerHandler(
      "analyze_repository",
      this.handleAnalyzeRepository.bind(this)
    );
    this.registerHandler(
      "get_analysis_status",
      this.handleGetAnalysisStatus.bind(this)
    );
    this.registerHandler(
      "get_analysis_result",
      this.handleGetAnalysisResult.bind(this)
    );
  }

  /**
   * Register a handler for an MCP function
   * @param name Function name
   * @param handler Function handler
   */
  private registerHandler(name: string, handler: MCPHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Handler for explore_graph function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleExploreGraph(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id, node_id, depth, relation_types } = context.params;

      const result = await graphExplorer.exploreGraph(graph_id, node_id, {
        depth: depth || 2,
        relationTypes: relation_types,
      });

      return {
        result: formatExplorationResult(result),
      };
    } catch (error: any) {
      logger.error(`Error exploring graph: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for search_nodes function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleSearchNodes(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id, query, node_types, limit } = context.params;

      const result = await graphExplorer.searchNodes(graph_id, query, {
        limit: limit || 10,
        nodeTypes: node_types,
      });

      return {
        result: formatSearchResult(result),
      };
    } catch (error: any) {
      logger.error(`Error searching nodes: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for get_node_details function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleGetNodeDetails(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id, node_id } = context.params;

      const result = await graphExplorer.getNodeDetails(graph_id, node_id);

      return {
        result: formatNodeDetails(result),
      };
    } catch (error: any) {
      logger.error(`Error getting node details: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for find_dependencies function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleFindDependencies(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id, node_id, direction } = context.params;

      const result = await this.dependencyAnalyzer.findDependencies(
        graph_id,
        node_id,
        direction || "both"
      );

      // Convert to standardized format
      const dependencyResult = {
        nodeName: result.nodeInfo?.name || "Unknown",
        nodeType: result.nodeInfo?.type || "Unknown",
        incoming: result.incoming,
        outgoing: result.outgoing,
        directDependencies: result.directDependencies,
        transitiveDependencies: result.transitiveDependencies,
        maxDepth: 0, // Would be calculated in full implementation
      };

      return {
        result: formatDependencyResult(dependencyResult),
      };
    } catch (error: any) {
      logger.error(`Error finding dependencies: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for get_graph_statistics function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleGetGraphStatistics(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id } = context.params;

      const result = await graphExplorer.getGraphStatistics(graph_id);

      return {
        result: formatGraphStatistics(result),
      };
    } catch (error: any) {
      logger.error(`Error getting graph statistics: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for find_circular_dependencies function
   * @param context Handler context
   * @returns Handler response
   */
  private async handleFindCircularDependencies(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { graph_id, max_cycles } = context.params;

      const result = await this.dependencyAnalyzer.findCircularDependencies(
        graph_id,
        max_cycles || 10
      );

      return {
        result: formatCircularDependencies(result),
      };
    } catch (error: any) {
      logger.error(`Error finding circular dependencies: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for analyze_repository function
   * Note: This would be fully implemented in production with a GitHub API client
   * @param context Handler context
   * @returns Handler response
   */
  private async handleAnalyzeRepository(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { repository_url } = context.params;

      // Generate a job ID
      const jobId = `job_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      // In a real implementation, this would start a background job
      // For now, we'll just return a job ID

      logger.info(
        `Repository analysis requested for ${repository_url}, job ID: ${jobId}`
      );

      return {
        result: {
          job_id: jobId,
          status: "pending",
          message: `Analysis job created for ${repository_url}`,
        },
      };
    } catch (error: any) {
      logger.error(`Error starting repository analysis: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for get_analysis_status function
   * Note: This would be fully implemented in production
   * @param context Handler context
   * @returns Handler response
   */
  private async handleGetAnalysisStatus(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { job_id } = context.params;

      // In a real implementation, this would check the status of a background job
      // For now, we'll just return a mock status

      logger.info(`Analysis status requested for job ${job_id}`);

      return {
        result: {
          job_id,
          status: "pending",
          progress: 0,
          message: "Job is queued",
        },
      };
    } catch (error: any) {
      logger.error(`Error getting analysis status: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Handler for get_analysis_result function
   * Note: This would be fully implemented in production
   * @param context Handler context
   * @returns Handler response
   */
  private async handleGetAnalysisResult(
    context: MCPHandlerContext
  ): Promise<MCPHandlerResponse> {
    try {
      const { job_id } = context.params;

      // In a real implementation, this would get the result of a completed job
      // For now, we'll just return an error

      logger.info(`Analysis result requested for job ${job_id}`);

      return {
        result: null,
        error: "Analysis not implemented in this version",
      };
    } catch (error: any) {
      logger.error(`Error getting analysis result: ${error}`);
      return {
        result: null,
        error: error.message,
      };
    }
  }

  /**
   * Start the MCP server
   * @returns Promise that resolves when the server is started
   */
  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        logger.info(
          `MCP server listening on ${this.config.host}:${this.config.port}`
        );
        resolve();
      });
    });
  }

  /**
   * Stop the MCP server
   * @returns Promise that resolves when the server is stopped
   */
  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err: any) => {
        if (err) {
          logger.error(`Error stopping server: ${err}`);
          reject(err);
        } else {
          logger.info("MCP server stopped");
          resolve();
        }
      });
    });
  }
}
