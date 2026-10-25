// SSE Client Manager for HackWave Dispatch Live Feed

export class SSEClient {
  constructor(endpoint = '/api/events') {
    this.endpoint = endpoint;
    this.eventSource = null;
    this.listeners = new Map();
    this.statusListeners = new Set();
    this.reconnectTimeout = null;
    this.reconnectDelay = 2000;
    this.isConnected = false;
  }

  connect() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource(this.endpoint);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.notifyStatus('connected');
      };

      this.eventSource.addEventListener('connected', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('connected', data);
        } catch (err) {
          console.error('[SSE] JSON parse error in connected:', err);
        }
      });

      this.eventSource.addEventListener('fleet', (e) => {
        try {
          const data = JSON.parse(e.data);
          this.emit('fleet', data);
        } catch (err) {
          console.error('[SSE] JSON parse error in fleet:', err);
        }
      });

      // Dispatch specific events
      for (const eventName of ['request_created', 'spike_activated', 'spike_expired', 'requests_reranked']) {
        this.eventSource.addEventListener(eventName, (e) => {
          try {
            const data = JSON.parse(e.data);
            this.emit(eventName, data);
          } catch (err) {
            console.error(`[SSE] JSON parse error in ${eventName}:`, err);
          }
        });
      }

      this.eventSource.onerror = (err) => {
        this.isConnected = false;
        this.notifyStatus('disconnected');
        this.close();

        // Auto reconnect
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
          }, this.reconnectDelay);
        }
      };
    } catch (err) {
      console.error('[SSE] Connection error:', err);
      this.notifyStatus('error');
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const cb of this.listeners.get(event)) {
        cb(data);
      }
    }
  }

  onStatusChange(callback) {
    this.statusListeners.add(callback);
    callback(this.isConnected ? 'connected' : 'connecting');
    return () => this.statusListeners.delete(callback);
  }

  notifyStatus(status) {
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
