# Environment Configuration

## Required Environment Variables

Healthcare frontend applications require careful environment variable management for security and compliance:

```bash
# Frontend Application (.env.local)
# API Configuration
NEXT_PUBLIC_API_BASE_URL=https://api.capitoleye.care
NEXT_PUBLIC_WS_URL=wss://ws.capitoleye.care
NEXT_PUBLIC_APP_URL=https://dashboard.capitoleye.care

# Authentication (NextAuth.js)
NEXTAUTH_URL=https://dashboard.capitoleye.care
NEXTAUTH_SECRET=your-secure-secret-here
NEXT_PUBLIC_OPENEMR_CLIENT_ID=your-openemr-client-id
NEXT_PUBLIC_OPENEMR_REDIRECT_URI=https://dashboard.capitoleye.care/api/auth/callback/openemr

# OpenEMR Integration
NEXT_PUBLIC_OPENEMR_BASE_URL=https://openemr.capitoleye.care
NEXT_PUBLIC_OPENEMR_FHIR_URL=https://openemr.capitoleye.care/apis/default/fhir

# Practice Configuration
NEXT_PUBLIC_PRACTICE_NAME="Capitol Eye Care"
NEXT_PUBLIC_PRACTICE_PHONE="+1-503-555-0123"
NEXT_PUBLIC_PRACTICE_TIMEZONE="America/Los_Angeles"

# Feature Flags
NEXT_PUBLIC_ENABLE_PWA=true
NEXT_PUBLIC_ENABLE_DARK_MODE=true
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Development/Testing
NODE_ENV=production
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_DEBUG_MODE=false
NEXT_PUBLIC_MOCK_OPENEMR=false
```

## Environment-Specific Configurations

```typescript
// lib/config.ts
interface AppConfig {
  api: {
    baseURL: string;
    timeout: number;
    retries: number;
  };
  openemr: {
    baseURL: string;
    fhirURL: string;
    clientId: string;
    redirectURI: string;
  };
  practice: {
    name: string;
    phone: string;
    timezone: string;
  };
  features: {
    pwa: boolean;
    darkMode: boolean;
    notifications: boolean;
    analytics: boolean;
  };
  app: {
    url: string;
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
}

const getConfig = (): AppConfig => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    api: {
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001',
      timeout: isDevelopment ? 30000 : 10000,
      retries: isDevelopment ? 1 : 3,
    },
    openemr: {
      baseURL: process.env.NEXT_PUBLIC_OPENEMR_BASE_URL || '',
      fhirURL: process.env.NEXT_PUBLIC_OPENEMR_FHIR_URL || '',
      clientId: process.env.NEXT_PUBLIC_OPENEMR_CLIENT_ID || '',
      redirectURI: process.env.NEXT_PUBLIC_OPENEMR_REDIRECT_URI || '',
    },
    practice: {
      name: process.env.NEXT_PUBLIC_PRACTICE_NAME || 'Capitol Eye Care',
      phone: process.env.NEXT_PUBLIC_PRACTICE_PHONE || '+1-503-555-0123',
      timezone: process.env.NEXT_PUBLIC_PRACTICE_TIMEZONE || 'America/Los_Angeles',
    },
    features: {
      pwa: process.env.NEXT_PUBLIC_ENABLE_PWA === 'true',
      darkMode: process.env.NEXT_PUBLIC_ENABLE_DARK_MODE === 'true',
      notifications: process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true',
      analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    },
    app: {
      url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      name: 'Voice Agent Dashboard',
      version: process.env.npm_package_version || '1.0.0',
      environment: (process.env.NEXT_PUBLIC_ENV as any) || 'development',
    },
  };
};

export const config = getConfig();
export type { AppConfig };
```
