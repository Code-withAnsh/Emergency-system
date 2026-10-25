import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hackwave-dispatch',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend dist if available (production mode)
const distPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(distPath));

// For SPA routing fallback if dist exists
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Backend] Server listening on http://localhost:${PORT}`);
  });
}

export default app;
