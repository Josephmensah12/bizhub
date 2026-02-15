const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const assetRoutes = require('./routes/assetRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const mappingPresetRoutes = require('./routes/mappingPresetRoutes');
const exchangeRateRoutes = require('./routes/exchangeRateRoutes');
const importBatchRoutes = require('./routes/importBatchRoutes');
const customerRoutes = require('./routes/customerRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const returnRoutes = require('./routes/returnRoutes');
const companyProfileRoutes = require('./routes/companyProfileRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
// const productModelRoutes = require('./routes/productModelRoutes');
// const bulkStockRoutes = require('./routes/bulkStockRoutes');
// const preorderRoutes = require('./routes/preorderRoutes');
// const warrantyRoutes = require('./routes/warrantyRoutes');
// const repairRoutes = require('./routes/repairRoutes');
const reportRoutes = require('./routes/reportRoutes');
const storefrontRoutes = require('./routes/storefrontRoutes');
const stockTakeRoutes = require('./routes/stockTakeRoutes');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API version prefix
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'BIZHUB API is running',
    version: API_VERSION,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/assets`, assetRoutes);
app.use(`${API_BASE}/dashboard`, dashboardRoutes);
app.use(`${API_BASE}/mapping-presets`, mappingPresetRoutes);
app.use(`${API_BASE}/exchange-rates`, exchangeRateRoutes);
app.use(`${API_BASE}/import-batches`, importBatchRoutes);
app.use(`${API_BASE}/customers`, customerRoutes);
app.use(`${API_BASE}/invoices`, invoiceRoutes);
app.use(`${API_BASE}/returns`, returnRoutes);
app.use(`${API_BASE}/company-profile`, companyProfileRoutes);
app.use(`${API_BASE}/payments`, paymentRoutes);
app.use(`${API_BASE}/users`, userRoutes);
// app.use(`${API_BASE}/product-models`, productModelRoutes);
// app.use(`${API_BASE}/bulk-stock`, bulkStockRoutes);
// app.use(`${API_BASE}/preorders`, preorderRoutes);
// app.use(`${API_BASE}/warranties`, warrantyRoutes);
// app.use(`${API_BASE}/repair-tickets`, repairRoutes);
app.use(`${API_BASE}/reports`, reportRoutes);
app.use(`${API_BASE}/storefront`, storefrontRoutes);
app.use(`${API_BASE}/stock-takes`, stockTakeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`
    }
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
