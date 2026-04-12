import io from 'socket.io-client';
import toast from 'react-hot-toast';

class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
  }

  connect() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found for socket connection');
      return;
    }

    this.socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000', {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      toast.success('Connected to chat server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
      toast.error('Disconnected from chat server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      toast.error('Failed to connect to chat server');
    });

    this.socket.on('new_message', (message) => {
      console.log('New message received:', message);
      this.emit('new_message', message);
    });

    this.socket.on('message_read', (data) => {
      console.log('Message read:', data);
      this.emit('message_read', data);
    });

    this.socket.on('user_online', (userId) => {
      console.log('User came online:', userId);
      this.emit('user_online', userId);
    });

    this.socket.on('user_offline', (userId) => {
      console.log('User went offline:', userId);
      this.emit('user_offline', userId);
    });

    this.socket.on('typing', (data) => {
      console.log('User typing:', data);
      this.emit('typing', data);
    });

    this.socket.on('stop_typing', (data) => {
      console.log('User stopped typing:', data);
      this.emit('stop_typing', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  joinRoom(conversationId) {
    this.emit('join_room', conversationId);
  }

  leaveRoom(conversationId) {
    this.emit('leave_room', conversationId);
  }

  sendMessage(conversationId, content, type = 'text') {
    this.emit('send_message', {
      conversationId,
      content,
      type,
    });
  }

  markAsRead(conversationId, messageId) {
    this.emit('mark_as_read', {
      conversationId,
      messageId,
    });
  }

  startTyping(conversationId) {
    this.emit('start_typing', conversationId);
  }

  stopTyping(conversationId) {
    this.emit('stop_typing', conversationId);
  }

  isConnected() {
    return this.connected;
  }
}

export const socketService = new SocketService();
