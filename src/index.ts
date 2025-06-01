#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolRequest,
  CallToolResult,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Resource,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js'
import { GitHubKnowledgeGraphMCP } from './mcp-server.js'
import { logger } from './utils/logger.js'

const SERVER_NAME = 'github-knowledge-graph-mcp'
const SERVER_VERSION = '1.0.0'

class GitHubKGMCPServer {
  private server: Server
  private kgMCP: GitHubKnowledgeGraphMCP

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.kgMCP = new GitHubKnowledgeGraphMCP()
    this.setupHandlers()
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'analyze_repository',
          description:
            'Analyze a GitHub repository and generate a knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              repository_url: {
                type: 'string',
                description: 'GitHub repository URL to analyze',
              },
              branch: {
                type: 'string',
                description: 'Git branch to analyze (default: main)',
                default: 'main',
              },
              include_tests: {
                type: 'boolean',
                description: 'Include test files in analysis',
                default: false,
              },
              include_private: {
                type: 'boolean',
                description: 'Include private members in analysis',
                default: false,
              },
              exclude_patterns: {
                type: 'array',
                items: { type: 'string' },
                description: 'Patterns to exclude from analysis',
              },
            },
            required: ['repository_url'],
          },
        },
        {
          name: 'explore_graph',
          description: 'Explore the knowledge graph and find related nodes',
          inputSchema: {
            type: 'object',
            properties: {
              graph_id: {
                type: 'string',
                description: 'Knowledge graph ID to explore',
              },
              node_id: {
                type: 'string',
                description: 'Starting node ID for exploration',
              },
              depth: {
                type: 'number',
                description: 'Exploration depth (default: 2)',
                default: 2,
              },
              relation_types: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Types of relations to follow (imports, exports, calls, etc.)',
              },
            },
            required: ['graph_id', 'node_id'],
          },
        },
        {
          name: 'search_nodes',
          description:
            'Search for nodes in the knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              graph_id: {
                type: 'string',
                description: 'Knowledge graph ID to search in',
              },
              query: {
                type: 'string',
                description: 'Search query (node name, type, or description)',
              },
              node_types: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Filter by node types (function, class, interface, etc.)',
              },
              search_mode: {
                type: 'string',
                enum: ['exact', 'fuzzy', 'semantic'],
                description:
                  'Search mode: exact (strict matching), fuzzy (partial matching), semantic (meaning-based)',
                default: 'fuzzy',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10)',
                default: 10,
              },
            },
            required: ['graph_id', 'query'],
          },
        },
        {
          name: 'get_node_details',
          description: 'Get detailed information about a specific node',
          inputSchema: {
            type: 'object',
            properties: {
              graph_id: {
                type: 'string',
                description: 'Knowledge graph ID',
              },
              node_id: {
                type: 'string',
                description: 'Node ID to get details for',
              },
            },
            required: ['graph_id', 'node_id'],
          },
        },
        {
          name: 'get_graph_statistics',
          description: 'Get statistics and overview of the knowledge graph',
          inputSchema: {
            type: 'object',
            properties: {
              graph_id: {
                type: 'string',
                description: 'Knowledge graph ID',
              },
            },
            required: ['graph_id'],
          },
        },
      ]

      return { tools }
    })

    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const { name, parameters } = request.tool
        
        let result: CallToolResult
        
        try {
          switch (name) {
            case 'analyze_repository':
              result = await this.kgMCP.analyzeRepository(parameters)
              break
              
            case 'explore_graph':
              result = await this.kgMCP.exploreGraph(parameters)
              break
              
            case 'search_nodes':
              result = await this.kgMCP.searchNodes(parameters)
              break
              
            case 'get_node_details':
              result = await this.kgMCP.getNodeDetails(parameters)
              break
              
            case 'get_graph_statistics':
              result = await this.kgMCP.getGraphStatistics(parameters)
              break
              
            default:
              result = {
                status: 'error',
                error: `Unknown tool: ${name}`,
              }
          }
        } catch (error) {
          logger.error(
            `Error executing tool ${name}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
          
          result = {
            status: 'error',
            error: `Error executing ${name}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          }
        }
        
        return result
      }
    )
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport()
    await this.server.start(transport)
    logger.info('GitHub Knowledge Graph MCP Server started')
  }
}

// Start the server when this script is run directly
if (process.argv[1] === import.meta.url.substring(7)) {
  const server = new GitHubKGMCPServer()
  server
    .start()
    .catch((error) => {
      logger.error(
        `Failed to start MCP server: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
      process.exit(1)
    })
}

export { GitHubKGMCPServer }