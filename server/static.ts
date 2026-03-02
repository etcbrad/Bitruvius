import express from 'express';
import path from 'path';

const staticRouter = express.Router();

// Get the correct path for both ESM and CJS
const getDirname = () => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // Fallback for ESM
  return path.dirname(new URL(import.meta.url).pathname);
};

const serverDir = getDirname();

// Serve static files from dist/public (built client)
staticRouter.use(express.static(path.join(serverDir, '../dist/public')));

export { staticRouter as serveStatic };
