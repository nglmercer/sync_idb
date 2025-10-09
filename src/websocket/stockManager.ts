// src/websocket/stockManager.ts
import type {
  StockUpdate,
  StockAddition,
  StockSubtraction,
  StockEventType,
  StockMessage,
  StockErrorMessage,
  WebSocketConnection,
  IncomingStockMessage,
  StockValidator
} from '../types/stock';

interface ClientConnection {
  ws: WebSocketConnection;
  id: string;
  connectedAt: Date;
}

class StockWebSocketManager {
  private connections: Map<string, ClientConnection>;
  private validator?: StockValidator;

  constructor() {
    this.connections = new Map();
  }

  /**
   * Establece un validador personalizado para las operaciones de stock
   */
  setValidator(validator: StockValidator): void {
    this.validator = validator;
  }

  /**
   * Genera un ID único para cada cliente
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

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

  removeConnection(clientId: string): void {
    this.connections.delete(clientId);
    console.log(`❌ Cliente desconectado [${clientId}]. Total: ${this.connections.size}`);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Envía un mensaje de error a un cliente específico
   */
  private sendError(clientId: string, error: string, reason: string, originalEvent?: StockEventType): void {
    const client = this.connections.get(clientId);
    if (!client) return;

    const errorMessage: StockMessage<StockErrorMessage> = {
      event: 'stock:error',
      data: { error, reason, originalEvent },
      timestamp: new Date().toISOString(),
      clientId
    };

    try {
      client.ws.send(JSON.stringify(errorMessage));
    } catch (err) {
      console.error(`Error enviando mensaje de error a ${clientId}:`, err);
    }
  }

  /**
   * Broadcast a todos EXCEPTO al emisor
   */
  private broadcastMessage<T>(
    event: StockEventType,
    data: T,
    excludeClientId?: string
  ): {
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
      timestamp: new Date().toISOString(),
      clientId: excludeClientId
    };

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
        console.error(`Error al enviar mensaje a ${clientId}:`, error);
        deadConnections.push(clientId);
      }
    });

    // Limpiar conexiones muertas
    deadConnections.forEach(id => this.connections.delete(id));

    console.log(`📡 [${event}] Enviado a ${successCount}/${this.connections.size} clientes${excludeClientId ? ` (excluido: ${excludeClientId})` : ''}`);

    return { success: true, sentTo: successCount };
  }

  /**
   * Valida el formato básico de los datos
   */
  private validateMessageFormat(message: unknown): message is IncomingStockMessage {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Partial<IncomingStockMessage>;
    
    if (!msg.event || typeof msg.event !== 'string') {
      return false;
    }

    if (!msg.data || !Array.isArray(msg.data)) {
      return false;
    }

    const validEvents: StockEventType[] = ['stock:update', 'stock:add', 'stock:subtract', 'stock:sync'];
    if (!validEvents.includes(msg.event)) {
      return false;
    }

    return true;
  }

  /**
   * Valida los datos según el tipo de evento
   */
  private validateEventData(event: StockEventType, data: unknown[]): boolean {
    if (!Array.isArray(data) || data.length === 0) {
      return false;
    }

    switch (event) {
      case 'stock:update':
      case 'stock:sync':
        return data.every(item => 
          typeof item === 'object' &&
          item !== null &&
          typeof (item as StockUpdate).productId === 'number' &&
          typeof (item as StockUpdate).stock === 'number' &&
          (item as StockUpdate).stock >= 0
        );

      case 'stock:add':
        return data.every(item =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as StockAddition).productId === 'number' &&
          typeof (item as StockAddition).quantity === 'number' &&
          (item as StockAddition).quantity > 0
        );

      case 'stock:subtract':
        return data.every(item =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as StockSubtraction).productId === 'number' &&
          typeof (item as StockSubtraction).quantity === 'number' &&
          (item as StockSubtraction).quantity > 0
        );

      default:
        return false;
    }
  }

  /**
   * Maneja mensajes entrantes de los clientes
   */
  async handleMessage(rawMessage: string, clientId: string): Promise<void> {
    try {
      // 1. Parse del mensaje
      const message = JSON.parse(rawMessage);

      // 2. Validar formato básico
      if (!this.validateMessageFormat(message)) {
        this.sendError(clientId, 'Invalid message format', 'El formato del mensaje es inválido');
        return;
      }

      const { event, data } = message;

      // 3. Validar datos según el tipo de evento
      if (!this.validateEventData(event, data)) {
        this.sendError(
          clientId,
          'Invalid data format',
          `Los datos para el evento ${event} son inválidos`,
          event
        );
        return;
      }

      // 4. Validación personalizada (ej: verificar en BD)
      if (this.validator) {
        const validationResult = await this.validator(event, data);
        
        if (!validationResult.valid) {
          this.sendError(
            clientId,
            'Validation failed',
            validationResult.error || 'Los datos no pasaron la validación',
            event
          );
          return;
        }

        // Usar datos validados si existen
        if (validationResult.validatedData) {
          message.data = validationResult.validatedData;
        }
      }

      // 5. Broadcast a todos excepto al emisor
      switch (event) {
        case 'stock:update':
          this.broadcastStockUpdate(data as StockUpdate[], clientId);
          break;
        case 'stock:add':
          this.broadcastStockAddition(data as StockAddition[], clientId);
          break;
        case 'stock:subtract':
          this.broadcastStockSubtraction(data as StockSubtraction[], clientId);
          break;
        case 'stock:sync':
          this.broadcastStockSync(data as StockUpdate[], clientId);
          break;
      }

    } catch (error) {
      console.error(`Error procesando mensaje de ${clientId}:`, error);
      this.sendError(
        clientId,
        'Processing error',
        error instanceof Error ? error.message : 'Error al procesar el mensaje'
      );
    }
  }

  /**
   * Actualiza el stock de uno o varios productos
   */
  broadcastStockUpdate(updates: StockUpdate[], excludeClientId?: string): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(updates) || updates.length === 0) {
      const errorMessage = 'StockUpdate debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:update', updates, excludeClientId);
  }

  /**
   * Añade stock a uno o varios productos
   */
  broadcastStockAddition(additions: StockAddition[], excludeClientId?: string): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(additions) || additions.length === 0) {
      const errorMessage = 'StockAddition debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:add', additions, excludeClientId);
  }

  /**
   * Resta stock a uno o varios productos
   */
  broadcastStockSubtraction(subtractions: StockSubtraction[], excludeClientId?: string): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(subtractions) || subtractions.length === 0) {
      const errorMessage = 'StockSubtraction debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:subtract', subtractions, excludeClientId);
  }

  /**
   * Sincroniza el stock completo de múltiples productos
   */
  broadcastStockSync(stockData: StockUpdate[], excludeClientId?: string): {
    success: boolean;
    sentTo: number;
    errorMessage?: string;
  } {
    if (!Array.isArray(stockData) || stockData.length === 0) {
      const errorMessage = 'StockSync debe ser un array no vacío';
      console.error(errorMessage);
      return { success: false, sentTo: 0, errorMessage };
    }

    return this.broadcastMessage('stock:sync', stockData, excludeClientId);
  }
}

export const stockWsManager = new StockWebSocketManager();