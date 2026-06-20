import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds client-side timeout
});

export const runCode = async (language, code, input) => {
  try {
    const response = await apiClient.post('/api/compiler/run', {
      language,
      code,
      input,
    });
    return response.data;
  } catch (error) {
    console.error('API Error details:', error);
    
    // Handle error response from server
    if (error.response && error.response.data) {
      return {
        success: false,
        output: '',
        error: error.response.data.error || 'Server error occurred during execution.',
        executionTime: '',
      };
    }
    
    // Handle request timeout or network failure
    return {
      success: false,
      output: '',
      error: error.code === 'ECONNABORTED' 
        ? 'Request timed out. The server took too long to respond.' 
        : 'Could not connect to the compilation server. Please ensure the backend is running.',
      executionTime: '',
    };
  }
};
