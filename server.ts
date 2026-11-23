import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';

const PORT = Number(process.env.PORT || 3000);
const PYTHON_PORT = Number(process.env.PYTHON_API_PORT || 8001);
const PYTHON_URL = `http://127.0.0.1:${PYTHON_PORT}`;
const IS_PROD = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));
const DEMO_MODE =
  process.env.NODE_ENV !== 'production' &&
  (process.env.SALON_DEMO_MODE === 'true' || process.argv.includes('--demo'));

let pythonProc: ChildProcess | null = null;

function startPythonBackend(): ChildProcess {
  const scriptPath = path.resolve(process.cwd(), 'backend/salon_api.py');
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(pythonCommand, [scriptPath], {
    env: {
      ...process.env,
      PYTHON_API_PORT: String(PYTHON_PORT),
      SALON_DEMO_MODE: String(DEMO_MODE),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[python] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[python:err] ${chunk.toString()}`);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[python] exited unexpectedly with code ${code}`);
    }
  });

  return child;
}

async function waitForPython(maxWaitMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${PYTHON_URL}/api/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error('Python backend failed to respond on /api/health');
}

async function proxyToPython(req: Request, res: Response): Promise<void> {
  const targetUrl = `${PYTHON_URL}${req.originalUrl}`;
  const isEventStream = req.path === '/api/events';
  const abortController = isEventStream ? new AbortController() : null;
  const headers: Record<string, string> = {};
  if (req.headers['content-type']) {
    headers['content-type'] = String(req.headers['content-type']);
  }
  if (req.headers.cookie) {
    headers.cookie = req.headers.cookie;
  }
  if (req.headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = String(req.headers['x-forwarded-proto']);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    ...(abortController ? { signal: abortController.signal } : {}),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : req.body && Object.keys(req.body).length > 0
          ? JSON.stringify(req.body)
          : undefined;
    if (rawBody !== undefined) {
      init.body = rawBody;
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }
  }

  try {
    const upstream = await fetch(targetUrl, init);
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    const disposition = upstream.headers.get('content-disposition');
    const setCookie = upstream.headers.get('set-cookie');
    if (contentType) res.setHeader('Content-Type', contentType);
    if (disposition) res.setHeader('Content-Disposition', disposition);
    if (setCookie) res.setHeader('Set-Cookie', setCookie);

    if (isEventStream && upstream.body) {
      res.setHeader('Cache-Control', contentType ? (upstream.headers.get('cache-control') || 'no-cache') : 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.on('close', () => abortController?.abort());
      try {
        for await (const chunk of upstream.body) {
          if (!res.write(Buffer.from(chunk))) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
          }
        }
      } catch (err) {
        if (!res.destroyed) console.error('Workspace event stream ended:', err);
      } finally {
        if (!res.destroyed) res.end();
      }
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('Python proxy error:', err);
    res.status(502).json({ error: 'Python Salon API is temporarily unavailable.' });
  }
}

async function bootstrap(): Promise<void> {
  pythonProc = startPythonBackend();
  await waitForPython();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.all('/api/*', (req, res) => {
    void proxyToPython(req, res);
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Salon Pro full-stack server running at http://0.0.0.0:${PORT}`);
  });

  const shutdown = () => {
    server.close();
    if (pythonProc && !pythonProc.killed) {
      pythonProc.kill('SIGTERM');
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Failed to start Salon Pro server:', err);
  if (pythonProc && !pythonProc.killed) {
    pythonProc.kill('SIGTERM');
  }
  process.exit(1);
});
