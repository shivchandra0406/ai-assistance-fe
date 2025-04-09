import React from 'react';
import { ThemeProvider, createTheme, CssBaseline, Container, AppBar, Toolbar, Typography, Box, IconButton } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import Assistant from './components/Assistant';
import Auth from './components/Auth';

interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);
  const [showChat, setShowChat] = React.useState(false);

  const handleLoginSuccess = (profile: UserProfile) => {
    setIsLoggedIn(true);
    setUserProfile(profile);
    setShowChat(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserProfile(null);
    setShowChat(false);
  };

  const handleChatIconClick = () => {
    if (isLoggedIn) {
      setShowChat(true);
    } else {
      setShowChat(prev => !prev);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ 
        position: 'fixed', 
        bottom: 20, 
        right: 20, 
        zIndex: 1000 
      }}>
        {!showChat && (
          <IconButton
            onClick={handleChatIconClick}
            sx={{
              backgroundColor: 'primary.main',
              color: 'white',
              width: 56,
              height: 56,
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
              boxShadow: 3
            }}
          >
            <ChatIcon />
          </IconButton>
        )}
        
        {showChat && (
          <Box sx={{
            position: 'fixed',
            bottom: 0,
            right: 20,
            width: 350,
            maxHeight: '80vh',
            backgroundColor: 'background.paper',
            borderRadius: '8px 8px 0 0',
            boxShadow: 3,
            overflow: 'hidden'
          }}>
            {!isLoggedIn ? (
              <Auth onLoginSuccess={handleLoginSuccess} onLogout={handleLogout} />
            ) : (
              showChat && userProfile && (
                <Assistant 
                  userProfile={userProfile} 
                  onClose={() => setShowChat(false)}
                />
              )
            )}
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}

export default App;
