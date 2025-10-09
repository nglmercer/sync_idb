# 📦 Stock WebSocket System

Sistema de sincronización de stock en tiempo real usando WebSockets con Hono + Bun + TypeScript.

## 🚀 Inicio Rápido

### Instalación de dependencias:
```sh
bun install
```

### Ejecutar en desarrollo:
```sh
bun run dev
```

### Servidor disponible en:
- **HTTP:** http://localhost:3000
- **WebSocket:** ws://localhost:3000/ws/stock

---

## 📋 Características

✅ **Sincronización en tiempo real** entre múltiples clientes  
✅ **Validación multinivel** (formato, tipos, negocio)  
✅ **TypeScript completo** con tipos estrictos  
✅ **Prevención de echo** (el emisor no recibe su propio mensaje)  
✅ **Manejo de errores** robusto con feedback al cliente  
✅ **API REST + WebSocket** para máxima flexibilidad  
✅ **Identificación de clientes** con IDs únicos  
✅ **Limpieza automática** de conexiones muertas  

---

## 🔌 WebSocket Events

### Eventos de Stock

| Evento | Descripción | Datos |
|--------|-------------|-------|
| `stock:update` | Actualizar stock absoluto | `[{ productId: number, stock: number }]` |
| `stock:add` | Añadir cantidad al stock | `[{ productId: number, quantity: number }]` |
| `stock:subtract` | Restar cantidad del stock | `[{ productId: number, quantity: number }]` |
| `stock:sync` | Sincronización completa | `[{ productId: number, stock: number }]` |
| `stock:error` | Error en operación | `{ error: string, reason: string }` |

---

## 📡 Uso del WebSocket

### Cliente (JavaScript/TypeScript)

```javascript
// Conectar al WebSocket
const ws = new WebSocket('ws://localhost:3000/ws/stock');

ws.onopen = () => {
  console.log('✅ Conectado al servidor');
  
  // Enviar actualización de stock
  ws.send(JSON.stringify({
    event: 'stock:update',
    data: [
      { productId: 1, stock: 50 },
      { productId: 2, stock: 30 }
    ]
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  // Manejar errores
  if (message.event === 'stock:error') {
    console.error('❌ Error:', message.data.reason);
    return;
  }
  
  // Procesar actualización
  console.log(`📦 Evento: ${message.event}`);
  console.log(`👤 Emisor: ${message.clientId}`);
  console.log(`📊 Datos:`, message.data);
  
  // Actualizar UI según el evento
  switch(message.event) {
    case 'stock:update':
      updateStockInUI(message.data);
      break;
    case 'stock:add':
      incrementStockInUI(message.data);
      break;
    case 'stock:subtract':
      decrementStockInUI(message.data);
      break;
    case 'stock:sync':
      syncAllStockInUI(message.data);
      break;
  }
};

ws.onerror = (error) => {
  console.error('❌ Error en WebSocket:', error);
};

ws.onclose = () => {
  console.log('🔌 Desconectado del servidor');
};
```

### Ejemplos de Mensajes

**Actualizar stock:**
```json
{
  "event": "stock:update",
  "data": [
    { "productId": 1, "stock": 100 }
  ]
}
```

**Añadir stock:**
```json
{
  "event": "stock:add",
  "data": [
    { "productId": 1, "quantity": 50 }
  ]
}
```

**Restar stock:**
```json
{
  "event": "stock:subtract",
  "data": [
    { "productId": 1, "quantity": 10 }
  ]
}
```

---

## 🌐 API REST Endpoints

### Actualizar Stock
```http
POST /api/stock/update
Content-Type: application/json

{
  "updates": [
    { "productId": 1, "stock": 75 }
  ]
}
```

**Respuesta:**
```json
{
  "success": true,
  "sentTo": 3,
  "updates": 1
}
```

### Añadir Stock
```http
POST /api/stock/add
Content-Type: application/json

{
  "additions": [
    { "productId": 1, "quantity": 25 }
  ]
}
```

### Restar Stock
```http
POST /api/stock/subtract
Content-Type: application/json

{
  "subtractions": [
    { "productId": 1, "quantity": 5 }
  ]
}
```

### Sincronizar Stock
```http
POST /api/stock/sync
Content-Type: application/json

{
  "stockData": [
    { "productId": 1, "stock": 100 },
    { "productId": 2, "stock": 50 }
  ]
}
```

### Estado del Servidor
```http
GET /api/stock/status
```

**Respuesta:**
```json
{
  "connectedClients": 5,
  "timestamp": "2025-10-08T10:30:00.000Z"
}
```

---

## ⚙️ Configuración del Validador

Puedes configurar un validador personalizado para verificar las operaciones antes de propagarlas:

```typescript
// src/index.ts
import { stockWsManager } from './websocket/stockManager';

stockWsManager.setValidator(async (event, data) => {
  // Validar contra base de datos
  if (event === 'stock:update') {
    const updates = data as StockUpdate[];
    
    for (const update of updates) {
      // Verificar que el producto existe
      const product = await db.products.findById(update.productId);
      if (!product) {
        return { 
          valid: false, 
          error: `Producto ${update.productId} no encontrado` 
        };
      }
      
      // Validar stock mínimo
      if (update.stock < 0) {
        return { 
          valid: false, 
          error: 'Stock no puede ser negativo' 
        };
      }
    }
  }
  
  if (event === 'stock:subtract') {
    const subtractions = data as StockSubtraction[];
    
    for (const sub of subtractions) {
      // Verificar stock suficiente
      const currentStock = await db.products.getStock(sub.productId);
      if (currentStock < sub.quantity) {
        return { 
          valid: false, 
          error: `Stock insuficiente para producto ${sub.productId}` 
        };
      }
    }
  }
  
  return { valid: true };
});
```

---

## 🏗️ Estructura del Proyecto

```
├── src/
│   ├── index.ts                    # Servidor principal
│   ├── types/
│   │   └── stock.ts                # Tipos TypeScript
│   ├── websocket/
│   │   └── stockManager.ts         # Manager de WebSocket
│   └── routes/
│       ├── backupRoute.ts          # Rutas de backup
│       └── syncRoute.ts            # Rutas de sync
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔐 Validaciones

### Nivel 1: Formato
- Verifica que el mensaje sea JSON válido
- Valida estructura del mensaje
- Comprueba que el evento sea válido

### Nivel 2: Tipos
- Valida tipos de datos (number, string, etc.)
- Verifica que los arrays no estén vacíos
- Asegura valores positivos donde corresponda

### Nivel 3: Negocio
- Verificación en base de datos
- Validación de permisos
- Reglas de negocio personalizadas
- Stock suficiente para restas

---

## 🛡️ Manejo de Errores

Cuando una operación falla, el servidor envía un mensaje de error al cliente:

```json
{
  "event": "stock:error",
  "data": {
    "error": "Validation failed",
    "reason": "Stock insuficiente para producto 1",
    "originalEvent": "stock:subtract"
  },
  "timestamp": "2025-10-08T10:30:00.000Z",
  "clientId": "client_1234567890_abc123"
}
```

---

## 📊 Ejemplo de Uso Programático

### Desde el Servidor

```typescript
import { stockWsManager } from './websocket/stockManager';

// Actualizar stock después de una venta
stockWsManager.broadcastStockUpdate([
  { productId: 1, stock: 50 }
]);

// Añadir stock después de una compra
stockWsManager.broadcastStockAddition([
  { productId: 1, quantity: 100 }
]);

// Restar stock después de una venta
stockWsManager.broadcastStockSubtraction([
  { productId: 1, quantity: 5 }
]);
```

---

## 🧪 Testing con cURL

### Actualizar Stock
```bash
curl -X POST http://localhost:3000/api/stock/update \
  -H "Content-Type: application/json" \
  -d '{"updates":[{"productId":1,"stock":100}]}'
```

### Ver Estado
```bash
curl http://localhost:3000/api/stock/status
```

---

## 🔧 CORS Configurado

El servidor acepta peticiones desde:
- `http://localhost:3000`
- `http://localhost:4321`
- `http://localhost:5173`

Para modificar los orígenes permitidos, edita:
```typescript
// src/index.ts
app.use('*', cors({
  origin: ['http://localhost:3000', 'tu-otro-origen'],
  // ...
}));
```

---

## 📝 Notas Importantes

- ⚠️ **No hay límite de rate** implementado por defecto
- 🔒 **No hay autenticación** implementada por defecto
- 📦 Los mensajes se propagan **excepto al emisor**
- 🧹 Las conexiones muertas se limpian automáticamente
- 🔄 El validador es **opcional** pero recomendado