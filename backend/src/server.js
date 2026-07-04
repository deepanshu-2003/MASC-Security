import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import setupRoutes from './routes/setupRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import userAuthRoutes from './routes/userAuthRoutes.js';
import authorizationRoutes from './routes/authorizationRoutes.js';
import protectedRoutes from './routes/protectedRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import vaultRoutes from './routes/vaultRoutes.js';
import dynamicFieldRoutes from './routes/dynamicFieldRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import appLayerRoutes from './routes/appLayerRoutes.js';
import applicationRoutes from './routes/applicationRoutes.js';
import routeRuleRoutes from './routes/routeRuleRoutes.js';

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Register custom routes
app.use('/api/v1/setup', setupRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth', userAuthRoutes);
app.use('/api/v1', adminRoutes);
app.use('/api/v1', authorizationRoutes);
app.use('/api/v1/protected', protectedRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/vault', vaultRoutes);
app.use('/api/v1/dynamic-fields', dynamicFieldRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/developer', appLayerRoutes);
app.use('/api/v1', applicationRoutes);
app.use('/api/v1', routeRuleRoutes);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'MASC Security Backend Platform',
    version: '1.0.0'
  });
});

// Root route
app.get('/', (req, res) => {
  res.send('MASC Security Backend API is running.');
});

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MASC Security Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
