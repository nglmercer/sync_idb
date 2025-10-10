// src/websocket/notificationManager.ts
import type { WebSocketConnection } from '../types/stock';

interface ClientConnection {
  ws: WebSocketConnection;
  id: string;
  connectedAt: Date;
}

/**
 * Sistema genérico de notificaciones por WebSocket
 * Broadcast de eventos a todos los clientes excepto al emisor
 * 
 * Formato de mensaje: [event, data]
 * Compatible con socket.io style: ws.on('event', (...args) => {})
 */
class NotificationManager {
  private connections: Map<string, ClientConnection>;

  constructor() {
    this.connections = new Map();
  }

  /**
   * Genera un ID único para cada cliente
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Registra una nueva conexión WebSocket
   */
  addConnection(ws: WebSocketConnection): string {
    const clientId = this.generateClientId();
    this.connections.set(clientId, {
      ws,
      id: clientId,
      connectedAt: new Date()
    });
    console.log(`✅ Cliente conectado [${clientId}]. Total: ${this.connections.size}`);
    return clientId;
  }

  /**
   * Remueve una conexión WebSocket
   */
  removeConnection(clientId: string): void {
    this.connections.delete(clientId);
    console.log(`❌ Cliente desconectado [${clientId}]. Total: ${this.connections.size}`);
  }

  /**
   * Obtiene el número de clientes conectados
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Broadcast genérico a todos EXCEPTO al emisor
   * 
   * @param event - Nombre del evento (ej: 'sync:change', 'product:updated')
   * @param data - Datos a enviar (se enviará como array al cliente)
   * @param excludeClientId - ID del cliente que NO debe recibir el mensaje
   * 
   * @example
   * // Servidor
   * notificationManager.broadcast('sync:change', { action: 'update', item: {...} }, clientId);
   * 
   * // Cliente recibe
   * ws.on('sync:change', (...args) => {
   *   const [data] = args; // { action: 'update', item: {...} }
   * });
   */
  broadcast<T>(
    event: string,
    data: T,
    excludeClientId?: string
  ): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (this.connections.size === 0) {
      console.log(`ℹ️ No hay clientes conectados para broadcast de ${event}`);
      return { success: true, sentTo: 0 };
    }

    // Formato array compatible con socket.io style: [event, data]
    // Esto permite que el cliente use: ws.on('event', (...args) => {})
    const message = [event, data];
    const messageStr = JSON.stringify(message);
    
    let successCount = 0;
    const deadConnections: string[] = [];

    this.connections.forEach((client, clientId) => {
      // No enviar al cliente que originó el mensaje
      if (excludeClientId && clientId === excludeClientId) {
        return;
      }

      try {
        client.ws.send(messageStr);
        successCount++;
      } catch (error) {
        console.error(`❌ Error enviando a ${clientId}:`, error);
        deadConnections.push(clientId);
      }
    });

    // Limpiar conexiones muertas
    deadConnections.forEach(id => this.connections.delete(id));

    const excludeInfo = excludeClientId ? ` (excluido: ${excludeClientId})` : '';
    console.log(`📡 [${event}] Enviado a ${successCount}/${this.connections.size} clientes${excludeInfo}`);

    return { success: true, sentTo: successCount };
  }

  /**
   * Enviar mensaje a un cliente específico
   * 
   * @param clientId - ID del cliente destino
   * @param event - Nombre del evento
   * @param data - Datos a enviar
   */
  sendToClient<T>(clientId: string, event: string, data: T): boolean {
    const client = this.connections.get(clientId);
    
    if (!client) {
      console.warn(`⚠️ Cliente ${clientId} no encontrado`);
      return false;
    }

    try {
      // Formato array compatible con socket.io style: [event, data]
      const message = [event, data];
      
      client.ws.send(JSON.stringify(message));
      console.log(`📤 Mensaje enviado a ${clientId}: ${event}`);
      return true;
    } catch (error) {
      console.error(`❌ Error enviando a ${clientId}:`, error);
      this.connections.delete(clientId);
      return false;
    }
  }

  /**
   * Broadcast a todos los clientes (incluyendo emisor)
   * 
   * @param event - Nombre del evento
   * @param data - Datos a enviar
   */
  broadcastAll<T>(event: string, data: T): {
    success: boolean;
    sentTo: number;
  } {
    return this.broadcast(event, data);
  }

  /**
   * Obtener lista de clientes conectados
   */
  getConnectedClients(): Array<{ id: string; connectedAt: Date }> {
    return Array.from(this.connections.values()).map(client => ({
      id: client.id,
      connectedAt: client.connectedAt
    }));
  }

  /**
   * Verificar si un cliente está conectado
   */
  isClientConnected(clientId: string): boolean {
    return this.connections.has(clientId);
  }
}

export const notificationManager = new NotificationManager();
export { NotificationManager };