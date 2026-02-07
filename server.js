const http = require('http')
const { WebSocketServer } = require('ws')

const PORT = Number(process.env.PORT) || 8080

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('dm-table websocket relay\n')
})

const wss = new WebSocketServer({ server })
const clients = new Map()

const broadcastToRoom = (tableId, message, exclude) => {
  if (!tableId) return
  const payload = typeof message === 'string' ? message : JSON.stringify(message)
  for (const [ws, info] of clients.entries()) {
    if (ws.readyState !== ws.OPEN) continue
    if (info.tableId !== tableId) continue
    if (exclude && ws === exclude) continue
    ws.send(payload)
  }
}

wss.on('connection', (ws) => {
  clients.set(ws, { tableId: null, clientId: null })

  ws.on('message', (data) => {
    let message
    try {
      message = JSON.parse(String(data))
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return

    if (message.type === 'join') {
      const tableId = typeof message.tableId === 'string' ? message.tableId : null
      const clientId = typeof message.clientId === 'string' ? message.clientId : null
      clients.set(ws, { tableId, clientId })
      ws.send(JSON.stringify({ type: 'joined', tableId }))
      return
    }

    if (message.type === 'broadcast') {
      const info = clients.get(ws)
      const tableId = message.tableId ?? info?.tableId
      const payload = message.payload ?? null
      broadcastToRoom(tableId, { type: 'broadcast', tableId, payload }, ws)
      return
    }

    if (message.type === 'state') {
      const info = clients.get(ws)
      const tableId = message.tableId ?? info?.tableId
      const payload = message.payload ?? null
      const sender = info?.clientId ?? null
      broadcastToRoom(tableId, { type: 'state', tableId, payload, sender }, ws)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
  })
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ws relay listening on :${PORT}`)
})
