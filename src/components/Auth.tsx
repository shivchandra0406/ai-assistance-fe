import { useState, useEffect, useCallback } from 'react';
import { Box, Avatar, Typography, Button } from '@mui/material';

interface User {
  name: string;
  email: string;
  picture: string;
}

interface AuthProps {
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
}

function Auth({ onLoginSuccess, onLogout }: AuthProps) {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:5001/api/auth/user', {
        credentials: 'include'
      });
      const data = await res.json();
      
      if (data.success && data.data) {
        localStorage.setItem('user', JSON.stringify(data.data));
        setUser(data.data);
        onLoginSuccess(data.data);
      } else {
        localStorage.removeItem('user');
        setUser(null);
        onLogout();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  }, [onLoginSuccess, onLogout]);

  // Check auth status only when component mounts or after login redirect
  useEffect(() => {
    const isRedirect = window.location.search.includes('auth_success');
    const savedUser = localStorage.getItem('user');

    if (isRedirect || !savedUser) {
      checkAuthStatus();
    } else if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      onLoginSuccess(parsedUser);
    }

    // Clean up URL after redirect
    if (isRedirect) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [checkAuthStatus, onLoginSuccess]);

  const handleLogin = () => {
    window.location.href = 'http://localhost:5001/api/auth/login';
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:5001/api/auth/logout', {
        credentials: 'include'
      });
      localStorage.removeItem('user');
      setUser(null);
      onLogout();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  if (user) {
    return (
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 2, 
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
        boxShadow: 1,
        mb: 2
      }}>
        <Avatar
          src={user.picture}
          alt={user.name}
          sx={{ width: 40, height: 40 }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            {user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="primary"
          size="small"
          onClick={handleLogout}
          sx={{ ml: 'auto' }}
        >
          Logout
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      p: 2, 
      display: 'flex', 
      justifyContent: 'center',
      bgcolor: 'background.paper',
      borderRadius: 1,
      boxShadow: 1,
      mb: 2
    }}>
      <Button
        variant="contained"
        color="primary"
        onClick={handleLogin}
      >
        Login with Google
      </Button>
    </Box>
  );
}

export default Auth;
