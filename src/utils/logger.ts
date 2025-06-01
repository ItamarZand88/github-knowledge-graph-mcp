import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'error', // Only show errors in MCP mode
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'github-kg-mcp' },
  transports: [
    // File transport only for MCP server - no console output to avoid JSON corruption
    new winston.transports.File({
      filename: 'mcp-server.log',
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 2,
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Silence logger in test environment
if (process.env.NODE_ENV === 'test') {
  logger.transports.forEach((transport) => {
    transport.silent = true;
  });
}

export default logger;