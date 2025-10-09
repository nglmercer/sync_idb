// src/websocket/stockManager.ts
import type { 
  StockUpdate, 
  StockAddition, 
  StockSubtraction, 
  StockEventType,
  StockMessage,
  WebSocketConnection
} from '../types/stock';
class StockWebSocketManager {
  private connections: Set<WebSocketConnection>;

  constructor() {
    this.connections = new Set();
  }

  addConnection(ws: WebSocketConnection): void {
    this.connections.add(ws);
    console.log(`✅ Cliente conectado. Total: ${this.connections.size}`);
  }

  removeConnection(ws: WebSocketConnection): void {
    this.connections.delete(ws);
    console.log(`❌ Cliente desconectado. Total: ${this.connections.size}`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  private broadcastMessage<T>(event: StockEventType, data: T): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (this.connections.size === 0) {
      return { success: true, sentTo: 0 };
    }

    const message: StockMessage<T> = {
      event,
      data,
      timestamp: new Date().toISOString()
    };

    const messageStr = JSON.stringify(message);
    let successCount = 0;
    const deadConnections: WebSocketConnection[] = [];

    this.connections.forEach((ws) => {
      try {
        ws.send(messageStr);
        successCount++;
      } catch (error) {
        console.error('Error al enviar mensaje:', error);
        deadConnections.push(ws);
      }
    });

    // Limpiar conexiones muertas
    deadConnections.forEach(ws => this.connections.delete(ws));

    console.log(`📡 [${event}] Enviado a ${successCount}/${this.connections.size} clientes`);

    return { success: true, sentTo: successCount };
  }

  /**
   * Actualiza el stock de uno o varios productos
   */
  broadcastStockUpdate(updates: StockUpdate[]): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(updates) || updates.length === 0) {
      const errorMessage = 'StockUpdate debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:update', updates);
  }

  /**
   * Añade stock a uno o varios productos
   */
  broadcastStockAddition(additions: StockAddition[]): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(additions) || additions.length === 0) {
      const errorMessage = 'StockAddition debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:add', additions);
  }

  /**
   * Resta stock a uno o varios productos
   */
  broadcastStockSubtraction(subtractions: StockSubtraction[]): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(subtractions) || subtractions.length === 0) {
      const errorMessage = 'StockSubtraction debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:subtract', subtractions);
  }

  /**
   * Sincroniza el stock completo de múltiples productos
   */
  broadcastStockSync(stockData: StockUpdate[]): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(stockData) || stockData.length === 0) {
      const errorMessage = 'StockSync debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:sync', stockData);
  }
}

export const stockWsManager = new StockWebSocketManager();