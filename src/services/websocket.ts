import EventEmitter from 'events';

export interface WebSocketMessage {
  type: 'status_update';
  room_id: string;
  status: string;
  progress: number;
}

export interface WebSocketError {
  type: 'error';
  message: string;
  timestamp: number;
}

class WebSocketService extends EventEmitter {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly url = 'ws://localhost:5001/socket.io/?EIO=4&transport=websocket';
  private isConnecting = false;
  private maxReconnectAttempts = 5;
  private reconnectAttempts = 0;

  private constructor() {
    super();
  }

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const error: WebSocketError = {
        type: 'error',
        message: 'Max reconnection attempts reached',
        timestamp: Date.now()
      };
      this.emit('error', error);
      return;
    }

    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket Connected');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        // Send Socket.IO upgrade packet
        this.ws?.send('40');
        this.emit('connected');
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = event.data;
          // Handle Socket.IO ping packet
          if (rawData === '2') {
            this.ws?.send('3'); // Respond with pong
            return;
          }
          
          // Handle Socket.IO data packets (type 42)
          if (rawData.startsWith('42')) {
            const jsonData = rawData.substring(2);
            const [eventName, data] = JSON.parse(jsonData);
            if (eventName === 'status_update') {
              this.emit('message', data);
            }
          }
        } catch (error) {
          const wsError: WebSocketError = {
            type: 'error',
            message: 'Failed to parse WebSocket message',
            timestamp: Date.now()
          };
          this.emit('error', wsError);
        }
      };

      this.ws.onerror = (event) => {
        const wsError: WebSocketError = {
          type: 'error',
          message: event.type === 'error' ? 'WebSocket error occurred' : event.toString(),
          timestamp: Date.now()
        };
        console.error('WebSocket error:', wsError);
        this.isConnected = false;
        this.isConnecting = false;
        
        // Try to close the connection if it's still open
        try {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.close();
          }
        } catch (closeError) {
          console.error('Error closing WebSocket after error:', closeError);
        }

        // Emit error event, but catch any unhandled errors
        try {
          this.emit('error', wsError);
        } catch (emitError) {
          console.error('Error emitting WebSocket error:', emitError);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed', event.code, event.reason);
        this.isConnected = false;
        this.isConnecting = false;
        
        // Emit disconnected event, but catch any unhandled errors
        try {
          this.emit('disconnected', { code: event.code, reason: event.reason });
        } catch (emitError) {
          console.error('Error emitting WebSocket disconnected:', emitError);
        }

        // Only schedule reconnect for abnormal closures
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      const wsError: WebSocketError = {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to create WebSocket connection',
        timestamp: Date.now()
      };
      console.error('Error creating WebSocket:', wsError);
      this.isConnecting = false;
      this.emit('error', wsError);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimeout && !this.isConnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff with max 30s
      console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
      
      this.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect...');
        this.connect();
      }, delay);
    }
  }

  public joinRoom(roomId: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: '42',
          data: ['join', { room_id: roomId }]
        }));
      } catch (error) {
        const wsError: WebSocketError = {
          type: 'error',
          message: 'Failed to join room',
          timestamp: Date.now()
        };
        this.emit('error', wsError);
      }
    }
  }

  public isConnectedToServer() {
    return this.isConnected;
  }

  public disconnect() {
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: '41' })); // Socket.IO disconnect packet
        this.ws.close();
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }
}

export const wsService = WebSocketService.getInstance();
wsService.connect();
