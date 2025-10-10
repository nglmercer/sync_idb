# 📦 Stock WebSocket System

Sistema de sincronización de stock en tiempo real usando WebSockets con Hono + Bun + TypeScript.

---

## 📚 Tabla de Contenidos

- [Inicio Rápido](#-inicio-rápido)
- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [WebSocket API](#-websocket-api)
- [REST API](#-rest-api)
- [Sistema de Persistencia](#-sistema-de-persistencia)
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
- ✅ **Backup y Restauración** completos
- ✅ **Operaciones CRUD** sobre datos sincronizados

### Administración
- ✅ **Identificación de clientes** con IDs únicos
- ✅ **Limpieza automática** de conexiones muertas
- ✅ **Estadísticas en tiempo real** de conexiones

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
│   └── routes/
│       ├── backupRoute.ts          # Endpoints de backup
│       └── syncRoute.ts            # Endpoints de sincronización
├── PointSales.json                 # Base de datos (auto-generado)
├── package.json
├── tsconfig.json
└── README.md
```

### Arquitectura de Datos

```
Archivo JSON (Database)
    │
    ├── storeName1 (key)
    │   ├── data: [...]              # Tus datos
    │   ├── created_at: "..."        # Timestamp de creación
    │   └── updated_at: "..."        # Timestamp de actualización
    │
    ├── storeName2 (key)
    │   ├── data: [...]
    │   ├── created_at: "..."
    │   └── updated_at: "..."
    │
    └── storeName3 (key)
        └── { id: data, ... }        # O estructura de objeto con IDs
```

**⚠️ IMPORTANTE:** Cada "database" es un archivo JSON. Los "stores" son keys dentro de ese archivo.

### Flujo de Datos WebSocket

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

## 💾 Sistema de Persistencia

### Configuración de Databases

```typescript
// src/routes/syncRoute.ts
import { DataStorage } from 'json-obj-manager';
import { JSONFileAdapter } from 'json-obj-manager/node';
import path from "path";

const PointSalesPath = path.join(process.cwd(), "./PointSales.json");

const Databases = {
  PointSales: new DataStorage<TimestampedData>(
    new JSONFileAdapter(PointSalesPath)
  ),
};
```

### Agregar Más Databases

```typescript
const PointSalesPath = path.join(process.cwd(), "./PointSales.json");
const InventoryPath = path.join(process.cwd(), "./Inventory.json");
const CustomersPath = path.join(process.cwd(), "./Customers.json");

const Databases = {
  PointSales: new DataStorage<TimestampedData>(
    new JSONFileAdapter(PointSalesPath)
  ),
  Inventory: new DataStorage<TimestampedData>(
    new JSONFileAdapter(InventoryPath)
  ),
  Customers: new DataStorage<TimestampedData>(
    new JSONFileAdapter(CustomersPath)
  ),
};
```

### Estructura de Datos

```typescript
interface TimestampedData {
  created_at: string;    // ISO 8601
  updated_at: string;    // ISO 8601
  [key: string]: any;    // Datos personalizados
}
```

### Ejemplo de Archivo JSON Generado

```json
{
  "products": {
    "data": [
      { "id": 1, "name": "Producto A", "price": 100, "stock": 50 },
      { "id": 2, "name": "Producto B", "price": 200, "stock": 30 }
    ],
    "created_at": "2025-10-09T10:00:00.000Z",
    "updated_at": "2025-10-09T10:30:00.000Z"
  },
  "customers": {
    "1": {
      "name": "Cliente A",
      "email": "clientea@example.com",
      "created_at": "2025-10-09T09:00:00.000Z",
      "updated_at": "2025-10-09T09:00:00.000Z"
    },
    "2": {
      "name": "Cliente B",
      "email": "clienteb@example.com",
      "created_at": "2025-10-09T09:15:00.000Z",
      "updated_at": "2025-10-09T10:00:00.000Z"
    }
  }
}
```

---

## 🔄 API de Sincronización

### ✅ Endpoints Funcionales

#### 1. Obtener Datos de un Store
```http
GET /api/sync/:dbName/:storeName
```

**Ejemplo:**
```bash
curl http://localhost:3000/api/sync/PointSales/products
```

**Respuesta:**
```json
{
  "data": {
    "data": [
      { "id": 1, "name": "Producto A", "price": 100 }
    ],
    "created_at": "2025-10-09T10:00:00.000Z",
    "updated_at": "2025-10-09T10:30:00.000Z"
  },
  "count": 1,
  "timestamp": "2025-10-09T10:35:00.000Z"
}
```

---

#### 2. Sincronizar Datos (Bulk)
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

**⚠️ IMPORTANTE:** Este endpoint **REEMPLAZA** completamente los datos existentes en el store.

**Respuesta:**
```json
{
  "success": true,
  "synced": 2,
  "created": 2,
  "updated": 0,
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:3000/api/sync/PointSales/products \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {"id": 1, "name": "Producto A", "price": 100},
      {"id": 2, "name": "Producto B", "price": 200}
    ]
  }'
```

---

#### 3. Actualizar/Crear Item Individual
```http
PUT /api/sync/:dbName/:storeName/:id
Content-Type: application/json

{
  "name": "Producto Actualizado",
  "price": 150
}
```

**Nota:** Asume que el store contiene un objeto donde las keys son IDs.

**Respuesta:**
```json
{
  "success": true,
  "action": "created",
  "data": {
    "name": "Producto Actualizado",
    "price": 150,
    "created_at": "2025-10-09T10:30:00.000Z",
    "updated_at": "2025-10-09T10:30:00.000Z"
  },
  "timestamp": "2025-10-09T10:30:00.000Z"
}
```

**Ejemplo con cURL:**
```bash
curl -X PUT http://localhost:3000/api/sync/PointSales/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Producto A Modificado", "price": 150}'
```

---

### ⚠️ Endpoints con Limitaciones

Los siguientes endpoints están implementados pero pueden tener errores en ciertos escenarios:

#### PATCH - Actualizar Parcialmente
```http
PATCH /api/sync/:dbName/:storeName/:id
```
**Estado:** ⚠️ Funcional pero requiere que el store y el item existan previamente.

#### DELETE - Eliminar Item
```http
DELETE /api/sync/:dbName/:storeName/:id
```
**Estado:** ⚠️ Funcional pero requiere que el store y el item existan previamente.

#### Cambios Desde Fecha
```http
GET /api/sync/:dbName/:storeName/since/:timestamp
```
**Estado:** ⚠️ Funcional pero asume estructura específica de datos.

#### Estadísticas del Store
```http
GET /api/sync/:dbName/:storeName/stats
```
**Estado:** ⚠️ Funcional pero asume estructura específica de datos.

---

## 💾 Backup y Restauración

### Hacer Backup Completo
```http
GET /api/backup/:dbName
```

**Ejemplo:**
```bash
curl http://localhost:3000/api/backup/PointSales > backup.json
```

**Respuesta:**
```json
{
  "database": "PointSales",
  "backup": {
    "products": {
      "data": [...],
      "created_at": "...",
      "updated_at": "..."
    },
    "customers": {...}
  },
  "timestamp": "2025-10-09T10:30:00.000Z",
  "stores": ["products", "customers"],
  "totalRecords": 2,
  "metadata": {
    "version": "1.0",
    "created_at": "2025-10-09T10:30:00.000Z"
  }
}
```

### Restaurar Backup
```http
POST /api/backup/:dbName/restore
Content-Type: application/json

{
  "backup": {
    "products": {...},
    "customers": {...}
  },
  "overwrite": false,
  "mergeStrategy": "newer"
}
```

**Estrategias de Merge:**
- `newer`: Mantener el registro más reciente (basado en `updated_at`)
- `force`: Sobrescribir siempre con el backup
- `skip`: No sobrescribir registros existentes

**Ejemplo:**
```bash
curl -X POST http://localhost:3000/api/backup/PointSales/restore \
  -H "Content-Type: application/json" \
  -d @backup.json
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
      const product = await db.load(`products.${sub.productId}`);
      
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

### Cliente JavaScript Completo

```javascript
class StockManager {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.setupListeners();
  }
  
  setupListeners() {
    this.ws.onopen = () => {
      console.log('✅ Conectado al servidor de stock');
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
  
  // Métodos de UI
  updateStockInUI(data) {
    data.forEach(({ productId, stock }) => {
      const element = document.querySelector(`[data-product="${productId}"]`);
      if (element) {
        element.textContent = stock;
        element.classList.add('updated');
      }
    });
  }
  
  showError(error) {
    console.error(`Error de stock: ${error.reason}`);
    alert(`Error: ${error.reason}`);
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

### Sincronización Completa con REST API

```javascript
// Cargar datos iniciales
async function loadProducts() {
  const response = await fetch('http://localhost:3000/api/sync/PointSales/products');
  const result = await response.json();
  
  // Acceder a los datos
  const productsData = result.data;
  
  if (productsData && productsData.data) {
    return productsData.data; // Array de productos
  }
  
  return [];
}

// Sincronizar productos (reemplaza todos)
async function syncProducts(products) {
  const response = await fetch('http://localhost:3000/api/sync/PointSales/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: products })
  });
  
  return await response.json();
}

// Actualizar un producto individual
async function updateProduct(id, productData) {
  const response = await fetch(`http://localhost:3000/api/sync/PointSales/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(productData)
  });
  
  return await response.json();
}

// Uso
const products = await loadProducts();
console.log('Productos cargados:', products);

// Sincronizar cambios
await syncProducts([
  { id: 1, name: "Producto A", price: 100, stock: 50 },
  { id: 2, name: "Producto B", price: 200, stock: 30 }
]);

// Actualizar un producto
await updateProduct(1, {
  name: "Producto A Actualizado",
  price: 120,
  stock: 45
});
```

### Testing con cURL

```bash
# Ver todos los productos
curl http://localhost:3000/api/sync/PointSales/products

# Sincronizar productos
curl -X POST http://localhost:3000/api/sync/PointSales/products \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {"id": 1, "name": "Producto A", "price": 100},
      {"id": 2, "name": "Producto B", "price": 200}
    ]
  }'

# Actualizar producto individual
curl -X PUT http://localhost:3000/api/sync/PointSales/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Producto A Modificado", "price": 150}'

# Estado del servidor WebSocket
curl http://localhost:3000/api/stock/status

# Hacer backup
curl http://localhost:3000/api/backup/PointSales > backup.json

# Restaurar backup
curl -X POST http://localhost:3000/api/backup/PointSales/restore \
  -H "Content-Type: application/json" \
  -d @backup.json
```

---

## ⚙️ Configuración Avanzada

### CORS

```typescript
// src/index.ts
import { cors } from 'hono/cors';

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
DB_PATH=./PointSales.json
WS_PATH=/ws
CORS_ORIGINS=http://localhost:3000,http://localhost:4321
```

### Rate Limiting (Recomendado para Producción)

```typescript
import { rateLimiter } from 'hono-rate-limiter';

app.use('/api/*', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 peticiones por ventana
  standardHeaders: true,
  message: { error: 'Demasiadas peticiones, intenta más tarde' }
}));
```

### Autenticación con JWT (Ejemplo)

```typescript
import { jwt } from 'hono/jwt';

// Proteger endpoints REST
app.use('/api/*', jwt({
  secret: process.env.JWT_SECRET || 'tu-secreto'
}));

// Validar token en WebSocket
app.get('/ws', upgradeWebSocket(() => {
  return {
    onOpen(evt, ws) {
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

### ⚠️ Arquitectura de Datos

- **Una Database = Un Archivo JSON**: Cada entrada en `Databases` apunta a un archivo diferente
- **Stores = Keys en JSON**: Los "stores" no son colecciones separadas, son keys dentro del archivo
- **POST Reemplaza Todo**: El endpoint POST de sincronización reemplaza completamente los datos existentes
- **Timestamps Automáticos**: Todos los datos incluyen `created_at` y `updated_at`

### 🔒 Seguridad

- Los mensajes WebSocket se propagan **excepto al emisor** (prevención de echo)
- Las conexiones muertas se limpian automáticamente
- Validación multinivel antes de propagar cambios
- CORS configurable para orígenes específicos
- **⚠️ Sin autenticación por defecto**: Implementar JWT o similar para producción