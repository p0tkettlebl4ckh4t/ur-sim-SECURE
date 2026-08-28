'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');
const httpProxy = require('http-proxy');

const pin = process.env.NOVNC_PIN;
const port = Number(process.env.PORT || 8080);
const upstream = process.env.NOVNC_UPSTREAM || 'http://ursim:6080';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const sessions = new Map();

if (!/^\d{4}$/.test(pin || '')) {
	throw new Error('NOVNC_PIN must contain exactly four digits');
}

const proxy = httpProxy.createProxyServer({ target: upstream, ws: true, changeOrigin: true });

proxy.on('error', (_error, _req, res) => {
	if (res && typeof res.writeHead === 'function' && !res.headersSent) {
		res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '2' });
	}
	if (res && typeof res.end === 'function') {
		res.end('Simulator is starting. Retry shortly.\n');
	}
});

function cookies(req) {
	return Object.fromEntries((req.headers.cookie || '').split(';').map((value) => value.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2));
}

function authenticated(req) {
	const id = cookies(req).ursim_session;
	const expires = id && sessions.get(id);
	if (!expires || expires <= Date.now()) {
		if (id) sessions.delete(id);
		return false;
	}
	sessions.set(id, Date.now() + sessionLifetimeMs);
	return true;
}

function secureRequest(req) {
	return Boolean(req.socket.encrypted) || (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function send(res, status, body, contentType = 'text/plain; charset=utf-8', headers = {}) {
	res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', ...headers });
	res.end(body);
}

function loginPage(res) {
	const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>URSim access</title><style>body{font-family:system-ui,sans-serif;background:#101820;color:#f2f4f6;display:grid;place-items:center;min-height:100vh;margin:0}main{background:#1b2836;padding:2rem;border-radius:.75rem;box-shadow:0 1rem 3rem #0008}label,input,button{display:block;font:inherit}input{margin:.75rem 0;padding:.65rem;font-size:1.25rem;letter-spacing:.4rem;width:8rem}button{padding:.65rem 1rem;cursor:pointer}</style></head><body><main><h1>URSim</h1><form method="post" action="/unlock"><label for="pin">Four-digit access PIN</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="one-time-code"><button type="submit">Unlock</button></form></main></body></html>';
	send(res, 200, html, 'text/html; charset=utf-8');
}

function proxyPath(req) {
	req.url = req.url.slice('/novnc'.length) || '/';
}

function protectedProxyPath(pathname) {
	return pathname === '/websockify' || pathname === '/novnc' || pathname.startsWith('/novnc/');
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	if (req.method === 'GET' && url.pathname === '/') {
		loginPage(res);
		return;
	}
	if (req.method === 'POST' && url.pathname === '/unlock') {
		let body = '';
		req.setEncoding('utf8');
		req.on('data', (chunk) => {
			body += chunk;
			if (body.length > 1024) req.destroy();
		});
		req.on('end', () => {
			const candidate = new URLSearchParams(body).get('pin') || '';
			const validShape = /^\d{4}$/.test(candidate);
			const valid = validShape && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(pin));
			if (!valid) {
				send(res, 401, 'Access denied.\n');
				return;
			}
			const id = crypto.randomBytes(32).toString('base64url');
			sessions.set(id, Date.now() + sessionLifetimeMs);
			const secure = secureRequest(req) ? '; Secure' : '';
			send(res, 302, '', 'text/plain; charset=utf-8', { Location: '/novnc/vnc.html?autoconnect=true&resize=scale&path=novnc%2Fwebsockify', 'Set-Cookie': `ursim_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeMs / 1000}${secure}` });
		});
		return;
	}
	if (protectedProxyPath(url.pathname)) {
		if (!authenticated(req)) {
			send(res, 401, 'Authentication required.\n');
			return;
		}
		if (url.pathname === '/novnc' || url.pathname.startsWith('/novnc/')) proxyPath(req);
		proxy.web(req, res);
		return;
	}
	send(res, 404, 'Not found.\n');
});

server.on('upgrade', (req, socket, head) => {
	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	if (!protectedProxyPath(url.pathname) || !authenticated(req)) {
		socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
		socket.destroy();
		return;
	}
	if (url.pathname === '/novnc' || url.pathname.startsWith('/novnc/')) proxyPath(req);
	proxy.ws(req, socket, head);
});

setInterval(() => {
	const now = Date.now();
	for (const [id, expires] of sessions) {
		if (expires <= now) sessions.delete(id);
	}
}, 10 * 60 * 1000).unref();

server.listen(port, '0.0.0.0', () => {
	process.stdout.write(`URSim portal listening on port ${port}\n`);
});
