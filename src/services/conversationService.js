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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const conversationService = {
  // Get all conversations for the current user
  getConversations: async () => {
    try {
      const response = await api.get('/conversations');
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to fetch conversations';
    }
  },

  // Get a single conversation by ID
  getConversation: async (conversationId) => {
    try {
      const response = await api.get(`/conversations/${conversationId}`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to fetch conversation';
    }
  },

  // Create a new conversation
  createConversation: async (participantId) => {
    try {
      const response = await api.post('/conversations', {
        participantId
      });
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to create conversation';
    }
  },

  // Update conversation details
  updateConversation: async (conversationId, updates) => {
    try {
      const response = await api.put(`/conversations/${conversationId}`, updates);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to update conversation';
    }
  },

  // Delete a conversation
  deleteConversation: async (conversationId) => {
    try {
      const response = await api.delete(`/conversations/${conversationId}`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to delete conversation';
    }
  },

  // Mark conversation as read
  markAsRead: async (conversationId) => {
    try {
      const response = await api.put(`/conversations/${conversationId}/read`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to mark conversation as read';
    }
  },

  // Archive conversation
  archiveConversation: async (conversationId) => {
    try {
      const response = await api.put(`/conversations/${conversationId}/archive`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to archive conversation';
    }
  },

  // Unarchive conversation
  unarchiveConversation: async (conversationId) => {
    try {
      const response = await api.put(`/conversations/${conversationId}/unarchive`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to unarchive conversation';
    }
  },

  // Search conversations
  searchConversations: async (query) => {
    try {
      const response = await api.get(`/conversations/search?q=${encodeURIComponent(query)}`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to search conversations';
    }
  },

  // Get conversation participants
  getParticipants: async (conversationId) => {
    try {
      const response = await api.get(`/conversations/${conversationId}/participants`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to fetch participants';
    }
  },

  // Add participant to conversation
  addParticipant: async (conversationId, participantId) => {
    try {
      const response = await api.post(`/conversations/${conversationId}/participants`, {
        participantId
      });
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to add participant';
    }
  },

  // Remove participant from conversation
  removeParticipant: async (conversationId, participantId) => {
    try {
      const response = await api.delete(`/conversations/${conversationId}/participants/${participantId}`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to remove participant';
    }
  },

  // Leave conversation
  leaveConversation: async (conversationId) => {
    try {
      const response = await api.post(`/conversations/${conversationId}/leave`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to leave conversation';
    }
  },

  // Mute conversation
  muteConversation: async (conversationId, duration) => {
    try {
      const response = await api.put(`/conversations/${conversationId}/mute`, {
        duration
      });
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to mute conversation';
    }
  },

  // Unmute conversation
  unmuteConversation: async (conversationId) => {
    try {
      const response = await api.put(`/conversations/${conversationId}/unmute`);
      return response.data.data;
    } catch (error) {
      throw error.response?.data?.message || 'Failed to unmute conversation';
    }
  }
};
