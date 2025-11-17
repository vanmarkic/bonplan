/**
 * Winston Logger Configuration
 * CRITICAL: Never log IP addresses, PINs, or sensitive user data
 */

const winston = require('winston');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

// Custom format to redact sensitive fields
const redactSensitiveData = winston.format((info) => {
  const sensitiveFields = ['pin', 'password', 'token', 'session', 'cookie', 'authorization', 'ip', 'x-forwarded-for'];

  // Redact sensitive fields from message object
  if (typeof info === 'object') {
    sensitiveFields.forEach((field) => {
      if (info[field]) {
        info[field] = '[REDACTED]';
      }
    });
  }

  // Redact from message string
  if (typeof info.message === 'string') {
    sensitiveFields.forEach((field) => {
      const regex = new RegExp(`${field}[=:\\s]+[^\\s,}]+`, 'gi');
      info.message = info.message.replace(regex, `${field}=[REDACTED]`);
    });
  }

  return info;
});

// Create logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    redactSensitiveData(),
    winston.format.json()
  ),
  defaultMeta: { service: 'syndicat-tox' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 30,
      tailable: true
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/app.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 7,
      tailable: true
    })
  ],
  // Never log to console in production (avoid accidental IP logging)
  silent: false
});

// Console logging for development only
if (!isProduction) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({
        level, message, timestamp, ...meta
      }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0 && meta.service !== 'syndicat-tox') {
          msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
      })
    )
  }));
}

// Helper methods
logger.security = (message, meta = {}) => {
  logger.warn(`[SECURITY] ${message}`, meta);
};

logger.audit = (action, pseudo, meta = {}) => {
  logger.info(`[AUDIT] ${action} by ${pseudo}`, meta);
};

module.exports = logger;
