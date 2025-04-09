import axios from 'axios';

// Base API configuration
const apiClient = axios.create({
  baseURL: 'http://localhost:5001',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// API endpoints
export const API = {
  post: async (endpoint: string, data: any) => {
    try {
      const response = await apiClient.post(endpoint, data);
      return response.data;
    } catch (error) {
      console.error('Error in API post:', error);
      throw error;
    }
  },

  buildQuery: async (query: string, userEmail: string) => {
    try {
      const response = await apiClient.post('/api/report/analyze', 
        { request: query },  // body
        { 
          headers: {
            'User-Email': userEmail
          }
        }
      );
      if (!response.data) return { success: false, message: 'No data received' };
      return {
        success: response.data.success ?? true,
        message: response.data.message,
        type: response.data.type,
        data: response.data.data,
        excel_data: response.data.excel_data,
        background_process: response.data.background_process
      };
    } catch (error) {
      console.error('Error in buildQuery:', error);
      throw error;
    }
  }
};

export default API;
