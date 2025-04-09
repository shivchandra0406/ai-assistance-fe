import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Dialog,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import CloseIcon from '@mui/icons-material/Close';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { saveAs } from 'file-saver';
import { API } from '../services/api';
import { wsService, WebSocketError } from '../services/websocket';

interface Props {
  userProfile: {
    name: string;
    email: string;
    picture: string;
  } | null;
  onClose: () => void;
}

interface Message {
  text: string;
  isUser: boolean;
  type?: 'text' | 'excel' | 'background_process';
  data?: any[];
  isProcessing?: boolean;
  excelData?: {
    excel_data: string;
    filename: string;
    row_count: number;
  };
  backgroundData?: BackgroundData;
}

interface WebSocketMessage {
  type: 'status_update';
  room_id: string;
  status: string;
  progress: number;
}

interface BackgroundData {
  room_id: string;
  status: string;
  progress?: number;
}

interface WebSocketResponse {
  type: string;
  room_id: string;
  data?: any[];
  status: string;
  progress?: number;
  row_count?: number;
}

interface ExcelData {
  excel_data: string; 
  filename: string;
  row_count: number;
}

interface BackgroundProcessData {
  room_id: string;
  status: string;
  row_count?: number;
  progress?: number;
}

interface ResponseData {
  success?: boolean;
  message?: string;
  type?: 'text' | 'excel' | 'background_process';
  data?: any[] | {
    excel_data: string;
    filename: string;
    row_count: number;
  };
  excel_data?: ExcelData;
  background_process?: BackgroundProcessData;
}

const Assistant: React.FC<Props> = ({ userProfile, onClose }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDataTable, setShowDataTable] = useState(false);
  const [currentViewData, setCurrentViewData] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const { transcript, listening, browserSupportsSpeechRecognition } = useSpeechRecognition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Set up WebSocket event listeners
    const handleConnect = () => {
      console.log('WebSocket Connected');
      setIsSocketConnected(true);
    };

    const handleDisconnect = ({ code, reason }: { code: number; reason: string }) => {
      console.log('WebSocket Disconnected', code, reason);
      setIsSocketConnected(false);
      
      // Show disconnection message to user if it's not a normal closure
      if (code !== 1000) {
        setMessages(prev => [...prev, {
          text: 'Connection lost. Attempting to reconnect...',
          isUser: false,
          type: 'text'
        }]);
      }
    };

    const handleError = (error: WebSocketError) => {
      console.error('WebSocket Error in Assistant:', error);
      setIsSocketConnected(false);

      // Show error message to user
      setMessages(prev => [...prev, {
        text: 'Connection error occurred. The chat will continue to work, but real-time updates might be delayed.',
        isUser: false,
        type: 'text'
      }]);
    };

    const handleMessage = (data: WebSocketMessage) => {
      try {
        if (data.type === 'status_update') {
          setMessages(prev => prev.map(msg => {
            if (msg.backgroundData?.room_id === data.room_id) {
              return {
                ...msg,
                backgroundData: {
                  room_id: data.room_id,
                  status: data.status,
                  progress: data.progress
                }
              };
            }
            return msg;
          }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    try {
      wsService.on('connected', handleConnect);
      wsService.on('disconnected', handleDisconnect);
      wsService.on('error', handleError);
      wsService.on('message', handleMessage);

      // Attempt to connect if not already connected
      if (!wsService.isConnectedToServer()) {
        wsService.connect();
      }

      // Cleanup event listeners
      return () => {
        try {
          wsService.removeListener('connected', handleConnect);
          wsService.removeListener('disconnected', handleDisconnect);
          wsService.removeListener('error', handleError);
          wsService.removeListener('message', handleMessage);
        } catch (error) {
          console.error('Error cleaning up WebSocket listeners:', error);
        }
      };
    } catch (error) {
      console.error('Error setting up WebSocket in Assistant:', error);
    }
  }, []);

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleViewData = useCallback((data: any[]) => {
    if (data && data.length > 0) {
      setCurrentViewData(data);
      setShowDataTable(true);
    }
  }, []);

  const handleRequestSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);

    const sortedData = [...currentViewData].sort((a, b) => {
      const aValue = a[property];
      const bValue = b[property];
      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      return (aValue < bValue ? -1 : 1) * (isAsc ? 1 : -1);
    });
    setCurrentViewData(sortedData);
  };

  const downloadExcelFromBase64 = (base64Data: string, filename: string) => {
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !userProfile?.email) {
      console.error('Missing user email or invalid input');
      return;
    }

    const userMessage: Message = {
      text: input,
      isUser: true
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    setIsLoading(true);

    try {
      const response = await API.buildQuery(input, userProfile.email);
      console.log('API Response:', response);

      if (response.success) {
        let botMessage: Message;

        switch (response.type) {
          case 'text':
            botMessage = {
              text: response.message || 'Here is your data:',
              isUser: false,
              type: 'text',
              data: response.data
            };
            break;

          case 'excel':
            botMessage = {
              text: `Excel file ready with ${response.data?.row_count || 0} rows. Click to download.`,
              isUser: false,
              type: 'excel',
              excelData: {
                excel_data: response.data.excel_data,
                filename: response.data.filename,
                row_count: response.data.row_count
              }
            };
            break;

          case 'background_process':
            botMessage = {
              text: 'Processing your request in the background...',
              isUser: false,
              type: 'background_process',
              backgroundData: {
                room_id: response.background_process?.room_id || '',
                status: response.background_process?.status || 'processing',
                progress: response.background_process?.progress
              }
            };
            if (response.background_process?.room_id) {
              wsService.joinRoom(response.background_process.room_id);
            }
            break;

          default:
            botMessage = {
              text: response.message || 'No data available',
              isUser: false
            };
        }

        setMessages(prev => [...prev, botMessage]);

        if (response.type === 'text' && Array.isArray(response.data) && response.data.length > 0) {
          handleViewData(response.data);
        }
      } else {
        setMessages(prev => [...prev, {
          text: response.message || 'An error occurred while processing your request',
          isUser: false
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        text: 'Sorry, there was an error processing your request. Please try again.',
        isUser: false
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({ continuous: true });
    }
  };

  return (
    <>
      <Dialog
        open={showDataTable}
        onClose={() => setShowDataTable(false)}
        maxWidth={false}
        sx={{
          '& .MuiDialog-paper': {
            width: '75%',
            margin: '0 auto',
            maxHeight: '95vh'
          }
        }}
      >
        <Box sx={{
          bgcolor: 'primary.main',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 0.75,
          minHeight: '48px',
          color: 'white'
        }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem', ml: 1 }}>Data View</Typography>
          <IconButton
            onClick={() => setShowDataTable(false)}
            sx={{ 
              color: 'white',
              p: 0.5,
              mr: 0.5,
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)'
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <TableContainer sx={{ 
          maxHeight: '85vh',
          pb: 2,
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px'
          },
          '&::-webkit-scrollbar-track': {
            background: '#f1f1f1',
            borderRadius: '4px'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#888',
            borderRadius: '4px',
            '&:hover': {
              background: '#666'
            }
          },
          overflowX: 'auto',
          overflowY: 'auto'
        }}>
          <Table stickyHeader size="small" sx={{ 
            tableLayout: 'fixed',
            mb: 1,
            '& .MuiTableCell-root': {
              borderRight: '1px solid #e0e0e0',
              '&:last-child': {
                borderRight: 'none'
              }
            }
          }}>
            <TableHead>
              <TableRow>
                {currentViewData.length > 0 && Object.keys(currentViewData[0]).map((column) => (
                  <TableCell
                    key={column}
                    sortDirection={orderBy === column ? order : false}
                    sx={{
                      fontWeight: 600,
                      backgroundColor: '#f8fafc',
                      padding: '4px 6px',
                      whiteSpace: 'nowrap',
                      fontSize: '0.875rem',
                      borderBottom: '2px solid #e5e7eb',
                      minWidth: '120px',
                      '&:first-of-type': { pl: 2 },
                      '&:last-child': { pr: 2 }
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === column}
                      direction={orderBy === column ? order : 'asc'}
                      onClick={() => handleRequestSort(column)}
                    >
                      {column}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {currentViewData.map((row, index) => (
                <TableRow 
                  key={index} 
                  hover
                  sx={{
                    '&:nth-of-type(odd)': {
                      backgroundColor: '#f8fafc',
                    }
                  }}
                >
                  {Object.values(row).map((value: any, cellIndex) => (
                    <TableCell 
                      key={cellIndex}
                      sx={{
                        padding: '3px 6px',
                        whiteSpace: 'nowrap',
                        minWidth: '120px',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: '0.875rem',
                        borderBottom: '1px solid #e5e7eb',
                        '&:first-of-type': { pl: 2 },
                        '&:last-child': { pr: 2 }
                      }}
                    >
                      {value?.toString() ?? ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Dialog>

      <Box sx={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <Box sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'primary.main',
          color: 'white'
        }}>
          <Typography variant="h6">AI Assistant</Typography>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {messages.map((message, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: message.isUser ? 'flex-end' : 'flex-start',
                mb: 0.5
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  p: 1,
                  backgroundColor: message.isUser ? '#2563EB' : '#F3F4F6',
                  color: message.isUser ? '#FFFFFF' : '#1F2937',
                  borderRadius: 2,
                  maxWidth: '80%'
                }}
              >
                <Typography variant="body2">{message.text}</Typography>
                {message.data && message.data.length > 0 && (
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: message.isUser ? 'rgba(255,255,255,0.9)' : '#2563EB',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => message.data && handleViewData(message.data)}
                    >
                      <FullscreenIcon sx={{ fontSize: '0.875rem' }} />
                      {message.data.length} row{message.data.length !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                )}
                {message.excelData && (
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: message.isUser ? 'rgba(255,255,255,0.9)' : '#2563EB',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                      onClick={() => downloadExcelFromBase64(message.excelData!.excel_data, message.excelData!.filename)}
                    >
                      <FileDownloadIcon sx={{ fontSize: '0.875rem' }} />
                      {message.excelData.row_count} row{message.excelData.row_count !== 1 ? 's' : ''}
                    </Typography>
                  </Box>
                )}
                {message.backgroundData && (
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center' }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: message.isUser ? 'rgba(255,255,255,0.9)' : '#2563EB',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                    >
                      <CircularProgress size={16} sx={{ color: '#2563EB' }} />
                      {message.backgroundData.status} ({message.backgroundData.progress}%)
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Box>
          ))}
          {isLoading && (
            <Box sx={{ alignSelf: 'flex-start', padding: 2 }}>
              <Typography color="text.secondary">Thinking...</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, px: 2, pb: 1 }}>
          <Box sx={{ position: 'relative', width: '100%' }}>
            <TextField
              fullWidth
              variant="outlined"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '30px',
                  backgroundColor: '#ffffff',
                  '& fieldset': { borderColor: '#e0e0e0' },
                  paddingLeft: '40px',
                  paddingRight: browserSupportsSpeechRecognition ? '40px' : '14px'
                }
              }}
            />
            <HelpOutlineIcon
              sx={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9e9e9e',
                zIndex: 1
              }}
            />
            {browserSupportsSpeechRecognition && (
              <IconButton
                onClick={toggleListening}
                sx={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: listening ? '#f44336' : '#5e35b1',
                  zIndex: 1
                }}
              >
                {listening ? <StopIcon /> : <MicIcon />}
              </IconButton>
            )}
          </Box>

          <Button
            variant="contained"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            sx={{
              bgcolor: '#5e35b1',
              '&:hover': { bgcolor: '#4527a0' },
              borderRadius: '50%',
              minWidth: '48px',
              width: '48px',
              height: '48px',
              padding: 0
            }}
          >
            <SendIcon />
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default Assistant;
