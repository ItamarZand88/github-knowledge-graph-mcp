# GitHub Knowledge Graph MCP Server

A Model Context Protocol (MCP) server for exploring and analyzing GitHub repository knowledge graphs. This service enables AI models to understand, query, and navigate code structures through a standardized API.

## 🌟 Features

- **Graph Exploration**: Navigate through code structures with relationship-aware traversal
- **Code Search**: Find components based on name, type, or functionality
- **Dependency Analysis**: Discover dependencies and dependents of specific code units
- **Circular Dependency Detection**: Identify and resolve circular dependencies
- **Graph Statistics**: Get insights about your codebase structure
- **Performance Optimized**: Fast lookups with intelligent caching
- **MCP Standard**: Compatible with Model Context Protocol for AI interaction

## 📋 Prerequisites

- Node.js 16.x or higher
- npm or yarn
- Git

## 🚀 Installation

### Clone the repository

```bash
git clone https://github.com/ItamarZand88/github-knowledge-graph-mcp.git
cd github-knowledge-graph-mcp
```

### Install dependencies

```bash
npm install
```

### Build the project

```bash
npm run build
```

## ⚙️ Configuration

Create a `.env` file in the project root or modify the `mcp-config.json` file:

```json
{
  "port": 3010,
  "host": "127.0.0.1",
  "dataDir": "./data",
  "maxConcurrentJobs": 2,
  "jobTimeout": 1800000,
  "allowOrigins": ["http://localhost:3000"],
  "logLevel": "info",
  "auth": {
    "enabled": false,
    "apiKeyHeader": "x-api-key",
    "apiKeys": ["your-api-key-here"]
  }
}
```

Configuration options:

| Option | Description | Default |
|--------|-------------|---------|
| `port` | Port number for the server | 3010 |
| `host` | Host address to bind to | 127.0.0.1 |
| `dataDir` | Directory to store graph data | ./data |
| `maxConcurrentJobs` | Maximum concurrent analysis jobs | 2 |
| `jobTimeout` | Job timeout in milliseconds | 1800000 (30min) |
| `allowOrigins` | CORS allowed origins | ["http://localhost:3000"] |
| `logLevel` | Logging level (debug, info, warn, error) | info |
| `auth.enabled` | Enable API key authentication | false |
| `auth.apiKeyHeader` | HTTP header for API key | x-api-key |
| `auth.apiKeys` | List of valid API keys | [] |

## 🏃‍♂️ Running the Server

### Development mode

```bash
npm run dev
```

### Production mode

```bash
npm start
```

## 🔌 Integrating with AI Tools

### Adding to Claude Desktop

To add the GitHub Knowledge Graph MCP server to Claude Desktop:

1. Install the server globally (recommended for easier integration):

```bash
npm install -g github-knowledge-graph-mcp
```

2. Open the Claude Desktop configuration file:
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

3. Add the following to the `mcpServers` section:

```json
"github-knowledge-graph": {
  "command": "github-knowledge-graph-mcp",
  "args": [],
  "env": {
    "MCP_PORT": "3010",
    "MCP_DATA_DIR": "/path/to/your/data/directory"
  }
}
```

Alternatively, if you didn't install globally, you can run it from your local installation:

```json
"github-knowledge-graph": {
  "command": "node",
  "args": ["/path/to/github-knowledge-graph-mcp/dist/index.js"],
  "env": {
    "MCP_PORT": "3010",
    "MCP_DATA_DIR": "/path/to/your/data/directory"
  }
}
```

4. Save the file and restart Claude Desktop

### Using with Other MCP-compatible Tools

For other tools that support Model Context Protocol:

1. Start the server:

```bash
github-knowledge-graph-mcp
```

2. Configure the tool to connect to the server at `http://localhost:3010` (or your configured host/port)

## 🔍 Using the MCP API

The server exposes a Model Context Protocol compatible API that can be used to interact with knowledge graphs.

### Available Functions

| Function | Description |
|----------|-------------|
| `analyze_repository` | Analyze a GitHub repository and generate a knowledge graph |
| `explore_graph` | Explore the knowledge graph starting from a specific node |
| `search_nodes` | Search for nodes in the knowledge graph |
| `get_node_details` | Get detailed information about a specific node |
| `find_dependencies` | Find dependencies and dependents of a node |
| `get_graph_statistics` | Get statistics and overview of the knowledge graph |
| `find_circular_dependencies` | Find circular dependencies in the codebase |

### Example: Exploring a Graph

```javascript
// Using fetch
const response = await fetch('http://localhost:3010/api/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'explore_graph',
    parameters: {
      graph_id: '248df88f-d8cd-4974-b0f4-1ef53f49ecac',
      node_id: 'function:renderComponent@src/components/App.tsx',
      depth: 2
    }
  })
});

const result = await response.json();
console.log(result);
```

### Example: Searching Nodes

```javascript
// Using fetch
const response = await fetch('http://localhost:3010/api/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'search_nodes',
    parameters: {
      graph_id: '248df88f-d8cd-4974-b0f4-1ef53f49ecac',
      query: 'UserProfile',
      node_types: ['Class', 'Function', 'Interface']
    }
  })
});

const result = await response.json();
console.log(result);
```

## 📂 Project Structure

```
github-knowledge-graph-mcp/
├── data/
│   └── graphs/         # Storage for knowledge graphs
├── src/
│   ├── core/           # Core services
│   │   ├── dependency-analyzer.ts
│   │   ├── graph-explorer.ts
│   │   ├── graph-storage.ts
│   │   └── node-lookup.ts
│   ├── types/          # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/          # Utility functions
│   │   ├── logger.ts
│   │   ├── node-id.ts
│   │   └── result-formatters.ts
│   ├── index.ts        # Main entry point
│   └── mcp-server.ts   # MCP server implementation
├── .gitignore
├── mcp-config.json     # Server configuration
├── package.json
├── README.md
└── tsconfig.json
```

## 📊 Real-time Updates

The server uses Socket.IO for real-time updates. Connect to the WebSocket server to receive notifications about changes to graphs:

```javascript
// Using Socket.IO client
const socket = io('http://localhost:3010');

// Subscribe to updates for a specific graph
socket.emit('subscribe', '248df88f-d8cd-4974-b0f4-1ef53f49ecac');

// Listen for updates
socket.on('graph:update', (data) => {
  console.log('Graph updated:', data);
});

// Unsubscribe when done
socket.emit('unsubscribe', '248df88f-d8cd-4974-b0f4-1ef53f49ecac');
```

## 🔐 Authentication

To enable API key authentication, set `auth.enabled` to `true` in the configuration and add your API keys to the `auth.apiKeys` array.

Then include the API key in your requests:

```javascript
const response = await fetch('http://localhost:3010/api/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({
    // ...
  })
});
```

## 🧪 Testing

```bash
npm test
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.