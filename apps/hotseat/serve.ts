/**
 * Zero-dependency dev server for the hot-seat prototype.
 *
 * Serves index.html and, for any .ts file under apps/hotseat/src or
 * packages/engine/src, strips the types with Node's built-in
 * module.stripTypeScriptTypes and serves the result as an ES module. The
 * browser therefore runs the engine source directly — no bundler, no copy.
 * Static files (css, svg, images, fonts) are served from apps/hotseat/assets.
 *
 *   node --no-warnings apps/hotseat/serve.ts   →  http://localhost:8080
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const port = Number(process.env['PORT'] ?? 8080);

/** URL prefix → directory on disk. Nothing outside these three roots is served. */
const roots: readonly { readonly prefix: string; readonly dir: string }[] = [
  { prefix: '/packages/engine/src/', dir: join(repoRoot, 'packages', 'engine', 'src') },
  { prefix: '/src/', dir: join(here, 'src') },
  { prefix: '/assets/', dir: join(here, 'assets') },
];

/** Static content types served from /assets/. Anything else under /assets/ is refused. */
const staticTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function resolvePath(url: string): string | null {
  if (url === '/' || url === '/index.html') return join(here, 'index.html');
  for (const root of roots) {
    if (!url.startsWith(root.prefix)) continue;
    const rel = normalize(url.slice(root.prefix.length));
    if (rel.startsWith('..') || rel.includes(`${sep}..`)) return null;
    return join(root.dir, rel);
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0] ?? '/';
  const file = resolvePath(url);
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    // Read (and transform) fully before writing any header, so a failure can still answer 404/500.
    let type: string | undefined;
    let body: string | Buffer;
    if (file.endsWith('.ts')) {
      type = 'text/javascript; charset=utf-8';
      body = stripTypeScriptTypes(await readFile(file, 'utf8'), { mode: 'strip' });
    } else if (file.endsWith('.html')) {
      type = 'text/html; charset=utf-8';
      body = await readFile(file, 'utf8');
    } else {
      type = url.startsWith('/assets/') ? staticTypes[extname(file).toLowerCase()] : undefined;
      if (!type) {
        res.writeHead(404).end('not found');
        return;
      }
      body = await readFile(file);
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') res.writeHead(404).end('not found');
    else res.writeHead(500).end(`error serving ${url}: ${(err as Error).message}`);
  }
});

server.listen(port, () => {
  console.log(`Fortune District hot-seat prototype → http://localhost:${port}`);
});
