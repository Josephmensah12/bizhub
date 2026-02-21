import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'http://bizhub.railway.internal:3000';

// Proxy /api requests to the backend (pathFilter keeps the /api prefix)
app.use(createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathFilter: '/api',
}));

// Serve static files from the Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`API proxy -> ${API_URL}`);
});
