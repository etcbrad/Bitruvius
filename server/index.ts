import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { serveStatic } from './static';
import { storageRoutes } from './storage';
import { apiRoutes } from './routes';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);
app.use('/storage', storageRoutes);

(async () => {
  if (process.env.NODE_ENV === 'production') {
    app.use('/', serveStatic);
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
    });
  } else {
    const { setupVite } = await import('./vite');
    await setupVite(server, app);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
