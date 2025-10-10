# 📦 Stock WebSocket System

Sistema de sincronización de stock en tiempo real usando WebSockets con Hono + Bun + TypeScript.

---

## 📚 Tabla de Contenidos

- [Inicio Rápido](#-inicio-rápido)
- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [WebSocket API](#-websocket-api)
- [REST API](#-rest-api)
- [Base de Datos](#-base-de-datos)
- [Validación y Seguridad](#-validación-y-seguridad)
- [Ejemplos de Uso](#-ejemplos-de-uso)
- [Configuración Avanzada](#-configuración-avanzada)

---

## 🚀 Inicio Rápido

### Requisitos Previos
- [Bun](https://bun.sh) v1.0 o superior
- Node.js v18+ (opcional, para desarrollo)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/nglmercer/sync_idb
cd sync_idb

# Instalar dependencias
bun install

# Ejecutar en desarrollo
bun run dev

# Construir para producción
bun run build
```

### Servidor Disponible

- **HTTP:** `http://localhost:3000`
- **WebSocket:** `ws://localhost:3000/ws`
- **API REST:** `http://localhost:3000/api/*`

---

## ✨ Características

### Core
- ✅ **Sincronización en tiempo real** entre múltiples clientes
- ✅ **WebSocket + REST API** para máxima flexibilidad
- ✅ **TypeScript completo** con tipos estrictos
- ✅ **Prevención de echo** (el emisor no recibe su propio mensaje)

### Seguridad y Validación
- ✅ **Validación multinivel** (formato, tipos, negocio)
- ✅ **Manejo de errores robusto** con feedback al cliente
- ✅ **Validador personalizable** para reglas de negocio

### Gestión de Datos
- ✅ **Persistencia JSON** con timestamps automáticos
- ✅ **Backup y Restauración** completos o incrementales
- ✅ **Sincronización diferencial** (solo cambios desde fecha)

### Administración
- ✅ **Identificación de clientes** con IDs únicos
- ✅ **Limpieza automática** de conexiones muertas
- ✅ **Estadísticas en tiempo real** de conexiones y datos

---

## 🏗️ Arquitectura

### Estructura del Proyecto

```
├── src/
│   ├── index.ts                    # Servidor principal + WebSocket
│   ├── types/
│   │   └── stock.ts                # Tipos TypeScript
│   ├── websocket/
│   │   ├── stockManager.ts         # Manager de WebSocket
│   │   └── stockRouter.ts          # API REST para stock
│   ├── modulos/
│   │   └── DefaultDB.ts            # Sistema de persistencia
│   └── routes/
│       ├── backupRoute.ts          # Endpoints de backup
│       └── syncRoute.ts            # Endpoints de sincronización
├── DefaultDB.json                  # Base de datos (auto-generado)
├── package.json
├── tsconfig.json
└── README.md
```

### Flujo de Datos

```
Cliente A                    Servidor                     Cliente B
   │                            │                            │
   │─────stock:update──────────>│                            │
   │                            │──Validación Formato───────>│
   │                            │──Validación Tipos─────────>│
   │                            │──Validación Negocio───────>│
   │                            │──────stock:update─────────>│
   │                            │                            │
   │<────✓ (no recibe echo)     │                            │
   │                            │                            │<─ ✓ Recibido
```

---

## 🔌 WebSocket API

### Conexión

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => console.log('✅ Conectado');
ws.onclose = () => console.log('🔌 Desconectado');
ws.onerror = (error) => console.error('❌ Error:', error);
```

### Eventos de Stock

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `stock:update` | Actualizar stock absoluto | `[{ productId: number, stock: number }]` |
| `stock:add` | Incrementar stock | `[{ productId: number, quantity: number }]` |
| `stock:subtract` | Decrementar stock | `[{ productId: number, quantity: number }]` |
| `stock:sync` | Sincronización completa | `[{ productId: number, stock: number }]` |
| `stock:error` | Notificación de error | `{ error: string, reason: string }` |

### Formato de Mensajes

#### Enviar Actualización
```javascript
ws.send(JSON.stringify({
  event: 'stock:update',
  data: [
    { productId: 1, stock: 100 },
    { productId: 2, stock: 50 }
  ]
}));
```

#### Recibir Actualización
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  console.log(`📦 Evento: ${message.event}`);
  console.log(`👤 Emisor: ${message.clientId}`);
  console.log(`⏰ Timestamp: ${message.timestamp}`);
  console.log(`📊 Datos:`, message.data);
};
```

#### Manejo de Errores
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.event === 'stock:error') {
    console.error('❌ Error:', message.data.reason);
    console.error('Evento original:', message.data.originalEvent);
    return;
  }
  
  // Procesar mensaje normal...
};
```

---

## 🌐 REST API

### Stock Endpoints

#### Actualizar Stock
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

#### Añadir Stock
```http
POST /api/stock/add
Content-Type: application/json

{
  "additions": [
    { "productId": 1, "quantity": 25 }
  ]
}
```

#### Restar Stock
```http
POST /api/stock/subtract
Content-Type: application/json

{
  "subtractions": [
    { "productId": 1, "quantity": 5 }
  ]
}
```

#### Sincronizar Stock
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

#### Estado del Servidor
```http
GET /api/stock/status
```

**Respuesta:**
```json
{
  "connectedClients": 5,
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

---

## 💾 Base de Datos

### Sistema de Persistencia

El sistema utiliza `json-obj-manager` para persistencia en archivos JSON con timestamps automáticos.

#### Estructura de Datos

```typescript
interface TimestampedData {
  id: string;
  created_at: string;    // ISO 8601
  updated_at: string;    // ISO 8601
  [key: string]: any;    // Datos personalizados
}
```

### Endpoints de Sincronización

#### Obtener Todos los Registros
```http
GET /api/sync/:dbName/:storeName
```

**Respuesta:**
```json
{
  "data": [...],
  "count": 150,
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

#### Sincronizar Múltiples Registros (Bulk)
```http
POST /api/sync/:dbName/:storeName
Content-Type: application/json

{
  "data": [
    { "id": "1", "name": "Producto A", "price": 100 },
    { "id": "2", "name": "Producto B", "price": 200 }
  ]
}
```

**Respuesta:**
```json
{
  "success": true,
  "synced": 2,
  "created": 1,
  "updated": 1,
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

#### Actualizar/Crear Registro Individual
```http
PUT /api/sync/:dbName/:storeName/:id
Content-Type: application/json

{
  "name": "Producto Actualizado",
  "price": 150
}
```

#### Actualizar Parcialmente
```http
PATCH /api/sync/:dbName/:storeName/:id
Content-Type: application/json

{
  "price": 175
}
```

#### Eliminar Registro
```http
DELETE /api/sync/:dbName/:storeName/:id
```

#### Cambios Desde Fecha
```http
GET /api/sync/:dbName/:storeName/since/:timestamp
```

**Ejemplo:**
```http
GET /api/sync/DefautlDB/products/since/2025-10-08T00:00:00.000Z
```

#### Estadísticas del Store
```http
GET /api/sync/:dbName/:storeName/stats
```

**Respuesta:**
```json
{
  "total": 150,
  "updatedLast24h": 25,
  "updatedLast7d": 80,
  "oldestRecord": "2025-01-01T00:00:00.000Z",
  "newestRecord": "2025-10-09T10:30:00.000Z",
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

---

## 💾 Backup y Restauración

### Hacer Backup Completo
```http
GET /api/backup/:dbName
```

**Respuesta:**
```json
{
  "database": "DefautlDB",
  "backup": {
    "products": [...],
    "customers": [...]
  },
  "timestamp": "2025-10-09T10:30:00.000Z",
  "stores": ["products", "customers"],
  "totalRecords": 300,
  "metadata": {
    "version": "1.0",
    "created_at": "2025-10-09T10:30:00.000Z"
  }
}
```

### Backup Incremental
```http
GET /api/backup/:dbName/incremental/:since
```

**Ejemplo:**
```http
GET /api/backup/DefautlDB/incremental/2025-10-08T00:00:00.000Z
```

### Restaurar Backup
```http
POST /api/backup/:dbName/restore
Content-Type: application/json

{
  "backup": {
    "products": [...],
    "customers": [...]
  },
  "overwrite": false,
  "mergeStrategy": "newer"
}
```

**Estrategias de Merge:**
- `newer`: Mantener el registro más reciente (basado en `updated_at`)
- `force`: Sobrescribir siempre con el backup
- `skip`: No sobrescribir registros existentes

**Respuesta:**
```json
{
  "success": true,
  "database": "DefautlDB",
  "restored": 50,
  "updated": 30,
  "skipped": 20,
  "stores": ["products", "customers"],
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

### Listar Backups Disponibles
```http
GET /api/backup
```

### Comparar Backup con Estado Actual
```http
POST /api/backup/:dbName/compare
Content-Type: application/json

{
  "backup": {
    "products": [...]
  }
}
```

**Respuesta:**
```json
{
  "database": "DefautlDB",
  "comparison": {
    "products": {
      "onlyInBackup": 10,
      "onlyInCurrent": 5,
      "different": 8,
      "same": 127
    }
  },
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

### Eliminar Base de Datos
```http
DELETE /api/backup/:dbName
```

---

## 🛡️ Validación y Seguridad

### Niveles de Validación

#### Nivel 1: Formato
```typescript
// Verifica automáticamente:
// - JSON válido
// - Estructura del mensaje correcta
// - Evento válido
```

#### Nivel 2: Tipos
```typescript
// Valida automáticamente:
// - Tipos de datos (number, string, etc.)
// - Arrays no vacíos
// - Valores positivos donde corresponda
```

#### Nivel 3: Negocio
```typescript
// Validador personalizado (ejemplo):
stockWsManager.setValidator(async (event, data) => {
  if (event === 'stock:subtract') {
    const subtractions = data as StockSubtraction[];
    
    for (const sub of subtractions) {
      // Verificar stock actual
      const product = await db.get(sub.productId.toString());
      
      if (!product) {
        return { 
          valid: false, 
          error: `Producto ${sub.productId} no encontrado` 
        };
      }
      
      if (product.stock < sub.quantity) {
        return { 
          valid: false, 
          error: `Stock insuficiente. Actual: ${product.stock}, Solicitado: ${sub.quantity}` 
        };
      }
    }
  }
  
  return { valid: true };
});
```

### Respuestas de Error

Cuando una validación falla, el cliente recibe:

```json
{
  "event": "stock:error",
  "data": {
    "error": "Validation failed",
    "reason": "Stock insuficiente. Actual: 10, Solicitado: 15",
    "originalEvent": "stock:subtract"
  },
  "timestamp": "2025-10-09T10:30:00.000Z",
  "clientId": "client_1728475800000_abc123"
}
```

---

## 📖 Ejemplos de Uso

### Cliente Web Completo

```javascript
class StockManager {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.setupListeners();
  }
  
  setupListeners() {
    this.ws.onopen = () => {
      console.log('✅ Conectado al servidor de stock');
      this.subscribeToUpdates();
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
    
    this.ws.onerror = (error) => {
      console.error('❌ Error en WebSocket:', error);
      this.reconnect();
    };
    
    this.ws.onclose = () => {
      console.log('🔌 Desconectado. Intentando reconectar...');
      this.reconnect();
    };
  }
  
  handleMessage(message) {
    switch(message.event) {
      case 'stock:update':
        this.updateStockInUI(message.data);
        break;
      case 'stock:add':
        this.incrementStockInUI(message.data);
        break;
      case 'stock:subtract':
        this.decrementStockInUI(message.data);
        break;
      case 'stock:sync':
        this.syncAllStockInUI(message.data);
        break;
      case 'stock:error':
        this.showError(message.data);
        break;
    }
  }
  
  // Actualizar stock
  updateStock(productId, newStock) {
    this.ws.send(JSON.stringify({
      event: 'stock:update',
      data: [{ productId, stock: newStock }]
    }));
  }
  
  // Añadir stock
  addStock(productId, quantity) {
    this.ws.send(JSON.stringify({
      event: 'stock:add',
      data: [{ productId, quantity }]
    }));
  }
  
  // Restar stock
  subtractStock(productId, quantity) {
    this.ws.send(JSON.stringify({
      event: 'stock:subtract',
      data: [{ productId, quantity }]
    }));
  }
  
  // Métodos de UI (implementar según framework)
  updateStockInUI(data) {
    data.forEach(({ productId, stock }) => {
      const element = document.querySelector(`[data-product="${productId}"]`);
      if (element) {
        element.textContent = stock;
        element.classList.add('updated');
      }
    });
  }
  
  incrementStockInUI(data) {
    data.forEach(({ productId, quantity }) => {
      const element = document.querySelector(`[data-product="${productId}"]`);
      if (element) {
        const current = parseInt(element.textContent) || 0;
        element.textContent = current + quantity;
      }
    });
  }
  
  decrementStockInUI(data) {
    data.forEach(({ productId, quantity }) => {
      const element = document.querySelector(`[data-product="${productId}"]`);
      if (element) {
        const current = parseInt(element.textContent) || 0;
        element.textContent = Math.max(0, current - quantity);
      }
    });
  }
  
  syncAllStockInUI(data) {
    data.forEach(({ productId, stock }) => {
      this.updateStockInUI([{ productId, stock }]);
    });
  }
  
  showError(error) {
    console.error(`Error de stock: ${error.reason}`);
    // Mostrar notificación al usuario
  }
  
  reconnect() {
    setTimeout(() => {
      this.ws = new WebSocket(this.ws.url);
      this.setupListeners();
    }, 3000);
  }
}

// Uso
const stockManager = new StockManager('ws://localhost:3000/ws');

// Actualizar stock desde un botón
document.querySelector('#update-btn').addEventListener('click', () => {
  stockManager.updateStock(1, 100);
});
```

### Testing con cURL

```bash
# Actualizar stock
curl -X POST http://localhost:3000/api/stock/update \
  -H "Content-Type: application/json" \
  -d '{"updates":[{"productId":1,"stock":100}]}'

# Añadir stock
curl -X POST http://localhost:3000/api/stock/add \
  -H "Content-Type: application/json" \
  -d '{"additions":[{"productId":1,"quantity":50}]}'

# Ver estado
curl http://localhost:3000/api/stock/status

# Hacer backup
curl http://localhost:3000/api/backup/DefautlDB > backup.json

# Restaurar backup
curl -X POST http://localhost:3000/api/backup/DefautlDB/restore \
  -H "Content-Type: application/json" \
  -d @backup.json
```

---

## ⚙️ Configuración Avanzada

### CORS

```typescript
// src/index.ts
app.use('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:4321',
    'http://localhost:5173',
    'https://tu-dominio.com'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

### Variables de Entorno

```bash
# .env
PORT=3000
DB_PATH=./DefaultDB.json
WS_PATH=/ws
CORS_ORIGINS=http://localhost:3000,http://localhost:4321
```

### Rate Limiting (Recomendado)

```typescript
import { rateLimiter } from 'hono-rate-limiter';

app.use('/api/*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 peticiones por ventana
  standardHeaders: true,
  message: { error: 'Demasiadas peticiones, intenta más tarde' }
}));
```

### Autenticación (Ejemplo con JWT)

```typescript
import { jwt } from 'hono/jwt';

app.use('/api/*', jwt({
  secret: process.env.JWT_SECRET || 'tu-secreto'
}));

// En el WebSocket
app.get('/ws', upgradeWebSocket(() => {
  return {
    onOpen(evt, ws) {
      // Validar token desde query params
      const url = new URL(evt.request.url);
      const token = url.searchParams.get('token');
      
      if (!isValidToken(token)) {
        ws.close(1008, 'Token inválido');
        return;
      }
      
      clientId = stockWsManager.addConnection(ws);
    }
  };
}));
```

---

## 📝 Notas Importantes

### ⚠️ Consideraciones de Producción

- **Rate Limiting**: No implementado por defecto, añadir para producción
- **Autenticación**: No implementada por defecto, añadir según necesidad
- **Validación de Negocio**: El validador es opcional pero **altamente recomendado**
- **Monitoreo**: Implementar logging y métricas para producción
- **Escalabilidad**: Para múltiples instancias, considerar Redis pub/sub

### 🔒 Seguridad

- Los mensajes se propagan **excepto al emisor** (prevención de echo)
- Las conexiones muertas se limpian automáticamente
- Validación multinivel antes de propagar cambios
- CORS configurado para orígenes específicos

### 🚀 Performance

- **Sin persistencia en memoria**: Todos los datos se guardan en archivo JSON
- **Timestamps automáticos**: `created_at` y `updated_at` gestionados automáticamente
- **Sincronización incremental**: Soporta sync desde fecha específica
- **Bulk operations**: Operaciones masivas optimizadas

---