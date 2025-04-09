import axios from 'axios';

// Base API configuration
const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:5001',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response transformers
const transformLeadsResponse = (response: any) => {
  // If the response already has our expected format, return it as is
  if (response?.type && (response?.type === 'excel' || response?.type === 'background_process' || response?.type === 'text')) {
    return response;
  }

  // Check if we have Excel data
  if (response?.type === 'excel' || (response?.data && response?.data?.excel_data)) {
    return {
      success: true,
      type: 'excel',
      message: response?.message || 'Here are the leads data you requested',
      excel_data: response?.excel_data || {
        excel_data: response.data?.excel_data,
        filename: response.data?.filename || `leads_data_${new Date().getTime()}.xlsx`,
        row_count: response.data?.row_count || 0
      }
    };
  }

  // Check if it's a background process
  if (response.data && response.data.room_id) {
    return {
      success: true,
      type: 'background_process',
      message: 'Processing your request in the background',
      background_process: {
        room_id: response.data.room_id,
        row_count: response.data.row_count || 0
      }
    };
  }

  // Default to table data
  return {
    success: true,
    type: 'text',
    message: response.message || 'Here are the leads data you requested',
    data: Array.isArray(response.data) ? response.data : []
  };
};

// API endpoints
export const API = {
  // Process general input (existing endpoint)
  processInput: (input: string) => {
    return axios.post('http://localhost:8000/process-input', { input });
  },

  // Query builder endpoint (new endpoint)
  buildQuery: async (query: string) => {
    try {
      const response = await apiClient.post('/api/schema/query/build', { query });
      // Transform the response to match our expected format
      const transformedData = transformLeadsResponse(response.data);
      return { data: transformedData };
    } catch (error) {
      console.error('Error in buildQuery:', error);
      throw error;
    }
  },

  // Additional endpoints can be added here
};

export default API;
