# dm-table WebSocket relay

Render向けの最小WebSocketリレーです。サーバーは状態を保持せず、同じtableIdのクライアントへ中継します。

## Renderでのデプロイ
1. この`ws-server`を別リポジトリに切り出すか、Rootを`ws-server`に指定してRenderに接続。
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Environment: `PORT`は自動で付与されます。

## 送受信フォーマット
JSONのみを想定しています。

### join
```
{ "type": "join", "tableId": "demo", "clientId": "client-1" }
```

### broadcast（任意のペイロード）
```
{ "type": "broadcast", "tableId": "demo", "payload": { ... } }
```

### state（TableStateなど）
```
{ "type": "state", "tableId": "demo", "payload": { ... } }
```

サーバーは同じ`tableId`の他クライアントに中継します。
