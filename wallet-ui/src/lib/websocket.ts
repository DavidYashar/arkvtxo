/**
 * WebSocket Service for Round-Based Purchase System
 * 
 * Manages Socket.IO connection and event handling
 * Provides hooks for React components to subscribe to real-time updates
 */

import { io, Socket } from 'socket.io-client';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

class WebSocketService {
  private socket: Socket | null = null;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  /**
   * Initialize WebSocket connection
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return;
    }

    console.log('Connecting to WebSocket...', INDEXER_URL);

    this.socket = io(INDEXER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected', this.socket?.id);
      this.connected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 WebSocket reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  /**
   * Join wallet room (for personal notifications)
   */
  joinWallet(walletAddress: string): void {
    if (!this.socket) {
      console.warn('Cannot join wallet room - not connected');
      return;
    }

    console.log('Joining wallet room:', walletAddress.slice(0, 20) + '...');
    this.socket.emit('join-wallet', walletAddress);
  }

  /**
   * Leave wallet room
   */
  leaveWallet(walletAddress: string): void {
    if (!this.socket) {
      return;
    }

    console.log('Leaving wallet room:', walletAddress.slice(0, 20) + '...');
    this.socket.emit('leave-wallet', walletAddress);
  }

  /**
   * Join token room (for token-specific updates)
   */
  joinToken(tokenId: string): void {
    if (!this.socket) {
      console.warn('Cannot join token room - not connected');
      return;
    }

    console.log('Joining token room:', tokenId);
    this.socket.emit('join-token', tokenId);
  }

  /**
   * Leave token room
   */
  leaveToken(tokenId: string): void {
    if (!this.socket) {
      return;
    }

    console.log('Leaving token room:', tokenId);
    this.socket.emit('leave-token', tokenId);
  }

  /**
   * Subscribe to round countdown updates
   */
  onRoundCountdown(callback: (data: {
    tokenId: string;
    secondsRemaining: number;
    totalPending: number;
    nextRoundSize: number;
  }) => void): () => void {
    if (!this.socket) {
      console.warn('Cannot subscribe to round countdown - not connected');
      return () => {};
    }

    this.socket.on('round-countdown', callback);
    
    // Return unsubscribe function
    return () => {
      this.socket?.off('round-countdown', callback);
    };
  }

  /**
   * Subscribe to round completion events
   */
  onRoundCompleted(callback: (data: {
    tokenId: string;
    roundNumber: number;
    requestsConfirmed: number;
    requestsRejected: number;
    processingTimeMs: number;
  }) => void): () => void {
    if (!this.socket) {
      console.warn('Cannot subscribe to round completed - not connected');
      return () => {};
    }

    this.socket.on('round-completed', callback);
    
    return () => {
      this.socket?.off('round-completed', callback);
    };
  }

  /**
   * Subscribe to purchase confirmation events
   */
  onPurchaseConfirmed(callback: (data: {
    requestId: string;
    tokenId: string;
    batchesPurchased: number;
    totalPaid: string;
    roundNumber: number;
  }) => void): () => void {
    if (!this.socket) {
      console.warn('Cannot subscribe to purchase confirmed - not connected');
      return () => {};
    }

    this.socket.on('purchase-confirmed', callback);
    
    return () => {
      this.socket?.off('purchase-confirmed', callback);
    };
  }

  /**
   * Subscribe to purchase rejection events
   */
  onPurchaseRejected(callback: (data: {
    requestId: string;
    tokenId: string;
    reason: string;
    batchesRequested: number;
    roundNumber: number;
  }) => void): () => void {
    if (!this.socket) {
      console.warn('Cannot subscribe to purchase rejected - not connected');
      return () => {};
    }

    this.socket.on('purchase-rejected', callback);
    
    return () => {
      this.socket?.off('purchase-rejected', callback);
    };
  }

  /**
   * Subscribe to payment-requested events (Phase 1: supply confirmed, now request payment)
   */
  onPaymentRequested(callback: (data: {
    requestId: string;
    tokenId: string;
    amount: string;
    creatorAddress: string;
    timeoutSeconds: number;
    roundNumber: number;
  }) => void): () => void {
    if (!this.socket) {
      console.warn('Cannot subscribe to payment requested - not connected');
      return () => {};
    }

    this.socket.on('payment-requested', callback);
    
    return () => {
      this.socket?.off('payment-requested', callback);
    };
  }

  /**
   * Get socket instance (for advanced usage)
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Singleton instance
export const wsService = new WebSocketService();

// Auto-connect on import (client-side only)
if (typeof window !== 'undefined') {
  wsService.connect();
}
