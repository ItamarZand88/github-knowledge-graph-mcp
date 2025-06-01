# GitHub Knowledge Graph MCP Server

Generate and interact with knowledge graphs of GitHub repositories using the Model Context Protocol (MCP).

## Installation

```bash
# Install globally
npm install -g github-knowledge-graph-mcp

# Or install locally
npm install github-knowledge-graph-mcp
```

## Quick Start

```bash
# Start the MCP server
github-kg-mcp
```

Or run directly with npx:

```bash
npx github-knowledge-graph-mcp
```

## Environment Variables

The server can be configured with the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PORT` | The port to run the MCP server on | `3100` |
| `MCP_HOST` | The host to bind the MCP server to | `localhost` |
| `MCP_DATA_DIR` | Directory to store knowledge graphs | `$HOME/.github-knowledge-graph/data` |
| `MCP_LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

Example:

```bash
# Set custom configuration
export MCP_PORT=3200
export MCP_DATA_DIR=$HOME/github-kg-data
github-kg-mcp
```

## Claude Desktop Integration

You can automatically configure Claude Desktop to use this MCP server:

```bash
# If installed globally
npx github-knowledge-graph-mcp install-claude

# Or if installed locally
npm run install-claude
```

This will add the MCP server configuration to your Claude Desktop config file located at:
`%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`$HOME/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

## API Usage

The server implements the Model Context Protocol (MCP), enabling AI models to analyze and explore code repositories.

### Available Functions

1. `analyze_repository` - Generate a knowledge graph from a GitHub repository
2. `get_analysis_status` - Check status of an ongoing analysis
3. `get_analysis_result` - Retrieve completed analysis and save as a knowledge graph
4. `explore_graph` - Navigate and explore the knowledge graph
5. `search_nodes` - Find nodes matching specific criteria
6. `get_node_details` - Get detailed information about a specific node
7. `find_dependencies` - Analyze dependencies and dependents of a node
8. `get_graph_statistics` - Get overview statistics for a knowledge graph
9. `find_circular_dependencies` - Detect circular dependencies in the codebase

## Advanced Usage

```javascript
// Example: Custom server configuration
import { startMcpServer } from 'github-knowledge-graph-mcp';

startMcpServer({
  port: 4000,
  dataDir: '/custom/data/path',
  logLevel: 'debug'
});
```

## License

MIT