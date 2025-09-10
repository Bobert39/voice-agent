# Frontend Developer Standards

## Critical Coding Rules

**Healthcare Data Handling:**

- **Never log PHI data** - Use generic identifiers in logs and debug output
- **Encrypt sensitive data** - Use encryption utilities from shared package
- **Validate all inputs** - Use Zod schemas for form and API data validation
- **Handle errors gracefully** - Always provide user-friendly error messages
- **Implement loading states** - Never leave users without feedback during async operations

**Component Development:**

- **Use TypeScript interfaces** - All props must have defined interfaces
- **Implement error boundaries** - Wrap components that may fail
- **Follow accessibility standards** - Include ARIA labels and keyboard navigation
- **Responsive by default** - All components must work on mobile, tablet, and desktop
- **Use shared components** - Import from packages/ui instead of creating duplicates

**State Management:**

- **Use Zustand stores** - Never use local state for data that needs persistence
- **Implement optimistic updates** - Update UI immediately, handle failures gracefully
- **Handle offline scenarios** - Cache critical data for offline use
- **Log state changes** - Include audit trail for HIPAA compliance
- **Clean up subscriptions** - Always unsubscribe from stores and WebSockets

**API Integration:**

- **Use service classes** - Never make direct axios calls from components
- **Handle authentication** - All API calls must include proper error handling for auth failures
- **Implement retry logic** - Use exponential backoff for failed requests
- **Cache API responses** - Reduce server load and improve user experience
- **Validate API responses** - Never trust API data without validation

**Performance:**

- **Optimize re-renders** - Use React.memo and useMemo for expensive operations
- **Lazy load components** - Use dynamic imports for non-critical components
- **Implement virtualization** - For large lists of patients or appointments
- **Monitor bundle size** - Keep total bundle size under 2MB
- **Use Progressive Web App** - Enable offline functionality for critical features

## Quick Reference

### Common Commands

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Run ESLint
npm run type-check      # Run TypeScript compiler
npm run test            # Run Jest tests
npm run test:watch      # Run tests in watch mode
npm run test:e2e        # Run Playwright E2E tests

# Database/API
npm run generate        # Generate Prisma types (if using)
npm run migrate         # Run database migrations (if applicable)

# Deployment
npm run analyze         # Analyze bundle size
npm run export          # Export static site (if needed)
```

### Key Import Patterns

```typescript
// Shared UI components
import { Button, Input, Modal } from '@repo/ui';

// Shared utilities
import { formatDate, validateEmail } from '@repo/shared/utils';

// Shared types
import type { Patient, Appointment } from '@repo/shared/types';

// Store hooks
import { useAuthStore, usePatientStore } from '@/stores';

// API services
import { staffDashboardApi, openemrApi } from '@/lib/api';

// Next.js imports
import { useRouter } from 'next/navigation';
import { notFound, redirect } from 'next/navigation';
import { Metadata } from 'next';
```

### File Naming Conventions

```plaintext
# Components
PatientCard.tsx           # React component
PatientCard.test.tsx      # Component tests
PatientCard.stories.tsx   # Storybook stories (if using)

# Pages (Next.js App Router)
page.tsx                  # Page component
layout.tsx                # Layout component
loading.tsx               # Loading UI
error.tsx                 # Error UI
not-found.tsx             # 404 UI

# API Routes
route.ts                  # API route handler
middleware.ts             # Route middleware

# Utilities and Hooks
usePatientData.ts         # Custom hook
patientHelpers.ts         # Utility functions
patientTypes.ts           # Type definitions
patientStore.ts           # Zustand store
```

### Healthcare-Specific Patterns

```typescript
// Patient data encryption pattern
import { encryptPHI, decryptPHI } from '@repo/shared/utils/encryption';

const patient = {
  id: 'patient-123',
  name: encryptPHI(patientName),
  phone: encryptPHI(phoneNumber),
  // ... other fields
};

// HIPAA-compliant logging
import { auditLog } from '@repo/shared/utils/logging';

auditLog('patient_access', {
  patientId: patient.id,
  staffId: user.id,
  action: 'view_patient_details',
  timestamp: new Date().toISOString(),
});

// Error handling with user-friendly messages
try {
  await appointmentApi.create(appointmentData);
} catch (error) {
  if (error.name === 'ApiError_CONFLICT') {
    showNotification('This appointment time is no longer available. Please select another time.', 'warning');
  } else {
    showNotification('Unable to schedule appointment. Please try again or contact support.', 'error');
    // Log detailed error for debugging
    console.error('Appointment creation failed:', error);
  }
}
```

---
