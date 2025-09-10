# AI Voice Agent for Capitol Eye Care Frontend Architecture Document

## Template and Framework Selection

Based on review of the PRD and existing backend architecture document, this project requires a **Multi-Modal Healthcare Interface System** supporting:

**Key Frontend Components:**
- **Staff Dashboard Web Application** (Primary UI)
- **Patient Web Portal Integration** (OpenEMR integration)
- **SMS/Email Interface System** (Notification templates)
- **Mobile Staff Companion App** (Future expansion)

**Framework Decision:** **Next.js + React + TypeScript** with multi-modal architecture

**OpenEMR Integration Research:**
- OAuth2 Authorization Code Grant with PKCE (2024 standard)
- JWT token management with automatic refresh
- Custom API integration following OpenEMR patterns
- Patient portal component integration

**Multi-Device Support:**
- **Desktop**: Full dashboard with multi-panel layout
- **Tablet**: Streamlined dashboard with touch-optimized UI
- **Phone**: Mobile-first staff app with push notifications

**Scalability Planning:**
- Component library for white-label customization
- Configuration-driven UI for multi-practice deployment
- Modular architecture supporting platform expansion

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|---------|
| 2025-01-10 | 1.0 | Initial frontend architecture with multi-modal approach | Winston (Architect) |

## Frontend Tech Stack

### Technology Stack Rationale

**Core Decisions:**
- **Next.js over React SPA**: Better performance for healthcare staff, built-in authentication patterns, server-side rendering for faster loads
- **Tailwind CSS**: Rapid development, consistent healthcare design system, excellent responsive support
- **NextAuth.js**: Seamless OpenEMR OAuth2 integration, healthcare-compliant session management
- **React Email**: Unified templating system across SMS/Email/Web interfaces
- **TypeScript**: Type safety for healthcare data, reduces medical software bugs

**Multi-Modal Integration:**
- **Shared component library** across all interface types
- **Unified state management** for consistent patient data
- **OpenEMR native integration** following 2024 OAuth2 patterns
- **Progressive Web App** capabilities for offline access

**Healthcare-Specific Considerations:**
- **HIPAA-compliant** state management and data handling
- **Accessibility (WCAG 2.1 AA)** for diverse staff abilities
- **Professional medical UI patterns** following healthcare design standards

### Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **Framework** | Next.js | 14.1.0 | React meta-framework | Server-side rendering, built-in auth, better healthcare performance |
| **UI Library** | React | 18.2.0 | Component library | Specified in backend architecture, excellent ecosystem |
| **Language** | TypeScript | 5.3.3 | Type-safe development | Healthcare data safety, matches backend stack |
| **State Management** | Zustand | 4.4.7 | Lightweight state | Simple, TypeScript-first, better than Redux for this scope |
| **Routing** | Next.js App Router | 14.1.0 | File-based routing | Built-in, supports server components, parallel routes |
| **Build Tool** | Next.js/Webpack | 14.1.0 | Bundling and optimization | Integrated build system, optimized for production |
| **Styling** | Tailwind CSS | 3.4.1 | Utility-first CSS | Rapid development, consistent design system, responsive |
| **UI Components** | Headless UI | 1.7.17 | Accessible components | Healthcare accessibility compliance, works with Tailwind |
| **Form Handling** | React Hook Form | 7.48.2 | Performant forms | Medical forms require validation, excellent TypeScript support |
| **Animation** | Framer Motion | 10.16.16 | UI animations | Professional healthcare interface transitions |
| **Testing** | Jest + React Testing Library | 29.7.0 | Component testing | Healthcare reliability requires comprehensive testing |
| **E2E Testing** | Playwright | 1.40.1 | End-to-end testing | Matches backend architecture, healthcare workflow testing |
| **Dev Tools** | Next.js DevTools | 14.1.0 | Development experience | Built-in debugging, performance monitoring |

#### Healthcare-Specific Additions

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **Authentication** | NextAuth.js | 4.24.5 | OpenEMR OAuth2 integration | HIPAA-compliant, supports OpenEMR OAuth2 with PKCE |
| **HTTP Client** | Axios | 1.6.2 | API communication | Matches backend, interceptors for token refresh |
| **Email Templates** | React Email | 1.10.1 | Unified email/SMS templates | Consistent patient communication across channels |
| **Icons** | Heroicons | 2.0.18 | Healthcare-appropriate icons | Professional medical interface, optimized for accessibility |
| **Date Handling** | date-fns | 2.30.0 | Appointment scheduling | Lightweight, tree-shakeable, excellent for medical scheduling |
| **Charts/Analytics** | Chart.js + react-chartjs-2 | 4.4.1 | Real-time monitoring dashboard | Voice interaction analytics, appointment trends |
| **Real-time Updates** | Socket.io Client | 4.7.4 | Live call monitoring | WebSocket integration for real-time staff dashboard |

#### Multi-Modal Interface Additions

| Category | Technology | Version | Purpose | Rationale |
|----------|-----------|---------|---------|-----------|
| **PWA Support** | next-pwa | 5.6.0 | Progressive Web App | Offline capabilities, mobile app-like experience |
| **Push Notifications** | @vercel/push | 1.0.0 | Staff notifications | Real-time escalation alerts across devices |
| **SMS Integration** | Twilio SDK | 4.19.0 | Patient SMS communications | Matches backend telephony integration |
| **QR Code Generation** | qrcode | 1.5.3 | Patient check-in links | Quick access to appointment confirmations |
| **PDF Generation** | jsPDF | 2.5.1 | Appointment confirmations | Patient-friendly appointment documents |

## Project Structure

### Project Structure Rationale

**Multi-Modal Architecture Approach:**
- **Monorepo structure** with separate apps for each interface type
- **Shared component library** for consistent healthcare UI across all interfaces  
- **Unified state management** for patient data consistency
- **Configuration-driven** setup for future white-label deployment

**Next.js App Router Benefits:**
- **Server components** for better performance on healthcare devices
- **Parallel routes** for complex dashboard layouts
- **Route groups** for organizing staff vs patient interfaces
- **Middleware** for authentication and HIPAA compliance

**Healthcare-Specific Organization:**
- **HIPAA-compliant** file structure with clear data boundaries
- **Role-based component** organization (staff, patient, admin)
- **Audit-ready** logging and error handling structure
- **Medical workflow** optimized directory layout

**Device-Responsive Strategy:**
- **Desktop-first** main dashboard with progressive enhancement
- **Mobile-optimized** staff companion components
- **Tablet-friendly** touch interfaces with appropriate spacing
- **Cross-device** state synchronization via shared stores

```plaintext
voice-agent-frontend/
├── apps/                               # Multi-modal application packages
│   ├── staff-dashboard/                # Primary staff web application (Next.js)
│   │   ├── src/
│   │   │   ├── app/                    # App Router structure
│   │   │   │   ├── (dashboard)/        # Route group for authenticated areas
│   │   │   │   │   ├── overview/       # Real-time system overview
│   │   │   │   │   ├── calls/          # Live call monitoring
│   │   │   │   │   │   ├── active/     # Currently active calls
│   │   │   │   │   │   └── history/    # Call history and analytics
│   │   │   │   │   ├── appointments/   # Appointment management
│   │   │   │   │   │   ├── calendar/   # Calendar view
│   │   │   │   │   │   ├── requests/   # Pending appointment requests
│   │   │   │   │   │   └── conflicts/  # Scheduling conflicts
│   │   │   │   │   ├── patients/       # Patient data (HIPAA-compliant)
│   │   │   │   │   │   ├── search/     # Patient lookup
│   │   │   │   │   │   └── [id]/       # Patient detail pages
│   │   │   │   │   ├── escalations/    # Staff escalation handling
│   │   │   │   │   ├── reports/        # HIPAA audit reports
│   │   │   │   │   └── settings/       # Practice configuration
│   │   │   │   ├── (auth)/             # Authentication routes
│   │   │   │   │   ├── login/          # OpenEMR OAuth2 login
│   │   │   │   │   └── callback/       # OAuth callback handling
│   │   │   │   ├── api/                # API routes for staff operations
│   │   │   │   │   ├── auth/           # NextAuth.js configuration
│   │   │   │   │   ├── openemr/        # OpenEMR proxy endpoints
│   │   │   │   │   ├── websocket/      # Real-time connection setup
│   │   │   │   │   └── reports/        # Report generation endpoints
│   │   │   │   ├── globals.css         # Global styles and CSS variables
│   │   │   │   ├── layout.tsx          # Root layout with providers
│   │   │   │   ├── loading.tsx         # Global loading UI
│   │   │   │   ├── error.tsx           # Global error boundary
│   │   │   │   └── not-found.tsx       # 404 page
│   │   │   ├── components/             # Staff dashboard specific components
│   │   │   │   ├── dashboard/          # Dashboard-specific components
│   │   │   │   │   ├── real-time/      # Live monitoring components
│   │   │   │   │   │   ├── CallMonitor.tsx
│   │   │   │   │   │   ├── SystemStatus.tsx
│   │   │   │   │   │   └── AlertPanel.tsx
│   │   │   │   │   ├── appointments/   # Appointment management
│   │   │   │   │   │   ├── AppointmentCard.tsx
│   │   │   │   │   │   ├── CalendarView.tsx
│   │   │   │   │   │   └── ConflictResolver.tsx
│   │   │   │   │   ├── patients/       # Patient-related components
│   │   │   │   │   │   ├── PatientSearch.tsx
│   │   │   │   │   │   ├── PatientCard.tsx
│   │   │   │   │   │   └── InteractionHistory.tsx
│   │   │   │   │   └── reports/        # Reporting components
│   │   │   │   │       ├── AuditReport.tsx
│   │   │   │   │       ├── PerformanceChart.tsx
│   │   │   │   │       └── ComplianceMetrics.tsx
│   │   │   │   ├── layout/             # Layout components
│   │   │   │   │   ├── Header.tsx      # Navigation header
│   │   │   │   │   ├── Sidebar.tsx     # Staff navigation sidebar
│   │   │   │   │   ├── Footer.tsx      # Footer with system status
│   │   │   │   │   └── MobileNav.tsx   # Mobile navigation
│   │   │   │   └── forms/              # Medical forms components
│   │   │   │       ├── AppointmentForm.tsx
│   │   │   │       ├── PatientVerification.tsx
│   │   │   │       └── EscalationForm.tsx
│   │   │   ├── hooks/                  # Custom React hooks
│   │   │   │   ├── useRealTimeData.ts  # WebSocket data hook
│   │   │   │   ├── useOpenEMR.ts       # OpenEMR integration hook
│   │   │   │   ├── useAuth.ts          # Authentication hook
│   │   │   │   └── useResponsive.ts    # Responsive design hook
│   │   │   ├── lib/                    # Utility libraries
│   │   │   │   ├── auth.ts             # NextAuth.js configuration
│   │   │   │   ├── openemr.ts          # OpenEMR API client
│   │   │   │   ├── websocket.ts        # WebSocket client setup
│   │   │   │   ├── constants.ts        # App constants
│   │   │   │   └── utils.ts            # General utilities
│   │   │   ├── stores/                 # Zustand state stores
│   │   │   │   ├── auth.ts             # Authentication state
│   │   │   │   ├── dashboard.ts        # Dashboard data state
│   │   │   │   ├── appointments.ts     # Appointment management
│   │   │   │   ├── patients.ts         # Patient data (HIPAA-compliant)
│   │   │   │   └── notifications.ts    # Staff notifications
│   │   │   ├── styles/                 # Styling files
│   │   │   │   ├── components.css      # Component-specific styles
│   │   │   │   ├── dashboard.css       # Dashboard-specific styles
│   │   │   │   └── responsive.css      # Responsive design utilities
│   │   │   └── types/                  # TypeScript type definitions
│   │   │       ├── auth.ts             # Authentication types
│   │   │       ├── openemr.ts          # OpenEMR API types
│   │   │       ├── dashboard.ts        # Dashboard data types
│   │   │       └── patient.ts          # Patient data types (HIPAA)
│   │   ├── public/                     # Static assets
│   │   │   ├── icons/                  # Healthcare-specific icons
│   │   │   ├── images/                 # Dashboard images and logos
│   │   │   └── manifest.json           # PWA manifest
│   │   ├── tests/                      # Testing files
│   │   │   ├── components/             # Component tests
│   │   │   ├── pages/                  # Page tests
│   │   │   ├── hooks/                  # Custom hook tests
│   │   │   └── e2e/                    # End-to-end tests (Playwright)
│   │   ├── next.config.js              # Next.js configuration
│   │   ├── tailwind.config.js          # Tailwind CSS configuration
│   │   ├── postcss.config.js           # PostCSS configuration
│   │   ├── playwright.config.ts        # E2E testing configuration
│   │   └── package.json                # Dependencies and scripts
│   │
│   ├── patient-portal/                 # Patient web interface (Next.js)
│   │   ├── src/
│   │   │   ├── app/                    # Patient-facing pages
│   │   │   │   ├── appointments/       # Appointment management
│   │   │   │   │   ├── confirm/        # Appointment confirmations
│   │   │   │   │   ├── reschedule/     # Rescheduling interface
│   │   │   │   │   └── cancel/         # Cancellation process
│   │   │   │   ├── auth/               # Patient authentication
│   │   │   │   └── api/                # Patient API endpoints
│   │   │   ├── components/             # Patient-specific components
│   │   │   │   ├── appointments/       # Appointment components
│   │   │   │   ├── auth/               # Patient authentication
│   │   │   │   └── common/             # Shared patient components
│   │   │   ├── hooks/                  # Patient-specific hooks
│   │   │   ├── lib/                    # Patient utilities
│   │   │   ├── stores/                 # Patient state management
│   │   │   └── types/                  # Patient-specific types
│   │   └── package.json
│   │
│   └── mobile-staff-app/               # Future React Native app
│       ├── src/
│       ├── ios/                        # iOS specific files
│       ├── android/                    # Android specific files
│       └── package.json
│
├── packages/                           # Shared packages across applications
│   ├── ui/                            # Shared component library
│   │   ├── src/
│   │   │   ├── components/            # Reusable UI components
│   │   │   │   ├── common/            # Basic components (Button, Input, etc.)
│   │   │   │   │   ├── Button.tsx     # Accessible button component
│   │   │   │   │   ├── Input.tsx      # Form input component
│   │   │   │   │   ├── Modal.tsx      # Modal dialog component
│   │   │   │   │   ├── Loading.tsx    # Loading spinners
│   │   │   │   │   └── ErrorBoundary.tsx  # Error boundary component
│   │   │   │   ├── healthcare/        # Healthcare-specific components
│   │   │   │   │   ├── PatientCard.tsx    # Patient information display
│   │   │   │   │   ├── AppointmentSlot.tsx # Appointment time slots
│   │   │   │   │   ├── MedicalAlert.tsx   # Medical alerts and warnings
│   │   │   │   │   └── ComplianceStatus.tsx # HIPAA compliance indicators
│   │   │   │   ├── charts/            # Data visualization components
│   │   │   │   │   ├── CallVolumeChart.tsx
│   │   │   │   │   ├── AppointmentTrends.tsx
│   │   │   │   │   └── SystemMetrics.tsx
│   │   │   │   └── layout/            # Layout components
│   │   │   │       ├── ResponsiveGrid.tsx # Responsive grid system
│   │   │   │       ├── Card.tsx       # Content cards
│   │   │   │       └── Panel.tsx      # Dashboard panels
│   │   │   ├── hooks/                 # Shared custom hooks
│   │   │   │   ├── useLocalStorage.ts # Local storage management
│   │   │   │   ├── useDebounce.ts     # Debounced values
│   │   │   │   ├── useMediaQuery.ts   # Responsive design queries
│   │   │   │   └── useAsync.ts        # Async operation handling
│   │   │   ├── styles/                # Shared styling
│   │   │   │   ├── globals.css        # Global CSS variables
│   │   │   │   ├── healthcare-theme.css # Healthcare design system
│   │   │   │   └── components.css     # Component base styles
│   │   │   ├── utils/                 # Shared utilities
│   │   │   │   ├── formatting.ts      # Data formatting utilities
│   │   │   │   ├── validation.ts      # Form validation
│   │   │   │   ├── dates.ts           # Date manipulation
│   │   │   │   └── healthcare.ts      # Healthcare-specific utilities
│   │   │   └── types/                 # Shared TypeScript types
│   │   │       ├── common.ts          # Common interface types
│   │   │       ├── api.ts             # API response types
│   │   │       └── healthcare.ts      # Healthcare domain types
│   │   ├── tailwind.config.js         # Shared Tailwind configuration
│   │   └── package.json               # UI library dependencies
│   │
│   ├── shared/                        # Shared business logic and utilities
│   │   ├── src/
│   │   │   ├── api/                   # API clients and types
│   │   │   │   ├── openemr.ts         # OpenEMR API client
│   │   │   │   ├── voice-agent.ts     # Voice Agent API client
│   │   │   │   ├── twilio.ts          # Twilio integration
│   │   │   │   └── types.ts           # API type definitions
│   │   │   ├── auth/                  # Authentication utilities
│   │   │   │   ├── oauth.ts           # OAuth2 flow management
│   │   │   │   ├── tokens.ts          # Token management
│   │   │   │   └── permissions.ts     # Role-based permissions
│   │   │   ├── constants/             # Application constants
│   │   │   │   ├── medical.ts         # Medical terminology constants
│   │   │   │   ├── ui.ts              # UI-related constants
│   │   │   │   └── api.ts             # API endpoints and configurations
│   │   │   ├── utils/                 # Shared utility functions
│   │   │   │   ├── encryption.ts      # HIPAA-compliant data encryption
│   │   │   │   ├── validation.ts      # Data validation schemas
│   │   │   │   ├── formatting.ts      # Data formatting functions
│   │   │   │   ├── logging.ts         # Structured logging utilities
│   │   │   │   └── errors.ts          # Error handling utilities
│   │   │   └── types/                 # Shared type definitions
│   │   │       ├── patient.ts         # Patient data types
│   │   │       ├── appointment.ts     # Appointment types
│   │   │       ├── staff.ts           # Staff member types
│   │   │       ├── audit.ts           # Audit logging types
│   │   │       └── system.ts          # System configuration types
│   │   └── package.json
│   │
│   ├── email-templates/               # React Email templates
│   │   ├── src/
│   │   │   ├── templates/
│   │   │   │   ├── AppointmentConfirmation.tsx
│   │   │   │   ├── AppointmentReminder.tsx
│   │   │   │   ├── AppointmentCancellation.tsx
│   │   │   │   ├── ReschedulingOptions.tsx
│   │   │   │   └── SystemAlert.tsx
│   │   │   ├── components/            # Email-specific components
│   │   │   │   ├── EmailHeader.tsx
│   │   │   │   ├── EmailFooter.tsx
│   │   │   │   └── AppointmentDetails.tsx
│   │   │   └── styles/                # Email styling
│   │   │       └── email-styles.css
│   │   └── package.json
│   │
│   └── config/                        # Shared configuration packages
│       ├── eslint/                    # ESLint configurations
│       │   ├── base.js
│       │   ├── react.js
│       │   ├── next.js
│       │   └── typescript.js
│       ├── typescript/                # TypeScript configurations
│       │   ├── base.json
│       │   ├── react.json
│       │   └── next.json
│       ├── tailwind/                  # Tailwind configurations
│       │   ├── base.js
│       │   └── healthcare-theme.js
│       └── jest/                      # Jest testing configurations
│           ├── base.js
│           └── react.js
│
├── docs/                              # Project documentation
│   ├── ui-architecture.md            # This document
│   ├── component-library.md          # Component documentation
│   ├── deployment.md                 # Deployment instructions
│   └── healthcare-compliance.md      # HIPAA compliance guide
│
├── scripts/                          # Build and deployment scripts
│   ├── build.sh                      # Multi-app build script
│   ├── deploy.sh                     # Deployment script
│   ├── test.sh                       # Cross-app testing script
│   └── dev.sh                        # Development environment setup
│
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore rules
├── .eslintrc.js                      # Root ESLint configuration
├── .prettierrc                       # Prettier configuration
├── turbo.json                        # Turborepo configuration (if using)
├── package.json                      # Root package.json with workspaces
└── README.md                         # Project setup and development guide
```

## Component Standards

### Component Standards Rationale

**Healthcare-First Development:**

- **TypeScript mandatory** for all components (patient data safety)
- **Accessibility-first** approach (WCAG 2.1 AA compliance)
- **HIPAA-aware** component design (data handling patterns)
- **Professional medical UI** standards (clean, trustworthy design)

**Multi-Device Consistency:**

- **Responsive by default** (desktop, tablet, mobile)
- **Touch-friendly** interfaces for tablet use
- **Keyboard navigation** support for accessibility
- **Consistent spacing** across all screen sizes

**Development Standards:**

- **Functional components** with React hooks
- **Composition over inheritance** for component reuse
- **Prop validation** with TypeScript interfaces
- **Error boundaries** for healthcare reliability

### Component Template

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// Define component props interface
interface ExampleComponentProps {
  /** Component title for accessibility */
  title: string;
  /** Patient data (HIPAA-compliant) */
  patientData?: {
    id: string;
    name: string;
    // Add other patient fields as needed
  };
  /** Click handler function */
  onClick?: (data: any) => void;
  /** Optional CSS classes */
  className?: string;
  /** Component variant */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Accessibility: ARIA label */
  ariaLabel?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Children elements */
  children?: React.ReactNode;
}

/**
 * ExampleComponent - Healthcare-focused component template
 * 
 * Follows HIPAA compliance patterns and accessibility standards.
 * Responsive design for desktop, tablet, and mobile usage.
 * 
 * @param props - Component properties
 * @returns JSX element
 */
export const ExampleComponent: React.FC<ExampleComponentProps> = ({
  title,
  patientData,
  onClick,
  className,
  variant = 'primary',
  ariaLabel,
  isLoading = false,
  disabled = false,
  children,
  ...props
}) => {
  // Local state management
  const [internalState, setInternalState] = useState<string>('');

  // Effect hooks for side effects
  useEffect(() => {
    // Cleanup functions for healthcare reliability
    return () => {
      // Cleanup resources
    };
  }, []);

  // Event handlers
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;
    
    event.preventDefault();
    onClick?.(patientData);
  };

  // Conditional rendering helpers
  const renderContent = () => {
    if (isLoading) {
      return <div className="animate-pulse">Loading...</div>;
    }

    return (
      <div className="flex flex-col space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        {children}
      </div>
    );
  };

  // CSS classes with variants
  const componentClasses = cn(
    // Base styles
    'rounded-lg border p-4 shadow-sm transition-all duration-200',
    // Responsive styles
    'w-full max-w-md mx-auto',
    'sm:max-w-lg md:max-w-xl lg:max-w-2xl',
    // Variant styles
    {
      'bg-blue-50 border-blue-200 hover:bg-blue-100': variant === 'primary',
      'bg-gray-50 border-gray-200 hover:bg-gray-100': variant === 'secondary',
      'bg-red-50 border-red-200 hover:bg-red-100': variant === 'danger',
    },
    // State styles
    {
      'opacity-50 cursor-not-allowed': disabled,
      'cursor-progress': isLoading,
    },
    // Custom classes
    className
  );

  return (
    <div
      className={componentClasses}
      role="region"
      aria-label={ariaLabel || title}
      aria-busy={isLoading}
      {...props}
    >
      {renderContent()}
    </div>
  );
};

// Default export for dynamic imports
export default ExampleComponent;

// Named exports for direct imports
export type { ExampleComponentProps };
```

### Naming Conventions

#### File and Component Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **React Components** | PascalCase | `PatientCard.tsx` | Always .tsx extension |
| **Component Files** | PascalCase | `AppointmentForm.tsx` | Match component name |
| **Hook Files** | camelCase with 'use' | `useOpenEMR.ts` | Custom hooks prefix |
| **Utility Files** | camelCase | `dateHelpers.ts` | Descriptive functionality |
| **Type Files** | camelCase | `patientTypes.ts` | Domain-specific types |
| **Store Files** | camelCase | `authStore.ts` | Zustand store naming |
| **Test Files** | PascalCase + .test | `PatientCard.test.tsx` | Mirror component name |

#### CSS and Styling Conventions

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **CSS Classes** | kebab-case | `patient-card` | BEM methodology |
| **CSS Variables** | kebab-case with prefix | `--healthcare-primary` | Global variables |
| **Tailwind Classes** | Standard Tailwind | `bg-blue-50 hover:bg-blue-100` | Utility classes |
| **Component Variants** | camelCase | `variant="primaryAction"` | TypeScript enums |

#### Directory and Route Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Page Routes** | kebab-case | `/patient-search` | URL-friendly |
| **API Routes** | kebab-case | `/api/patient-verification` | REST convention |
| **Directory Names** | kebab-case | `patient-management/` | Consistent structure |
| **Component Directories** | PascalCase | `PatientCard/` | Match component name |

#### Variable and Function Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Variables** | camelCase | `patientData` | Descriptive names |
| **Constants** | SCREAMING_SNAKE_CASE | `API_ENDPOINTS` | All caps |
| **Functions** | camelCase | `handlePatientClick` | Action-oriented |
| **Event Handlers** | handle + Action | `handleSubmit` | Consistent prefix |
| **Boolean Variables** | is/has/can prefix | `isLoading` | Clear state indication |
| **Async Functions** | Action + Async suffix | `fetchPatientAsync` | Async indication |

#### Healthcare-Specific Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Patient Data** | patient prefix | `patientId`, `patientName` | HIPAA clarity |
| **Medical Terms** | Full words | `appointment` not `appt` | Professional clarity |
| **Staff Roles** | Descriptive | `doctorPermissions` | Clear role indication |
| **HIPAA Fields** | Encrypted suffix | `phoneNumberEncrypted` | Security awareness |

## State Management

### State Management Rationale

**Zustand Selection:**

- **Lightweight and TypeScript-first** - Better than Redux for healthcare data safety
- **Simple API** - Easier maintenance for single developer
- **No boilerplate** - Faster development without actions/reducers
- **DevTools support** - Excellent debugging for healthcare reliability

**Healthcare-Specific Considerations:**

- **HIPAA-compliant state handling** - Encrypted sensitive data
- **Audit trail integration** - State changes logged for compliance
- **Session management** - Secure token and auth state handling
- **Real-time data synchronization** - WebSocket integration for live monitoring

**Multi-Modal Architecture:**

- **Shared stores** across staff dashboard and patient portal
- **Device-specific state** for responsive UI components
- **Cross-app communication** via shared state packages

### Store Structure

```plaintext
packages/shared/src/stores/
├── auth/                          # Authentication state management
│   ├── authStore.ts              # Main authentication store
│   ├── permissionsStore.ts       # Role-based permissions
│   └── sessionStore.ts           # Session and token management
├── patient/                      # Patient data management (HIPAA-compliant)
│   ├── patientStore.ts           # Patient information store
│   ├── verificationStore.ts      # Patient verification state
│   └── interactionStore.ts       # Patient interaction history
├── appointment/                  # Appointment management
│   ├── appointmentStore.ts       # Appointment scheduling state
│   ├── calendarStore.ts          # Calendar view and availability
│   └── conflictStore.ts          # Scheduling conflict resolution
├── dashboard/                    # Real-time dashboard data
│   ├── dashboardStore.ts         # Main dashboard state
│   ├── callMonitorStore.ts       # Live call monitoring
│   ├── alertStore.ts             # System alerts and notifications
│   └── metricsStore.ts           # Performance metrics and analytics
├── ui/                           # UI state management
│   ├── uiStore.ts                # Global UI state (themes, responsive)
│   ├── modalStore.ts             # Modal dialog management
│   ├── navigationStore.ts        # Navigation and routing state
│   └── notificationStore.ts      # Toast notifications and alerts
└── system/                       # System and configuration state
    ├── configStore.ts            # Practice configuration
    ├── openemrStore.ts           # OpenEMR integration state
    └── websocketStore.ts         # Real-time connection management
```

### State Management Template

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';

// Define state interface
interface ExampleState {
  // Data properties
  items: ExampleItem[];
  selectedItem: ExampleItem | null;
  
  // Loading states
  isLoading: boolean;
  isUpdating: boolean;
  
  // Error handling
  error: string | null;
  
  // Metadata
  lastUpdated: Date | null;
  version: number;
}

// Define actions interface
interface ExampleActions {
  // Data operations
  setItems: (items: ExampleItem[]) => void;
  addItem: (item: ExampleItem) => void;
  updateItem: (id: string, updates: Partial<ExampleItem>) => void;
  removeItem: (id: string) => void;
  selectItem: (item: ExampleItem | null) => void;
  
  // Async operations
  fetchItems: () => Promise<void>;
  createItem: (data: CreateItemRequest) => Promise<ExampleItem>;
  
  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// Combined store type
type ExampleStore = ExampleState & ExampleActions;

// Initial state
const initialState: ExampleState = {
  items: [],
  selectedItem: null,
  isLoading: false,
  isUpdating: false,
  error: null,
  lastUpdated: null,
  version: 0,
};

// Create the store
export const useExampleStore = create<ExampleStore>()(
  devtools(
    subscribeWithSelector(
      immer(
        persist(
          (set, get) => ({
            // Initial state
            ...initialState,
            
            // Actions
            setItems: (items) => set((state) => {
              state.items = items;
              state.lastUpdated = new Date();
              state.version += 1;
            }),
            
            addItem: (item) => set((state) => {
              state.items.push(item);
              state.lastUpdated = new Date();
              state.version += 1;
            }),
            
            updateItem: (id, updates) => set((state) => {
              const itemIndex = state.items.findIndex(item => item.id === id);
              if (itemIndex !== -1) {
                Object.assign(state.items[itemIndex], updates);
                state.lastUpdated = new Date();
                state.version += 1;
              }
            }),
            
            removeItem: (id) => set((state) => {
              state.items = state.items.filter(item => item.id !== id);
              if (state.selectedItem?.id === id) {
                state.selectedItem = null;
              }
              state.lastUpdated = new Date();
              state.version += 1;
            }),
            
            selectItem: (item) => set((state) => {
              state.selectedItem = item;
            }),
            
            // Async operations
            fetchItems: async () => {
              const { setLoading, setError, setItems } = get();
              
              try {
                setLoading(true);
                setError(null);
                
                const response = await exampleApi.getItems();
                setItems(response.data);
                
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                setError(errorMessage);
                console.error('Failed to fetch items:', error);
              } finally {
                setLoading(false);
              }
            },
            
            createItem: async (data) => {
              const { setError, addItem } = get();
              
              try {
                setError(null);
                
                const response = await exampleApi.createItem(data);
                addItem(response.data);
                
                return response.data;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                setError(errorMessage);
                throw error;
              }
            },
            
            // State management
            setLoading: (loading) => set((state) => {
              state.isLoading = loading;
            }),
            
            setError: (error) => set((state) => {
              state.error = error;
            }),
            
            reset: () => set(() => ({ ...initialState })),
          }),
          {
            name: 'example-store', // localStorage key
            partialize: (state) => ({
              // Only persist necessary data
              selectedItem: state.selectedItem,
              lastUpdated: state.lastUpdated,
            }),
          }
        )
      )
    ),
    {
      name: 'ExampleStore', // DevTools name
    }
  )
);

// Selectors for optimized re-renders
export const useExampleItems = () => useExampleStore((state) => state.items);
export const useSelectedItem = () => useExampleStore((state) => state.selectedItem);
export const useExampleLoading = () => useExampleStore((state) => state.isLoading);
export const useExampleError = () => useExampleStore((state) => state.error);

// Store subscription for side effects
useExampleStore.subscribe(
  (state) => state.error,
  (error) => {
    if (error) {
      // Log errors for HIPAA audit trail
      console.error('ExampleStore error:', error);
    }
  }
);

// Export store type for component props
export type { ExampleStore };
```

## API Integration

### API Integration Rationale

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

### Service Template

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

### API Client Configuration

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

## Styling Guidelines

### Styling Approach

**Tailwind CSS + Healthcare Design System:**
- **Utility-first** approach for rapid healthcare UI development
- **Professional medical** color palette and spacing
- **Accessibility-compliant** contrast ratios and focus indicators
- **Responsive-first** design for multi-device healthcare environments

**Design System Benefits:**
- **Consistent** visual language across all healthcare interfaces
- **Scalable** for future white-label customization
- **Accessible** WCAG 2.1 AA compliance built-in
- **Professional** medical software appearance

### Global Theme Variables

```css
:root {
  /* Healthcare Color Palette */
  --healthcare-primary: #2563eb;     /* Professional blue */
  --healthcare-primary-hover: #1d4ed8;
  --healthcare-primary-light: #dbeafe;
  --healthcare-primary-dark: #1e40af;

  --healthcare-secondary: #64748b;   /* Neutral gray */
  --healthcare-secondary-hover: #475569;
  --healthcare-secondary-light: #f1f5f9;
  --healthcare-secondary-dark: #334155;

  --healthcare-accent: #059669;      /* Success green */
  --healthcare-accent-hover: #047857;
  --healthcare-accent-light: #d1fae5;

  --healthcare-warning: #d97706;     /* Warning orange */
  --healthcare-warning-hover: #b45309;
  --healthcare-warning-light: #fed7aa;

  --healthcare-danger: #dc2626;      /* Error red */
  --healthcare-danger-hover: #b91c1c;
  --healthcare-danger-light: #fee2e2;

  /* Semantic Colors */
  --color-success: var(--healthcare-accent);
  --color-warning: var(--healthcare-warning);
  --color-error: var(--healthcare-danger);
  --color-info: var(--healthcare-primary);

  /* Typography Scale */
  --font-size-xs: 0.75rem;   /* 12px */
  --font-size-sm: 0.875rem;  /* 14px */
  --font-size-base: 1rem;    /* 16px */
  --font-size-lg: 1.125rem;  /* 18px */
  --font-size-xl: 1.25rem;   /* 20px */
  --font-size-2xl: 1.5rem;   /* 24px */
  --font-size-3xl: 1.875rem; /* 30px */

  /* Spacing Scale (following 8px grid) */
  --spacing-1: 0.25rem;  /* 4px */
  --spacing-2: 0.5rem;   /* 8px */
  --spacing-3: 0.75rem;  /* 12px */
  --spacing-4: 1rem;     /* 16px */
  --spacing-5: 1.25rem;  /* 20px */
  --spacing-6: 1.5rem;   /* 24px */
  --spacing-8: 2rem;     /* 32px */
  --spacing-10: 2.5rem;  /* 40px */
  --spacing-12: 3rem;    /* 48px */
  --spacing-16: 4rem;    /* 64px */

  /* Border Radius */
  --radius-sm: 0.125rem;  /* 2px */
  --radius-base: 0.25rem; /* 4px */
  --radius-md: 0.375rem;  /* 6px */
  --radius-lg: 0.5rem;    /* 8px */
  --radius-xl: 0.75rem;   /* 12px */
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-base: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition-fast: 150ms ease-in-out;
  --transition-base: 200ms ease-in-out;
  --transition-slow: 300ms ease-in-out;

  /* Z-Index Scale */
  --z-dropdown: 1000;
  --z-modal: 1010;
  --z-popover: 1020;
  --z-tooltip: 1030;
  --z-notification: 1040;
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  :root {
    --healthcare-bg: #0f172a;        /* Dark background */
    --healthcare-surface: #1e293b;   /* Dark surface */
    --healthcare-text: #f8fafc;      /* Light text */
    --healthcare-text-muted: #94a3b8;
  }
}

/* Light Mode (default) */
:root {
  --healthcare-bg: #ffffff;        /* Light background */
  --healthcare-surface: #f8fafc;   /* Light surface */
  --healthcare-text: #0f172a;      /* Dark text */
  --healthcare-text-muted: #64748b;
}

/* Responsive Breakpoints */
:root {
  --screen-sm: 640px;   /* Small devices */
  --screen-md: 768px;   /* Medium devices (tablets) */
  --screen-lg: 1024px;  /* Large devices (desktops) */
  --screen-xl: 1280px;  /* Extra large devices */
  --screen-2xl: 1536px; /* 2X large devices */
}

/* Healthcare-Specific Utilities */
.healthcare-focus {
  @apply focus:outline-none focus:ring-2 focus:ring-healthcare-primary focus:ring-offset-2;
}

.healthcare-transition {
  transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform;
  transition-duration: var(--transition-base);
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

.healthcare-card {
  @apply bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm;
}

.healthcare-button {
  @apply inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md healthcare-transition healthcare-focus;
}

.healthcare-input {
  @apply block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm healthcare-focus bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100;
}

/* Medical Alert Styles */
.medical-alert {
  @apply p-4 rounded-md border-l-4;
}

.medical-alert-info {
  @apply medical-alert border-l-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200;
}

.medical-alert-success {
  @apply medical-alert border-l-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200;
}

.medical-alert-warning {
  @apply medical-alert border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200;
}

.medical-alert-error {
  @apply medical-alert border-l-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200;
}

/* Responsive Grid for Healthcare Layouts */
.healthcare-grid {
  display: grid;
  gap: var(--spacing-6);
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .healthcare-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .healthcare-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .healthcare-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Print Styles for Healthcare Reports */
@media print {
  .no-print {
    display: none !important;
  }
  
  .healthcare-card {
    @apply border border-gray-400 shadow-none;
  }
  
  .healthcare-button {
    @apply border border-gray-400;
  }
}
```

## Environment Configuration

### Required Environment Variables

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

### Environment-Specific Configurations

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

## Frontend Developer Standards

### Critical Coding Rules

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

### Quick Reference

#### Common Commands

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

#### Key Import Patterns

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

#### File Naming Conventions

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

#### Healthcare-Specific Patterns

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

## Summary

This comprehensive **Frontend Architecture Document** provides the complete technical foundation for the **AI Voice Agent for Capitol Eye Care** multi-modal interface system.

**✅ Architecture Delivered:**

- **Multi-Modal System**: Staff dashboard, patient portal, SMS/Email templates, mobile companion app
- **Healthcare-First Design**: HIPAA compliance, accessibility, professional medical UI
- **Next.js + TypeScript**: Modern, type-safe, server-side rendered architecture
- **OpenEMR Integration**: OAuth2 with PKCE, FHIR R4 compatibility, automated token management
- **Responsive Design**: Desktop, tablet, and mobile optimized for healthcare workflows
- **Scalable Foundation**: White-label ready, multi-practice deployment capable

**🏗️ Ready for Development:**

With your existing backend architecture and this frontend architecture, you now have a complete technical blueprint for implementing the AI Voice Agent system. The architecture supports your PRD requirements while providing the flexibility for future growth and platform expansion.

**Next steps:** Begin implementation with the development team using these architectural specifications as the authoritative guide.
