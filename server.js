const http = require('http')
const { WebSocketServer } = require('ws')

const PORT = Number(process.env.PORT) || 8080
const TABLE_TTL_MS = 24 * 60 * 60 * 1000

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('dm-table websocket relay\n')
})

const wss = new WebSocketServer({ server })
const clients = new Map()
const tables = new Map()

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

const sendToClient = (ws, message) => {
  if (!ws || ws.readyState !== ws.OPEN) return
  const payload = typeof message === 'string' ? message : JSON.stringify(message)
  ws.send(payload)
}

const getTable = (tableId) => {
  if (!tableId) return null
  const existing = tables.get(tableId)
  if (existing) return existing
  const next = { state: null, leaderId: null, lastUpdated: Date.now(), rev: 0 }
  tables.set(tableId, next)
  return next
}

const touchTable = (tableId) => {
  const table = getTable(tableId)
  if (!table) return null
  table.lastUpdated = Date.now()
  return table
}

const listTables = () => {
  const now = Date.now()
  const items = []
  for (const [id, table] of tables.entries()) {
    if (now - table.lastUpdated > TABLE_TTL_MS) continue
    items.push({ id, lastUpdated: table.lastUpdated, hasState: Boolean(table.state) })
  }
  items.sort((a, b) => b.lastUpdated - a.lastUpdated)
  return items
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
      sendToClient(ws, { type: 'joined', tableId })
      const table = touchTable(tableId)
      if (table?.state) {
        sendToClient(ws, { type: 'state', tableId, payload: table.state, sender: 'server' })
      }
      return
    }

    if (message.type === 'list') {
      sendToClient(ws, { type: 'list', items: listTables() })
      return
    }

    if (message.type === 'request_state') {
      const tableId = typeof message.tableId === 'string' ? message.tableId : null
      const table = touchTable(tableId)
      if (table?.state) {
        sendToClient(ws, { type: 'state', tableId, payload: table.state, sender: 'server' })
      }
      return
    }

    if (message.type === 'claim') {
      const tableId = typeof message.tableId === 'string' ? message.tableId : null
      const clientId = typeof message.clientId === 'string' ? message.clientId : null
      const table = touchTable(tableId)
      if (!table) return
      if (!table.leaderId || table.leaderId === clientId) {
        table.leaderId = clientId
        sendToClient(ws, { type: 'leader', ok: true, leaderId: clientId })
      } else {
        sendToClient(ws, { type: 'leader', ok: false, leaderId: table.leaderId })
      }
      return
    }

    if (message.type === 'state') {
      const info = clients.get(ws)
      const tableId = message.tableId ?? info?.tableId
      const payload = message.payload ?? null
      const sender = info?.clientId ?? null
      const table = getTable(tableId)
      if (!table || !payload) return
      if (table.leaderId && sender !== table.leaderId) return
      const incomingRev = payload?.table?.rev ?? 0
      if (incomingRev <= table.rev) return
      table.rev = incomingRev
      table.state = payload
      table.lastUpdated = Date.now()
      broadcastToRoom(tableId, { type: 'state', tableId, payload, sender }, ws)
    }
  })

  ws.on('close', () => {
    const info = clients.get(ws)
    if (info?.tableId) {
      const table = tables.get(info.tableId)
      if (table?.leaderId && table.leaderId === info.clientId) {
        table.leaderId = null
      }
    }
    clients.delete(ws)
  })
})

setInterval(() => {
  const now = Date.now()
  for (const [tableId, table] of tables.entries()) {
    if (now - table.lastUpdated > TABLE_TTL_MS) {
      tables.delete(tableId)
    }
  }
}, 5 * 60 * 1000)

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ws relay listening on :${PORT}`)
})
