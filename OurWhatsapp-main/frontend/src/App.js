import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import { Toaster } from 'react-hot-toast';
import io from 'socket.io-client';

// Components
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import Chat from './components/Chat';
import Navbar from './components/Navbar';

// Services
import { authService } from './services/authService';
import { socketService } from './services/socketService';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#25D366', // WhatsApp green
    },
    secondary: {
      main: '#128C7E', // WhatsApp dark green
    },
    background: {
      default: '#ECE5DD', // WhatsApp light background
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const checkAuth = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  useEffect(() => {
    // Initialize socket connection when user is logged in
    if (user) {
      socketService.connect();
      return () => socketService.disconnect();
    }
  }, [user]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="#ECE5DD"
      >
        <div>Loading...</div>
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Toaster position="top-right" />
          
          {user && <Navbar user={user} setUser={setUser} />}
          
          <Routes>
            <Route
              path="/login"
              element={user ? <Navigate to="/chats" /> : <Login setUser={setUser} />}
            />
            <Route
              path="/register"
              element={user ? <Navigate to="/chats" /> : <Register setUser={setUser} />}
            />
            <Route
              path="/chats"
              element={user ? <ChatList user={user} /> : <Navigate to="/login" />}
            />
            <Route
              path="/chat/:conversationId"
              element={user ? <Chat user={user} /> : <Navigate to="/login" />}
            />
            <Route
              path="/"
              element={<Navigate to={user ? "/chats" : "/login"} />}
            />
          </Routes>
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App;
