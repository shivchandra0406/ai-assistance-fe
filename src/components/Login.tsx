import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Box, Avatar, Typography, Button } from '@mui/material';
import { jwtDecode } from 'jwt-decode';

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
  onLogout: () => void;
}

interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onLogout }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('userProfile');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (userProfile) {
      localStorage.setItem('userProfile', JSON.stringify(userProfile));
      onLoginSuccess(userProfile);
    } else {
      localStorage.removeItem('userProfile');
    }
  }, [userProfile, onLoginSuccess]);

  const handleLoginSuccess = (credentialResponse: any) => {
    try {
      const decoded: any = jwtDecode(credentialResponse.credential);
      const profile: UserProfile = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture
      };
      setUserProfile(profile);
    } catch (error) {
      console.error('Error decoding Google credential:', error);
      handleLoginError();
    }
  };

  const handleLoginError = () => {
    console.error('Google Sign In was unsuccessful');
    setUserProfile(null);
    localStorage.removeItem('userProfile');
  };

  const handleLogout = () => {
    setUserProfile(null);
    onLogout();
    localStorage.removeItem('userProfile');
  };

  if (userProfile) {
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
          src={userProfile.picture}
          alt={userProfile.name}
          sx={{ width: 40, height: 40 }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            {userProfile.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {userProfile.email}
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
      <GoogleLogin
        onSuccess={handleLoginSuccess}
        onError={handleLoginError}
        useOneTap
      />
    </Box>
  );
};
