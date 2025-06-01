/**
 * GitHub Knowledge Graph MCP Server
 * Entry point for the MCP server
 */
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { logger, setLogLevel } from './utils/logger.js'
import { MCPServer } from './mcp-server.js'
import type { MCPServerConfig } from './types/index.js'

// Load environment variables
config()

// Default configuration
const defaultConfig: MCPServerConfig = {
  port: 3010,
  host: '127.0.0.1',
  dataDir: path.join(process.cwd(), 'data'),
  maxConcurrentJobs: 2,
  jobTimeout: 1800000, // 30 minutes
  allowOrigins: ['http://localhost:3000'],
  logLevel: 'info'
}

/**
 * Load server configuration from file or environment variables
 * @returns Server configuration
 */
function loadConfig(): MCPServerConfig {
  // Try to load configuration file
  let fileConfig: Partial<MCPServerConfig> = {}
  const configPath = path.join(process.cwd(), 'mcp-config.json')
  
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      fileConfig = JSON.parse(configContent)
      logger.info(`Configuration loaded from ${configPath}`)
    } catch (error) {
      logger.warn(`Error loading configuration file: ${error}`)
    }
  }
  
  // Load configuration from environment variables with fallback to file config and defaults
  const config: MCPServerConfig = {
    port: parseInt(process.env.MCP_PORT || '') || fileConfig.port || defaultConfig.port,
    host: process.env.MCP_HOST || fileConfig.host || defaultConfig.host,
    dataDir: process.env.MCP_DATA_DIR || fileConfig.dataDir || defaultConfig.dataDir,
    maxConcurrentJobs: parseInt(process.env.MCP_MAX_CONCURRENT_JOBS || '') || 
      fileConfig.maxConcurrentJobs || defaultConfig.maxConcurrentJobs,
    jobTimeout: parseInt(process.env.MCP_JOB_TIMEOUT || '') || 
      fileConfig.jobTimeout || defaultConfig.jobTimeout,
    allowOrigins: process.env.MCP_ALLOW_ORIGINS ? 
      process.env.MCP_ALLOW_ORIGINS.split(',') : 
      fileConfig.allowOrigins || defaultConfig.allowOrigins,
    logLevel: (process.env.MCP_LOG_LEVEL || 
      fileConfig.logLevel || 
      defaultConfig.logLevel) as 'debug' | 'info' | 'warn' | 'error'
  }
  
  // Load authentication configuration if enabled
  const authEnabled = process.env.MCP_AUTH_ENABLED === 'true' || fileConfig.auth?.enabled
  
  if (authEnabled) {
    config.auth = {
      enabled: true,
      apiKeyHeader: process.env.MCP_AUTH_HEADER || 
        fileConfig.auth?.apiKeyHeader || 
        'x-api-key',
      apiKeys: process.env.MCP_AUTH_API_KEYS ? 
        process.env.MCP_AUTH_API_KEYS.split(',') : 
        fileConfig.auth?.apiKeys || []
    }
  }
  
  return config
}

/**
 * Start the MCP server
 */
async function startServer() {
  try {
    // Load configuration
    const config = loadConfig()
    
    // Set log level
    setLogLevel(config.logLevel)
    
    // Create and start server
    const server = new MCPServer(config)
    await server.start()
    
    // Handle shutdown signals
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal. Shutting down...')
      await server.stop()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal. Shutting down...')
      await server.stop()
      process.exit(0)
    })
    
    logger.info(`MCP server started on ${config.host}:${config.port}`)
  } catch (error) {
    logger.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

// Start the server when this file is run directly
if (require.main === module) {
  startServer()
}

export { startServer, loadConfig }