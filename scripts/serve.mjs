// Serves src/ for desktop preview. Arrow keys + Enter navigate, Esc/Backspace = Back.
import { createServer } from 'node:http';
import { readFile, writeFile, access } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'src');

// index.html always loads the gitignored local overrides; make sure there is something to load.
const localConfig = join(root, 'js', 'config.local.js');
try {
    await access(localConfig);
} catch {
    await writeFile(localConfig, '/* No local overrides. See config.local.example.js. */\n');
}
const port = Number(process.env.PORT) || 8080;
const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml'
};

// The Fazilet backend sends no CORS headers, so the browser cannot call it directly; on the TV
// the widget's <access origin="*"> covers it. js/prayer.js uses this path in the preview.
const FAZILET = 'https://backend.fazilettakvimi.com/content/public';

async function proxyFazilet(url, res) {
    try {
        const upstream = await fetch(FAZILET + url.pathname.slice('/fazilet'.length) + url.search);
        res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
        res.writeHead(502).end();
    }
}

createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/fazilet/')) {
        await proxyFazilet(url, res);
        return;
    }
    const path = decodeURIComponent(url.pathname);
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
    }
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, '127.0.0.1', () => {
    console.log(`Preview: http://localhost:${port}`);
});
