import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  IconButton,
  Dialog,
  Fab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  TableSortLabel
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { saveAs } from 'file-saver';
import { API } from '../services/api';

interface ExcelData {
  excel_data: string; // base64 encoded excel data
  filename: string;
  row_count: number;
}

interface BackgroundProcessData {
  room_id: string;
  row_count: number;
  status?: 'processing' | 'completed' | 'error';
  progress?: number;
}

interface Message {
  text: string;
  isUser: boolean;
  data?: any[];
  type?: 'text' | 'excel' | 'background_process';
  excelData?: ExcelData;
  backgroundData?: BackgroundProcessData;
  isProcessing?: boolean;
}

interface WebSocketResponse {
  type: 'update' | 'processing_status';
  room_id: string;
  data?: any[];
  row_count: number;
  status?: 'processing' | 'completed' | 'error';
  progress?: number;
}

// We could add interfaces for history data if needed in the future

const Assistant: React.FC = () => {
  // We use Material UI's responsive breakpoints instead of manually tracking mobile state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // Used by WebSocket to store data for each room
  const [socketData, setSocketData] = useState<{[key: string]: any[]}>({});
  // For data table view
  const [showDataTable, setShowDataTable] = useState(false);
  const [currentViewData, setCurrentViewData] = useState<any[]>([]);
  const [orderBy, setOrderBy] = useState<string>('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  // For minimized chat view - start minimized to show at bottom right
  const [isMinimized, setIsMinimized] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activeRooms, setActiveRooms] = useState<Set<string>>(new Set());

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Handle WebSocket connection and reconnection
  const connectWebSocket = useCallback(() => {
    try {
      const socket = new WebSocket('ws://localhost:5001/socket.io/?EIO=4&transport=websocket');
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        console.log('Connected to WebSocket server');
        setIsSocketConnected(true);
        
        // Rejoin all active rooms after reconnection
        const rooms = Array.from(activeRooms);
        rooms.forEach(roomId => {
          socket.send(JSON.stringify({
            type: 'join',
            room_id: roomId
          }));
        });
      });

      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketResponse;
          console.log('Message from server:', data);

          switch (data.type) {
            case 'update':
              if (data.room_id) {
                // Join the room if we receive an update for it
                joinRoom(data.room_id);
                
                setSocketData(prevData => ({
                  ...prevData,
                  [data.room_id]: data.data || []
                }));

                setMessages(prevMessages =>
                  prevMessages.map(msg => {
                    if (msg.backgroundData && msg.backgroundData.room_id === data.room_id) {
                      return {
                        ...msg,
                        backgroundData: {
                          room_id: data.room_id,
                          row_count: data.row_count,
                          status: data.status
                        }
                      };
                    }
                    return msg;
                  })
                );
              }
              break;

            case 'processing_status':
              if (data.room_id) {
                setMessages(prevMessages =>
                  prevMessages.map(msg => {
                    if (msg.backgroundData && msg.backgroundData.room_id === data.room_id) {
                      return {
                        ...msg,
                        backgroundData: {
                          ...msg.backgroundData,
                          status: data.status,
                          progress: data.progress
                        }
                      };
                    }
                    return msg;
                  })
                );
              }
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      socket.addEventListener('close', () => {
        console.log('WebSocket connection closed');
        setIsSocketConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      });

      socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        setIsSocketConnected(false);
      });
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setIsSocketConnected(false);
      // Attempt to reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    }
  }, [activeRooms]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Join a room
  const joinRoom = useCallback((roomId: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && !activeRooms.has(roomId)) {
      socketRef.current.send(JSON.stringify({
        type: 'join',
        room_id: roomId
      }));
      setActiveRooms(prev => {
        const newRooms = new Set(prev);
        newRooms.add(roomId);
        return newRooms;
      });
    }
  }, [activeRooms]);

  // Function to download Excel file from base64 data
  const downloadExcelFromBase64 = (base64Data: string, filename: string) => {
    // Convert base64 to binary
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob and download
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
  };

  // Define response data interface
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = { text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);

    // Clear input and set loading
    setInput('');
    setIsLoading(true);
    resetTranscript();

    try {
      // Send to API
      const response = await API.buildQuery(input);
      const responseData: ResponseData = response.data;

      if (responseData.success) {
        // Create assistant message
        const assistantMessage: Message = {
          text: responseData.message || 'Here is the data you requested.',
          isUser: false
        };

        // Handle different response types based on the response type
        switch (responseData.type) {
          case 'excel':
            // Handle Excel data
            assistantMessage.type = 'excel';

            // Check if excel data is in the data property (nested)
            if (responseData.data && typeof responseData.data === 'object' && 'excel_data' in responseData.data) {
              const excelData = responseData.data as {
                excel_data: string;
                filename: string;
                row_count: number;
              };

              assistantMessage.excelData = {
                excel_data: excelData.excel_data,
                filename: excelData.filename,
                row_count: excelData.row_count
              };
            }
            // Check if excel data is directly in excel_data property
            else if (responseData.excel_data) {
              assistantMessage.excelData = responseData.excel_data;
            }
            // Handle case where excel data is in the data property (flat structure)
            else if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data) && 'excel_data' in responseData.data) {
              const excelObj = responseData.data as any;
              assistantMessage.excelData = {
                excel_data: excelObj.excel_data,
                filename: excelObj.filename || `excel_${new Date().getTime()}.xlsx`,
                row_count: excelObj.row_count || 0
              };
            }
            break;

          case 'background_process':
            // Handle background process
            assistantMessage.type = 'background_process';

            if (responseData.background_process) {
              assistantMessage.backgroundData = responseData.background_process;
              assistantMessage.isProcessing = true;
            }
            break;

          default:
            // Default to text/data
            assistantMessage.type = 'text';

            if (responseData.data && Array.isArray(responseData.data)) {
              assistantMessage.data = responseData.data;
            }
            break;
        }

        // Add assistant message
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Handle error
        setMessages(prev => [...prev, {
          text: responseData.message || 'Sorry, I encountered an error.',
          isUser: false
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        text: 'Sorry, there was an error processing your request.',
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
      resetTranscript();
      SpeechRecognition.startListening({ continuous: true });
    }
  };

  // Sort function for table data
  const sortData = (data: any[], property: string, direction: 'asc' | 'desc') => {
    return [...data].sort((a, b) => {
      const valueA = a[property];
      const valueB = b[property];

      // Handle different data types
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return direction === 'asc' ? valueA - valueB : valueB - valueA;
      }

      // Default string comparison
      const stringA = String(valueA).toLowerCase();
      const stringB = String(valueB).toLowerCase();
      return direction === 'asc'
        ? stringA.localeCompare(stringB)
        : stringB.localeCompare(stringA);
    });
  };

  // Handle sort request
  const handleRequestSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Handle view data button click
  const handleViewData = useCallback((data: any[] | undefined) => {
    if (data && data.length > 0) {
      setCurrentViewData(data);
      setShowDataTable(true);
    }
  }, []);

  // Dynamic table component with sorting
  const DynamicTable = ({ data, enableSort = true }: { data: any[], enableSort?: boolean }) => {
    if (!data || data.length === 0) return null;
    const headers = Object.keys(data[0]);

    // Apply sorting if enabled
    const sortedData = enableSort && orderBy ? sortData(data, orderBy, order) : data;

    return (
      <Box sx={{ mt: 0, mb: 0, width: '100%' }}>
        <TableContainer sx={{
          maxHeight: 'calc(100vh - 100px)', // Taller table with less space around it
          boxShadow: 'none',
          border: '1px solid #e0e0e0',
          borderRadius: 0, // No rounded corners
          overflowX: 'auto',
          overflowY: 'auto'
        }}>
          <Table stickyHeader size="small" sx={{ width: '100%' }}>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableCell
                    key={header}
                    sx={{
                      fontWeight: 'bold',
                      color: '#ffffff',
                      backgroundColor: '#5e35b1', // Match assistant theme
                      borderBottom: 'none'
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === header}
                      direction={orderBy === header ? order : 'asc'}
                      onClick={() => handleRequestSort(header)}
                      sx={{
                        '& .MuiTableSortLabel-icon': {
                          color: '#ffffff !important',
                        },
                        '&.Mui-active': {
                          color: '#ffffff',
                        },
                        color: '#ffffff'
                      }}
                    >
                      {header}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((row, index) => (
                <TableRow
                  key={index}
                  sx={{
                    '&:nth-of-type(odd)': { bgcolor: '#f5f5f5' },
                    '&:nth-of-type(even)': { bgcolor: '#ffffff' },
                    '&:hover': { bgcolor: '#e0f7fa' }
                  }}
                >
                  {headers.map((header) => (
                    <TableCell
                      key={`${index}-${header}`}
                      sx={{ borderBottom: '1px solid #e0e0e0' }}
                    >
                      {row[header]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {/* Excel download button removed as requested */}
      </Box>
    );
  };

  return (
    <>
      {/* Listening indicator moved inside the assistant box */}

      {/* Data Table View (shown when data is being viewed) */}
      <Dialog
        open={showDataTable}
        onClose={() => setShowDataTable(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            overflow: 'hidden'
          }
        }}
      >
        <Box sx={{
          bgcolor: '#6D28D9',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 1.5,
          color: 'white'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 500, fontSize: '1.1rem' }}>
            View Data
          </Typography>
          <IconButton
            size="small"
            onClick={() => setShowDataTable(false)}
            sx={{
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.1)'
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <TableContainer 
          component={Paper} 
          elevation={0}
          sx={{ 
            maxHeight: '70vh',
            m: 2,
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            '& .MuiTable-root': {
              borderCollapse: 'separate',
              borderSpacing: 0,
            }
          }}
        >
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {Object.keys(currentViewData[0] || {}).map((key) => (
                  <TableCell
                    key={key}
                    sortDirection={orderBy === key ? order : false}
                    sx={{
                      bgcolor: '#f8fafc',
                      fontWeight: 600,
                      color: '#1f2937',
                      borderBottom: '2px solid #e5e7eb',
                      '&:first-of-type': {
                        borderTopLeftRadius: '8px'
                      },
                      '&:last-child': {
                        borderTopRightRadius: '8px'
                      }
                    }}
                  >
                    <TableSortLabel
                      active={orderBy === key}
                      direction={orderBy === key ? order : 'asc'}
                      onClick={() => handleRequestSort(key)}
                      sx={{
                        '&.MuiTableSortLabel-root': {
                          color: '#1f2937',
                        },
                        '&.MuiTableSortLabel-root:hover': {
                          color: '#2563eb',
                        },
                        '&.Mui-active': {
                          color: '#2563eb',
                        },
                        '& .MuiTableSortLabel-icon': {
                          color: '#2563eb !important',
                        }
                      }}
                    >
                      {key}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {currentViewData.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  sx={{
                    '&:nth-of-type(odd)': {
                      bgcolor: '#f8fafc',
                    },
                    '&:nth-of-type(even)': {
                      bgcolor: '#ffffff',
                    },
                    '&:hover': {
                      bgcolor: '#f1f5f9',
                    },
                    '&:last-child td': {
                      borderBottom: 0,
                    },
                    '&:last-child td:first-of-type': {
                      borderBottomLeftRadius: '8px'
                    },
                    '&:last-child td:last-child': {
                      borderBottomRightRadius: '8px'
                    }
                  }}
                >
                  {Object.values(row).map((value: any, cellIndex) => (
                    <TableCell 
                      key={cellIndex}
                      sx={{
                        borderBottom: '1px solid #e5e7eb',
                        color: '#374151',
                        fontSize: '0.875rem',
                        py: 1.5,
                        px: 2
                      }}
                    >
                      {value?.toString() || ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Dialog>

      {/* Chat Assistant (normal or minimized) */}
      <Box sx={{
        position: 'fixed',
        bottom: 0,
        ...(isMinimized ? {
          right: 0, // Fixed to right side
          width: { xs: '100%', sm: '350px' }, // Mobile: full width, Desktop: 350px
          height: { xs: 'calc(100vh - 56px)', sm: '600px' }, // Mobile: full height minus header, Desktop: 600px
        } : {
          left: 0,
          right: 0,
          top: 0,
        }),
        zIndex: 1300,
      }}>
        <Fab
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            display: isOpen ? 'none' : 'flex',
            bgcolor: '#5e35b1',
            color: '#ffffff',
            '&:hover': { bgcolor: '#4527a0' }
          }}
          onClick={() => {
            setIsOpen(true);
            // Ensure it's minimized when first opened
            setIsMinimized(true);
          }}
        >
          <SmartToyIcon />
        </Fab>

        <Dialog
          open={isOpen}
          fullWidth
          maxWidth="sm"
          onClose={() => {
            if (showDataTable && isMinimized) {
              setIsOpen(false);
            } else {
              setIsOpen(false);
              setShowDataTable(false);
              // Keep minimized state true when closing
              // so it reopens in the same position
              setIsMinimized(true);
            }
          }}
          PaperProps={{
            sx: {
              borderRadius: '12px',
              overflow: 'hidden'
            }
          }}
        >
          <Box sx={{
            bgcolor: '#6D28D9',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 1.5,
            color: 'white'
          }}>
            <Typography variant="h6" sx={{ fontWeight: 500, fontSize: '1.1rem' }}>
              AI Assistance
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton
                size="small"
                onClick={() => setIsOpen(false)}
                sx={{
                  color: 'white',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)'
                  }
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            height: '100%'
          }}>
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                px: 2,
                pt: 2,
                pb: 0.5,
                maxHeight: '60vh',
                overflowY: 'auto',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none'
                }
              }}
            >
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
            </Paper>

            {/* Listening indicator */}
            {listening && (
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    border: '1px dashed #5e35b1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '80%'
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#5e35b1', mb: 0.5 }}>Listening</Typography>
                  <Box sx={{
                    width: '100%',
                    height: 20,
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 2,
                          height: Math.floor(Math.random() * 15) + 3,
                          backgroundColor: '#5e35b1'
                        }}
                      />
                    ))}
                  </Box>
                </Paper>
              </Box>
            )}

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
        </Dialog>
      </Box>
    </>
  );
};

export default Assistant;
