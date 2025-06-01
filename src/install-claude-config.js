#!/usr/bin/env node

/**
 * Script to update Claude Desktop configuration with GitHub Knowledge Graph MCP server
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default config path for Claude Desktop
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');

// Get the package directory
const packageDir = path.resolve(__dirname, '..');

async function updateClaudeConfig() {
  console.log('🔧 Updating Claude Desktop configuration...');
  
  // Check if config file exists
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
    console.log(`❌ Claude Desktop config not found at ${DEFAULT_CONFIG_PATH}`);
    console.log('ℹ️ You may need to install Claude Desktop or run it once to create the config file.');
    console.log('ℹ️ Alternatively, you can add the configuration manually.');
    return;
  }
  
  try {
    // Read existing config
    const config = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8'));
    
    // Check if mcpServers exists
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    
    // Set default data directory
    const homeDir = os.homedir();
    const defaultDataDir = path.join(homeDir, '.github-knowledge-graph', 'data');
    
    // Add or update github-knowledge-graph MCP server
    config.mcpServers['github-knowledge-graph-mcp'] = {
      command: 'npx',
      args: ['github-knowledge-graph-mcp'],
      env: {
        MCP_DATA_DIR: defaultDataDir
      }
    };
    
    // Write the updated config
    fs.writeFileSync(DEFAULT_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    
    console.log('✅ Successfully updated Claude Desktop configuration!');
    console.log(`ℹ️ Config file: ${DEFAULT_CONFIG_PATH}`);
    console.log('ℹ️ Added MCP server: github-knowledge-graph-mcp');
    console.log(`ℹ️ Default data directory: ${defaultDataDir}`);
    console.log('\nℹ️ Restart Claude Desktop for the changes to take effect.');
    
  } catch (error) {
    console.error('❌ Error updating Claude Desktop configuration:', error.message);
    console.log('ℹ️ You can add the configuration manually to your Claude Desktop config file.');
  }
}

// Run the update function
updateClaudeConfig().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});