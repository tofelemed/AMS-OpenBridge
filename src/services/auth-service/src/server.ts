/**
 * Auth Service Server
 * Production-ready Express server with security best practices
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import logger from './config/logger';
import promClient from 'prom-client';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============================================================================
// PROMETHEUS METRICS SETUP
// ============================================================================

// Create a Registry for metrics
const register = new promClient.Registry();

// Add default Node.js metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'auth_service_',
});

// HTTP request duration histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'auth_service_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// HTTP requests total counter
const httpRequestTotal = new promClient.Counter({
  name: 'auth_service_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Security middleware
app.use(helmet());

// CORS configuration
// Because we use credentialed requests (httpOnly refresh cookie), the response
// cannot use a wildcard origin — origins must be listed explicitly via CORS_ORIGIN.
const corsOrigins = (process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:5174', 'http://localhost:3000']
).filter(Boolean);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (internal/same-origin, curl, health checks)
    if (!origin) return callback(null, true);

    if (corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
};
app.use(cors(corsOptions));

// Parse cookies (refresh token is delivered as an httpOnly cookie)
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Metrics tracking middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override res.end to capture metrics
  res.end = function (this: any, ...args: any[]) {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const statusCode = res.statusCode.toString();

    // Record metrics
    httpRequestDuration.labels(req.method, route, statusCode).observe(duration);
    httpRequestTotal.labels(req.method, route, statusCode).inc();

    // Call original end function
    // @ts-ignore - TypeScript struggles with rest function signature compatibility
    return originalEnd.apply(this, args);
  };

  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    service: 'auth-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).end();
  }
});

// API routes
app.use('/api/auth', authRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🔐 Auth Service running on port ${PORT}`);
  logger.info(`📊 Health: http://localhost:${PORT}/health`);
  logger.info(`🔑 API: http://localhost:${PORT}/api/auth`);
  logger.info(`🌍 Environment: ${NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default app;

