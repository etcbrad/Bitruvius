import express from 'express';
import { createServer } from 'http';
import path from 'path';
import multer from 'multer';
import { serveStatic } from './static';
import { storageRoutes } from './storage';
import { apiRoutes } from './routes';

const app = express();
const server = createServer(app);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

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
      return port;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "EADDRINUSE" && allowPortFallback && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new Error("Failed to find an available port");
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);
app.use('/storage', storageRoutes);

// Multi-file upload endpoint
app.post('/api/segment_multi', upload.array('images', 10), async (req, res) => {
  try {
    // Safe type assertion with validation
    const files = req.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    // Validate file types and check for malicious content
    for (const file of files) {
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: `Invalid file type: ${file.mimetype}. Only images are allowed.` });
      }
      
      // Additional validation: check file signature (magic bytes)
      const buffer = file.buffer;
      if (!buffer || buffer.length < 4) {
        return res.status(400).json({ error: `Invalid image file: ${file.originalname}` });
      }
      
      // Basic image signature validation
      const signature = buffer.subarray(0, 4);
      const isValidImage = 
        signature[0] === 0x89 && signature[1] === 0x50 && signature[2] === 0x4E && signature[3] === 0x47 || // PNG
        signature[0] === 0xFF && signature[1] === 0xD8 && signature[2] === 0xFF || // JPEG
        signature[0] === 0x47 && signature[1] === 0x49 && signature[2] === 0x46; // GIF
        
      if (!isValidImage) {
        return res.status(400).json({ error: `Invalid image format: ${file.originalname}` });
      }
    }

    // Add error handling for dynamic import
    let segmentSheetFromFile;
    try {
      const sheetParser = await import('../client/src/app/sheetParser');
      segmentSheetFromFile = sheetParser.segmentSheetFromFile;
    } catch (importError) {
      console.error('Failed to import sheetParser:', importError);
      return res.status(500).json({ error: 'Image processing service unavailable' });
    }

    if (!segmentSheetFromFile || typeof segmentSheetFromFile !== 'function') {
      return res.status(500).json({ error: 'Image processing function not available' });
    }

    const parsed = parseInt(req.body.min_area);
    const minArea = Number.isNaN(parsed) ? 500 : parsed;
    const pieces: Array<{
      id: string;
      src: string;
      width: number;
      height: number;
      bounds: { x: number; y: number; width: number; height: number };
      area: number;
      thumbnail: string;
      anchors: any[];
    }> = [];
    let totalShapes = 0;

    // Process each uploaded file with memory-efficient approach
    for (const file of files) {
      try {
        // Create File object directly from buffer without intermediate conversions
        const fileObj = new File([new Uint8Array(file.buffer)], file.originalname, { type: file.mimetype });
        
        const result = await segmentSheetFromFile(fileObj, {
          minSegmentArea: minArea,
          threshold: 160,
          padding: 3,
          featherRadius: 2,
          edgeTolerance: 20,
        });

        // Convert segments to pieces format
        result.segments.forEach((segment: any, index: number) => {
          pieces.push({
            id: `piece_${Date.now()}_${totalShapes++}`,
            src: result.src,
            width: segment.bounds.width,
            height: segment.bounds.height,
            bounds: segment.bounds,
            area: segment.area,
            thumbnail: segment.thumbnail,
            anchors: [], // Will be populated by anchor detection
          });
        });
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        // Continue processing other files
      }
    }

    res.json({
      pieces,
      count: pieces.length,
      processed: files.length,
    });
  } catch (error) {
    console.error('Segmentation error:', error);
    res.status(500).json({ error: 'Failed to process images' });
  }
});

// Export upload middleware for use in routes
export { upload };

(async () => {
  if (process.env.NODE_ENV === 'production') {
    app.use('/', serveStatic);
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/public/index.html'));
    });
  }

  const port = await listenWithFallback(requestedPort);

  if (process.env.NODE_ENV !== 'production') {
    const { setupVite } = await import('./vite');
    await setupVite(server, app, port);
  }
})();
