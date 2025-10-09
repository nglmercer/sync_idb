// src/types/stock.ts
export interface StockUpdate {
  productId: number;
  stock: number;
  timestamp?: string;
}

export interface StockAddition {
  productId: number;
  quantity: number;
  timestamp?: string;
}

export interface StockSubtraction {
  productId: number;
  quantity: number;
  timestamp?: string;
}

export type StockEventType = 
  | 'stock:update'
  | 'stock:add'
  | 'stock:subtract'
  | 'stock:sync'
  | 'stock:error';

export interface StockMessage<T = unknown> {
  event: StockEventType;
  data: T;
  timestamp: string;
  clientId?: string; // Identificador del cliente que envió el mensaje
}

export interface StockErrorMessage {
  error: string;
  reason: string;
  originalEvent?: StockEventType;
}

// Tipo para WebSocket compatible con Hono
export interface WebSocketConnection {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}

// Mensaje entrante del cliente
export interface IncomingStockMessage {
  event: StockEventType;
  data: StockUpdate[] | StockAddition[] | StockSubtraction[];
  clientId?: string;
}

// Callback para validación de stock
export type StockValidator = (
  event: StockEventType,
  data: StockUpdate[] | StockAddition[] | StockSubtraction[]
) => Promise<{
  valid: boolean;
  error?: string;
  validatedData?: StockUpdate[] | StockAddition[] | StockSubtraction[];
}>;
