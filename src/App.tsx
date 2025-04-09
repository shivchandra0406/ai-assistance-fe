import React from 'react';
import { ThemeProvider, createTheme, CssBaseline, Container, AppBar, Toolbar, Typography } from '@mui/material';
import Assistant from './components/Assistant';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">
            AI Assistant
          </Typography>
        </Toolbar>
      </AppBar>
      <Container>
        <Assistant />
      </Container>
    </ThemeProvider>
  );
}

export default App;
