/* Panel "Amigos" de openGym — servidor HTTP sin dependencias.
 *
 *   node server.js                 # http://localhost:8770
 *   OPENGYM_DATA=../data           # carpeta data de la instancia (por defecto ../data)
 *   FRIENDS_CONFIG=./friends.json  # config del panel
 *   PORT=8770 HOST=0.0.0.0
 *
 * Lee los state-*.json en SOLO LECTURA y sirve la página + /api/ranking. No escribe nada
 * en la instancia ni necesita credenciales.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadData, buildRanking } from './lib/ranking.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.OPENGYM_DATA || path.join(HERE, '..', 'data')
const CONFIG_PATH = process.env.FRIENDS_CONFIG || path.join(HERE, 'friends.json')
const PUBLIC_DIR = path.join(HERE, 'public')
const PORT = Number(process.env.PORT || 8770)
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (err) {
    return { title: 'Ranking openGym', participants: [], _error: String(err.message || err) }
  }
}

function statOf(file) {
  try {
    const s = fs.statSync(file)
    return `${s.mtimeMs}:${s.size}`
  } catch {
    return '0:0'
  }
}

/** Firma de la carpeta: cambia si toca db.json, algún state-*.json o la config. */
function signature() {
  const parts = [statOf(CONFIG_PATH), statOf(path.join(DATA_DIR, 'db.json'))]
  let files = []
  try { files = fs.readdirSync(DATA_DIR) } catch { /* sin data dir todavía */ }
  for (const f of files.filter(x => /^state-[a-zA-Z0-9_-]+\.json$/.test(x)).sort()) {
    parts.push(f + ':' + statOf(path.join(DATA_DIR, f)))
  }
  return parts.join('|')
}

let cache = { sig: null, body: null, at: 0 }

function rankingJson(norm) {
  const sig = signature() + '|' + norm
  if (cache.sig === sig && cache.body) return cache.body
  const config = readConfig()
  const data = loadData(DATA_DIR)
  const body = JSON.stringify(buildRanking(data, config, new Date(), norm))
  cache = { sig, body, at: Date.now() }
  return body
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': type.startsWith('application/json') ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const file = path.join(PUBLIC_DIR, rel)
  // Sin traversal: el fichero resuelto debe quedar dentro de public/.
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    return send(res, 403, 'forbidden', 'text/plain; charset=utf-8')
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found', 'text/plain; charset=utf-8')
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream')
  })
}

const server = http.createServer((req, res) => {
  let url
  try { url = new URL(req.url, 'http://localhost') } catch { return send(res, 400, 'bad request', 'text/plain; charset=utf-8') }
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/api/ranking') {
    // ?norm=rel normaliza fuerza y volumen por peso corporal (por defecto); ?norm=abs muestra kg.
    const norm = url.searchParams.get('norm') === 'abs' ? 'abs' : 'rel'
    try {
      return send(res, 200, rankingJson(norm))
    } catch (err) {
      return send(res, 500, JSON.stringify({ error: String(err.message || err) }))
    }
  }
  if (pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, data: DATA_DIR, participants: (readConfig().participants || []).filter(p => p.share !== false).length }))
  }
  if (pathname === '/favicon.ico') {
    res.writeHead(204)
    return res.end()
  }
  serveStatic(req, res, pathname)
})

server.listen(PORT, HOST, () => {
  console.log(`openGym · Amigos  →  http://localhost:${PORT}`)
  console.log(`  data:   ${DATA_DIR}`)
  console.log(`  config: ${CONFIG_PATH}`)
})
