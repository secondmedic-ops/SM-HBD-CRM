// Local development (npm run dev): the Vite frontend on http://localhost:3000, and /api/v1 forwarded to the API
// Worker started by RUN-LOCAL-TEST.bat (wrangler dev on :8787, in-memory test database, login off).
// Production does not use this file: one Cloudflare Worker serves both the frontend and the API.
import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
app.use(express.json({ limit: '5mb' }));

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8787';
app.use('/api/v1', async (req, res) => {
  try {
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
    const upstream = await fetch(BACKEND_URL + req.originalUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Pass the login token through, so a local API with login on behaves like production.
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
    });
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ status: 502, error: 'Bad Gateway', message: `API not reachable at ${BACKEND_URL}. Start RUN-LOCAL-TEST.bat.` });
  }
});

async function startServer() {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`Server running on http://localhost:${port}`));
}

startServer();
