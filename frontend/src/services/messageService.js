import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const messageService = {
  getMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      const response = await api.get(`/messages/conversation/${conversationId}`, {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to fetch messages';
    }
  },

  sendMessage: async (conversationId, messageData) => {
    try {
      const response = await api.post(`/messages/conversation/${conversationId}`, messageData);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to send message';
    }
  },

  getMessage: async (messageId) => {
    try {
      const response = await api.get(`/messages/${messageId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to fetch message';
    }
  },

  updateMessage: async (messageId, updates) => {
    try {
      const response = await api.put(`/messages/${messageId}`, updates);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to update message';
    }
  },

  deleteMessage: async (messageId) => {
    try {
      const response = await api.delete(`/messages/${messageId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to delete message';
    }
  },

  markAsRead: async (conversationId, messageId = null) => {
    try {
      const response = await api.put(`/messages/${messageId || conversationId}/read`);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to mark message as read';
    }
  },

  updateMessageStatus: async (messageId, status) => {
    try {
      const response = await api.put(`/messages/${messageId}/status`, { status });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to update message status';
    }
  },

  uploadFile: async (file, conversationId) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);

      const response = await api.post('/messages/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to upload file';
    }
  },

  searchMessages: async (conversationId, query) => {
    try {
      const response = await api.get(`/messages/search`, {
        params: { conversationId, query },
      });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to search messages';
    }
  },
};
