# API Integration

## API Integration Rationale

**Axios Selection:**
- **Matches backend architecture** - Consistent with backend HTTP client choice
- **Interceptor support** - Essential for OpenEMR OAuth2 token management
- **TypeScript integration** - Excellent type safety for healthcare APIs
- **Request/Response transformation** - HIPAA-compliant data handling

**OpenEMR Integration Patterns:**
- **OAuth2 with PKCE** - Following 2024 OpenEMR security requirements
- **Automatic token refresh** - Seamless authentication for staff workflows
- **FHIR R4 compatibility** - Future-proof API integration
- **Circuit breaker** - Resilient healthcare service communication

## Service Template

```typescript
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// Define API response types
interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
  timestamp: string;
}

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Define service configuration
interface ServiceConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
}

// Example API service class
export class ExampleApiService {
  private client: AxiosInstance;
  private config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = config;
    this.client = this.createClient();
  }

  private createClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Request interceptor for authentication
    client.interceptors.request.use(
      (config) => {
        const { accessToken } = useAuthStore.getState();
        
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }

        // Add request ID for tracking
        config.headers['X-Request-ID'] = crypto.randomUUID();
        
        // Log request for HIPAA audit trail
        console.debug('API Request:', {
          method: config.method?.toUpperCase(),
          url: config.url,
          requestId: config.headers['X-Request-ID'],
        });

        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and token refresh
    client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        // Log successful response
        console.debug('API Response:', {
          status: response.status,
          url: response.config.url,
          requestId: response.config.headers?.['X-Request-ID'],
        });

        return response;
      },
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config;

        // Handle token refresh for 401 errors
        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const { refreshToken } = useAuthStore.getState();
            await this.refreshAuthToken(refreshToken);
            
            // Retry original request with new token
            const { accessToken } = useAuthStore.getState();
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            
            return client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            useAuthStore.getState().logout();
            return Promise.reject(refreshError);
          }
        }

        // Log error for HIPAA audit trail
        console.error('API Error:', {
          status: error.response?.status,
          url: originalRequest?.url,
          message: error.response?.data?.message || error.message,
          requestId: originalRequest?.headers?.['X-Request-ID'],
        });

        return Promise.reject(this.transformError(error));
      }
    );

    return client;
  }

  private async refreshAuthToken(refreshToken: string): Promise<void> {
    try {
      const response = await axios.post('/api/auth/refresh', {
        refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data;
      
      useAuthStore.getState().setTokens({
        accessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  private transformError(error: AxiosError<ApiError>): Error {
    const apiError = error.response?.data;
    
    if (apiError) {
      const transformedError = new Error(apiError.message);
      transformedError.name = `ApiError_${apiError.code}`;
      return transformedError;
    }

    return new Error(error.message || 'Unknown API error');
  }

  // Example API methods
  async getItems(): Promise<ExampleItem[]> {
    const response = await this.client.get<ApiResponse<ExampleItem[]>>('/items');
    return response.data.data;
  }

  async createItem(data: CreateItemRequest): Promise<ExampleItem> {
    const response = await this.client.post<ApiResponse<ExampleItem>>('/items', data);
    return response.data.data;
  }

  async updateItem(id: string, updates: Partial<ExampleItem>): Promise<ExampleItem> {
    const response = await this.client.patch<ApiResponse<ExampleItem>>(`/items/${id}`, updates);
    return response.data.data;
  }

  async deleteItem(id: string): Promise<void> {
    await this.client.delete(`/items/${id}`);
  }
}

// Create service instances
export const exampleApi = new ExampleApiService({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api',
  timeout: 10000,
  retries: 3,
  retryDelay: 1000,
});

// Export types
export type { ApiResponse, ApiError, ServiceConfig };
```

## API Client Configuration

```typescript
import { ExampleApiService } from './ExampleApiService';

// Environment-based configuration
const getApiConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || '/api',
    timeout: isDevelopment ? 30000 : 10000, // Longer timeout in dev
    retries: isDevelopment ? 1 : 3,
    retryDelay: 1000,
  };
};

// API service instances
export const staffDashboardApi = new ExampleApiService({
  ...getApiConfig(),
  baseURL: `${getApiConfig().baseURL}/staff`,
});

export const patientPortalApi = new ExampleApiService({
  ...getApiConfig(),
  baseURL: `${getApiConfig().baseURL}/patient`,
});

export const openemrApi = new ExampleApiService({
  ...getApiConfig(),
  baseURL: `${getApiConfig().baseURL}/openemr`,
  timeout: 15000, // OpenEMR may be slower
});

// Real-time WebSocket configuration
export const websocketConfig = {
  url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  reconnectAttempts: 5,
  reconnectInterval: 3000,
  pingInterval: 30000,
};
```
