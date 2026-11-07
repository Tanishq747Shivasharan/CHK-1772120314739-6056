require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createRateLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

if (ALLOWED_ORIGINS.includes('*')) {
  throw new Error('CORS_ORIGIN must list specific trusted origins; wildcard origins are not allowed.');
}

app.set('trust proxy', false);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';"
  });
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true)
    }
    const error = new Error('Origin is not allowed')
    error.status = 403
    return callback(error)
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));

const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  message: 'Too many API requests. Please try again later.'
});
app.use('/api', apiRateLimiter);
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 50 }));

const authRoutes = require('./routes/auth');
const donorRoutes = require('./routes/donors');
const ngoRoutes = require('./routes/ngos');
const listingRoutes = require('./routes/listings');
const claimRoutes = require('./routes/claims');
const deliveryRoutes = require('./routes/deliveries');
const impactRoutes = require('./routes/impact');
const geocodeRoutes = require('./routes/geocode');
const adminRoutes = require('./routes/admin');

app.get('/', (req, res) => {
  res.json({
    service: 'Extra-to-Essential API',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/ngos', ngoRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/impact', impactRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
});

const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: false
  }
});

const { supabase } = require('./config/supabaseClient');
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token) return next(new Error('Unauthorized'));
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return next(new Error('Unauthorized'));
    socket.data.userId = user.id;
    return next();
  } catch (_) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user_${socket.data.userId}`);
});

app.set('io', io);

app.use((err, req, res, next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
    ? err.status
    : 500;
  if (status >= 500) console.error('Unhandled API error:', err.name || 'Error');
  res.status(status).json({
    error: status === 413 ? 'Request too large' : status === 500 ? 'Internal Server Error' : 'Request rejected',
    message: status === 413 ? 'The request body exceeds the allowed size.' : 'The request could not be completed.'
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log('='.repeat(60));
  console.log('Smart Surplus Food Redistribution System');
  console.log('='.repeat(60));
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API Base URL: http://localhost:${PORT}`);
  console.log('='.repeat(60));
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

module.exports = app;
