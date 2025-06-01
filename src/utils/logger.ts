/**
 * Centralized logging utility
 */
import pino from "pino";

// Define log levels
type LogLevel = "debug" | "info" | "warn" | "error";

// Determine log level from environment or default to 'info'
const logLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

// Create the logger instance
export const logger = pino.default({
  level: logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  },
});

/**
 * Set the log level dynamically
 * @param level The log level to set
 */
export function setLogLevel(level: LogLevel): void {
  (logger as any).level = level;
  logger.info(`Log level set to ${level}`);
}

/**
 * Create a child logger with additional context
 * @param context Context to add to the logger
 * @returns Child logger instance
 */
export function createContextLogger(
  context: Record<string, any>
): typeof logger {
  return logger.child(context);
}

/**
 * Log performance metrics
 * @param operation Name of the operation
 * @param durationMs Duration in milliseconds
 * @param metadata Additional metadata
 */
export function logPerformance(
  operation: string,
  durationMs: number,
  metadata: Record<string, any> = {}
): void {
  logger.info({
    msg: `Performance: ${operation} took ${durationMs}ms`,
    operation,
    durationMs,
    ...metadata,
    type: "performance",
  });
}

/**
 * Start timing an operation for performance measurement
 * @param operation Name of the operation
 * @returns Function to call when operation is complete
 */
export function timeOperation(operation: string): () => void {
  const startTime = performance.now();
  return (metadata: Record<string, any> = {}): void => {
    const endTime = performance.now();
    const durationMs = Math.round(endTime - startTime);
    logPerformance(operation, durationMs, metadata);
  };
}

/**
 * Log an error with additional context
 * @param error The error to log
 * @param context Additional context
 */
export function logError(
  error: Error | string,
  context: Record<string, any> = {}
): void {
  if (typeof error === "string") {
    logger.error({ ...context, type: "error" }, error);
  } else {
    logger.error(
      {
        ...context,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        type: "error",
      },
      error.message
    );
  }
}

/**
 * Log an API request
 * @param req Request object
 * @param res Response object
 * @param startTime Start time of the request
 */
export function logApiRequest(
  req: {
    method: string;
    url: string;
    headers: Record<string, any>;
    body?: any;
  },
  res: {
    statusCode: number;
  },
  startTime: number
): void {
  const endTime = performance.now();
  const durationMs = Math.round(endTime - startTime);

  logger.info({
    msg: `API Request: ${req.method} ${req.url} ${res.statusCode} ${durationMs}ms`,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    durationMs,
    userAgent: req.headers["user-agent"],
    type: "api",
  });
}

export default logger;
