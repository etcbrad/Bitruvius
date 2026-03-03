import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { serveStatic } from './static';
import { storageRoutes } from './storage';
import { apiRoutes } from './routes';

const app = express();
const server = createServer(app);
const parsedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : NaN;
const requestedPort = Number.isFinite(parsedPort) ? parsedPort : 5000;
const allowPortFallback = !process.env.PORT;

async function listenWithFallback(initialPort: number) {
  const maxAttempts = allowPortFallback ? 20 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = initialPort + attempt;
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: NodeJS.ErrnoException) => reject(err);
        server.once("error", onError);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", onError);
          resolve();
        });
      });

      if (port !== initialPort) {
        console.warn(
          `Port ${initialPort} was unavailable; using port ${port} instead.`,
        );
      }
      console.log(`Server running on port ${port}`);
      return;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EADDRINUSE" && allowPortFallback && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }
}

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

  await listenWithFallback(requestedPort);
})();
