# Project Structure

## Project Structure Rationale

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
