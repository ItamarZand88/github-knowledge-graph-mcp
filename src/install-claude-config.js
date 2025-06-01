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

// Determine config path for Claude Desktop based on platform
function getConfigPath() {
  const homeDir = os.homedir();
  const platform = os.platform();
  
  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else {
    // Linux or other platforms (make a reasonable guess)
    return path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

const configPath = getConfigPath();

async function updateClaudeConfig() {
  console.log('🔧 Updating Claude Desktop configuration...');
  console.log(`ℹ️ Looking for config at: ${configPath}`);
  
  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    console.log(`❌ Claude Desktop config not found at ${configPath}`);
    console.log('ℹ️ You may need to install Claude Desktop or run it once to create the config file.');
    console.log('ℹ️ Alternatively, you can add the configuration manually.');
    
    // Provide manual configuration instructions
    console.log('\n📋 Manual configuration instructions:');
    console.log('1. Open Claude Desktop');
    console.log('2. Edit the configuration file mentioned above');
    console.log('3. Add the following to the "mcpServers" section:');
    console.log(`
    "github-knowledge-graph-mcp": {
      "command": "npx",
      "args": ["github-knowledge-graph-mcp"],
      "env": {
        "MCP_DATA_DIR": "${path.join(os.homedir(), '.github-knowledge-graph', 'data')}"
      }
    }`);
    return;
  }
  
  try {
    // Read existing config
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
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
    
    // Create backup of existing config
    const backupPath = `${configPath}.backup`;
    fs.copyFileSync(configPath, backupPath);
    console.log(`ℹ️ Created backup at: ${backupPath}`);
    
    // Write the updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    console.log('✅ Successfully updated Claude Desktop configuration!');
    console.log(`ℹ️ Config file: ${configPath}`);
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