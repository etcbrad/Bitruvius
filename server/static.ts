import express from 'express';
import path from 'path';

const staticRouter = express.Router();

// Serve static files from dist/public (built client)
staticRouter.use(express.static(path.join(process.cwd(), 'dist/public')));

export { staticRouter as serveStatic };
