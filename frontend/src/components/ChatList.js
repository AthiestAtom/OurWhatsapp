import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  IconButton,
  Paper,
  TextField,
  InputAdornment,
  CircularProgress,
  Badge,
} from '@mui/material';
import {
  Search as SearchIcon,
  Chat as ChatIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { socketService } from '../services/socketService';
import { conversationService } from '../services/conversationService';

const ChatList = ({ user }) => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadConversations();
    
    // Listen for new messages
    socketService.on('new_message', handleNewMessage);
    socketService.on('message_read', handleMessageRead);
    
    return () => {
      socketService.off('new_message', handleNewMessage);
      socketService.off('message_read', handleMessageRead);
    };
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await conversationService.getConversations();
      setConversations(data.data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (message) => {
    setConversations(prev => 
      prev.map(conv => 
        conv._id === message.conversationId 
          ? { ...conv, lastMessage: message, updatedAt: new Date() }
          : conv
      ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    );
  };

  const handleMessageRead = (data) => {
    setConversations(prev => 
      prev.map(conv => 
        conv._id === data.conversationId 
          ? { ...conv, unreadCount: Math.max(0, conv.unreadCount - 1) }
          : conv
      )
    );
  };

  const handleChatClick = (conversation) => {
    navigate(`/chat/${conversation._id}`);
  };

  const filteredConversations = conversations.filter(conv =>
    conv.isGroup 
      ? conv.name.toLowerCase().includes(searchQuery.toLowerCase())
      : conv.participants.some(p => 
          p._id !== user._id && 
          p.displayName.toLowerCase().includes(searchQuery.toLowerCase())
        )
  );

  const getChatName = (conversation) => {
    if (conversation.isGroup) {
      return conversation.name;
    }
    
    const otherParticipant = conversation.participants.find(p => p._id !== user._id);
    return otherParticipant?.displayName || 'Unknown';
  };

  const getChatAvatar = (conversation) => {
    if (conversation.isGroup) {
      return conversation.name.charAt(0).toUpperCase();
    }
    
    const otherParticipant = conversation.participants.find(p => p._id !== user._id);
    return otherParticipant?.displayName?.charAt(0).toUpperCase() || '?';
  };

  const getLastMessage = (conversation) => {
    if (!conversation.lastMessage) return 'No messages yet';
    
    const { content, type, sender } = conversation.lastMessage;
    const isOwnMessage = sender._id === user._id;
    
    let messageText = '';
    if (type === 'text') {
      messageText = content;
    } else if (type === 'image') {
      messageText = '📷 Image';
    } else if (type === 'video') {
      messageText = '🎥 Video';
    } else if (type === 'file') {
      messageText = '📎 File';
    } else {
      messageText = content;
    }
    
    return `${isOwnMessage ? 'You: ' : ''}${messageText}`;
  };

  const formatTime = (date) => {
    const messageDate = new Date(date);
    const now = new Date();
    const diffInHours = (now - messageDate) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return messageDate.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return formatDistanceToNow(messageDate, { addSuffix: true });
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#ECE5DD' }}>
      {/* Header */}
      <Paper sx={{ p: 2, bgcolor: '#075E54', color: 'white' }}>
        <Typography variant="h6" component="div">
          OurWhatsApp
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {user.displayName}
        </Typography>
      </Paper>

      {/* Search */}
      <Box sx={{ p: 2, bgcolor: 'white' }}>
        <TextField
          fullWidth
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          variant="outlined"
          size="small"
        />
      </Box>

      {/* Chat List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <List>
          {filteredConversations.map((conversation) => (
            <ListItem
              key={conversation._id}
              button
              onClick={() => handleChatClick(conversation)}
              sx={{
                borderBottom: '1px solid #E0E0E0',
                '&:hover': {
                  bgcolor: '#F5F5F5',
                },
              }}
            >
              <ListItemAvatar>
                <Badge badgeContent={conversation.unreadCount || 0} color="primary">
                  <Avatar sx={{ bgcolor: '#25D366' }}>
                    {getChatAvatar(conversation)}
                  </Avatar>
                </Badge>
              </ListItemAvatar>
              
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      {getChatName(conversation)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {formatTime(conversation.updatedAt)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '250px',
                    }}
                  >
                    {getLastMessage(conversation)}
                  </Typography>
                }
              />
              
              <IconButton edge="end" size="small">
                <MoreVertIcon />
              </IconButton>
            </ListItem>
          ))}
        </List>
        
        {filteredConversations.length === 0 && (
          <Box sx={{ textAlign: 'center', p: 4 }}>
            <ChatIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">
              {searchQuery ? 'No conversations found' : 'No conversations yet'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatList;
