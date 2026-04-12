import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Typography,
  Avatar,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  AppBar,
  Toolbar,
  Badge,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  MoreVert as MoreVertIcon,
  AttachFile as AttachFileIcon,
  Mic as MicIcon,
  InsertEmoticon as EmojiIcon,
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { socketService } from '../services/socketService';
import { messageService } from '../services/messageService';
import { conversationService } from '../services/conversationService';

const Chat = ({ user }) => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (conversationId) {
      loadConversation();
      loadMessages();
      
      // Join socket room
      socketService.joinRoom(conversationId);
      
      // Listen for socket events
      socketService.on('new_message', handleNewMessage);
      socketService.on('message_read', handleMessageRead);
      socketService.on('typing', handleTyping);
      socketService.on('stop_typing', handleStopTyping);
      
      return () => {
        socketService.leaveRoom(conversationId);
        socketService.off('new_message', handleNewMessage);
        socketService.off('message_read', handleMessageRead);
        socketService.off('typing', handleTyping);
        socketService.off('stop_typing', handleStopTyping);
      };
    }
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = async () => {
    try {
      const data = await conversationService.getConversation(conversationId);
      setConversation(data.data);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Failed to load conversation');
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const data = await messageService.getMessages(conversationId);
      setMessages(data.data);
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (message) => {
    if (message.conversationId === conversationId) {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
      
      // Mark as read if not own message
      if (message.sender._id !== user._id) {
        socketService.markAsRead(conversationId, message._id);
      }
    }
  };

  const handleMessageRead = (data) => {
    if (data.conversationId === conversationId) {
      setMessages(prev =>
        prev.map(msg =>
          msg._id === data.messageId
            ? { ...msg, readBy: [...(msg.readBy || []), data.userId] }
            : msg
        )
      );
    }
  };

  const handleTyping = (data) => {
    if (data.conversationId === conversationId && data.userId !== user._id) {
      setTypingUsers(prev => [...prev.filter(u => u !== data.userId), data.userId]);
    }
  };

  const handleStopTyping = (data) => {
    if (data.conversationId === conversationId) {
      setTypingUsers(prev => prev.filter(u => u !== data.userId));
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const message = await messageService.sendMessage(conversationId, {
        content: messageContent,
        type: 'text',
      });
      
      setMessages(prev => [...prev, message.data]);
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      setNewMessage(messageContent); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTypingStart = () => {
    if (!typing) {
      setTyping(true);
      socketService.startTyping(conversationId);
    }
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false);
      socketService.stopTyping(conversationId);
    }, 1000);
  };

  const getChatName = () => {
    if (!conversation) return 'Loading...';
    
    if (conversation.isGroup) {
      return conversation.name;
    }
    
    const otherParticipant = conversation.participants.find(p => p._id !== user._id);
    return otherParticipant?.displayName || 'Unknown';
  };

  const getChatAvatar = () => {
    if (!conversation) return '?';
    
    if (conversation.isGroup) {
      return conversation.name.charAt(0).toUpperCase();
    }
    
    const otherParticipant = conversation.participants.find(p => p._id !== user._id);
    return otherParticipant?.displayName?.charAt(0).toUpperCase() || '?';
  };

  const formatMessageTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOwnMessage = (message) => {
    return message.sender._id === user._id;
  };

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
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
      <AppBar position="static" sx={{ bgcolor: '#075E54' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/chats')} sx={{ color: 'white' }}>
            <ArrowBackIcon />
          </IconButton>
          
          <Avatar sx={{ ml: 1, bgcolor: '#25D366' }}>
            {getChatAvatar()}
          </Avatar>
          
          <Box sx={{ ml: 2, flex: 1 }}>
            <Typography variant="h6" sx={{ color: 'white' }}>
              {getChatName()}
            </Typography>
            <Typography variant="caption" sx={{ color: 'white', opacity: 0.8 }}>
              {typingUsers.length > 0 ? 'typing...' : 'online'}
            </Typography>
          </Box>
          
          <IconButton sx={{ color: 'white' }} onClick={handleMenuClick}>
            <MoreVertIcon />
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleMenuClose}>View Contact</MenuItem>
            <MenuItem onClick={handleMenuClose}>Media, Links, and Docs</MenuItem>
            <MenuItem onClick={handleMenuClose}>Search</MenuItem>
            <MenuItem onClick={handleMenuClose}>Mute Notifications</MenuItem>
            <MenuItem onClick={handleMenuClose}>More</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <List>
          {messages.map((message) => (
            <ListItem
              key={message._id}
              sx={{
                flexDirection: isOwnMessage(message) ? 'row-reverse' : 'row',
                mb: 1,
                px: 0,
              }}
            >
              <Box
                sx={{
                  maxWidth: '70%',
                  bgcolor: isOwnMessage(message) ? '#DCF8C6' : 'white',
                  borderRadius: 2,
                  p: 1.5,
                  boxShadow: 1,
                }}
              >
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {message.content}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    textAlign: isOwnMessage(message) ? 'right' : 'left',
                    mt: 0.5,
                    color: 'text.secondary',
                  }}
                >
                  {formatMessageTime(message.createdAt)}
                  {isOwnMessage(message) && (
                    <span style={{ marginLeft: 4 }}>
                      {message.readBy?.includes(conversation.participants.find(p => p._id !== user._id)?._id) ? '✓✓' : '✓'}
                    </span>
                  )}
                </Typography>
              </Box>
            </ListItem>
          ))}
        </List>
        
        <div ref={messagesEndRef} />
      </Box>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Someone is typing...
          </Typography>
        </Box>
      )}

      {/* Message Input */}
      <Paper sx={{ p: 1, display: 'flex', alignItems: 'center', bgcolor: 'white' }}>
        <IconButton size="small">
          <EmojiIcon />
        </IconButton>
        
        <IconButton size="small">
          <AttachFileIcon />
        </IconButton>
        
        <TextField
          fullWidth
          placeholder="Type a message"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          onFocus={handleTypingStart}
          variant="outlined"
          size="small"
          sx={{ mx: 1 }}
          disabled={sending}
        />
        
        {newMessage.trim() ? (
          <IconButton onClick={handleSendMessage} disabled={sending}>
            {sending ? <CircularProgress size={24} /> : <SendIcon />}
          </IconButton>
        ) : (
          <IconButton>
            <MicIcon />
          </IconButton>
        )}
      </Paper>
    </Box>
  );
};

export default Chat;
