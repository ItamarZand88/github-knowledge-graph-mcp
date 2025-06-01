#!/usr/bin/env node

/**
 * Quick start script for GitHub Knowledge Graph MCP Server
 * This script helps you get started with the MCP server quickly
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

console.log(`🚀 GitHub Knowledge Graph MCP Server v${packageJson.version}`);
console.log('=====================================\n');

// Check if built
const distPath = join(__dirname, '..', 'dist');
if (!existsSync(distPath)) {
  console.log('❌ Server not built yet. Run: npm run build');
  process.exit(1);
}

// Show data directory info
const homeDir = os.homedir();
const defaultDataDir = join(homeDir, '.github-knowledge-graph', 'data');
const dataDir = process.env.MCP_DATA_DIR || defaultDataDir;

console.log('✅ Server is built and ready!');
console.log(`📂 Data directory: ${dataDir}`);
console.log('\n📚 Quick Start Guide:');
console.log('1. Generate a knowledge graph using the CLI:');
console.log('   cd ../cli && npm start');
console.log('\n2. Configure your MCP client with this server:');
console.log('   Command: node');
console.log('   Args: ["./packages/mcp-server/dist/index.js"]');
console.log('   Env: { MCP_DATA_DIR: "$HOME/.github-knowledge-graph/data" }');
console.log('\n3. Use MCP tools to explore your codebase:');
console.log('   - search_nodes: Find components');
console.log('   - explore_graph: Navigate relationships');
console.log('   - find_dependencies: Analyze coupling');
console.log('   - find_circular_dependencies: Find cycles');
console.log('   - get_graph_statistics: Overview metrics');

console.log('\n🔧 Available Commands:');
console.log('   npm start         - Start the MCP server');
console.log('   npm run dev       - Start in development mode');
console.log('   npm test          - Run tests');
console.log('   npm run build     - Build the server');

console.log('\n🔧 Environment Variables:');
console.log('   MCP_DATA_DIR      - Set custom data directory (default: $HOME/.github-knowledge-graph/data)');
console.log('   MCP_PORT          - Set custom port (default: 3100)');
console.log('   MCP_HOST          - Set custom host (default: localhost)');
console.log('   MCP_LOG_LEVEL     - Set log level (default: info)');

console.log('\n📖 For detailed examples, see DEMO.md');
console.log('📝 For full documentation, see README.md');

console.log('\n🎯 Ready to explore your codebase!');