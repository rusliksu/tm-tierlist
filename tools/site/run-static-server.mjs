import {spawn} from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const command = process.argv.slice(2).join(' ');

if (!command) {
  console.error('Usage: node tools/site/run-static-server.mjs <command>');
  process.exit(1);
}

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(repoRoot, relative);
  if (!target.startsWith(repoRoot + path.sep) && target !== repoRoot) {
    return undefined;
  }
  return target;
}

const server = http.createServer((req, res) => {
  const target = resolveRequestPath(req.url ?? '/');
  if (target === undefined) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': types.get(path.extname(target).toLowerCase()) ?? 'application/octet-stream',
    });
    res.end(data);
  });
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    console.error('Could not allocate a local server port');
    server.close();
    process.exit(1);
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const child = spawn(command, {
    cwd: repoRoot,
    env: {
      ...process.env,
      BUILDER_URL: process.env.BUILDER_URL ?? `${baseUrl}/tierlist-builder.html`,
      SITE_BASE_URL: process.env.SITE_BASE_URL ?? baseUrl,
    },
    shell: true,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    server.close(() => {
      if (signal) {
        console.error(`Command terminated by ${signal}`);
        process.exit(1);
      }
      process.exit(code ?? 1);
    });
  });
});
