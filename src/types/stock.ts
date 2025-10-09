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
  | 'stock:sync';

export interface StockMessage<T = unknown> {
  event: StockEventType;
  data: T;
  timestamp: string;
}

// Tipo para WebSocket compatible con Hono
export interface WebSocketConnection {
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
}