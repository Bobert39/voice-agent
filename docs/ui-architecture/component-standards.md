# Component Standards

## Component Standards Rationale

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

## Component Template

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

## Naming Conventions

### File and Component Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **React Components** | PascalCase | `PatientCard.tsx` | Always .tsx extension |
| **Component Files** | PascalCase | `AppointmentForm.tsx` | Match component name |
| **Hook Files** | camelCase with 'use' | `useOpenEMR.ts` | Custom hooks prefix |
| **Utility Files** | camelCase | `dateHelpers.ts` | Descriptive functionality |
| **Type Files** | camelCase | `patientTypes.ts` | Domain-specific types |
| **Store Files** | camelCase | `authStore.ts` | Zustand store naming |
| **Test Files** | PascalCase + .test | `PatientCard.test.tsx` | Mirror component name |

### CSS and Styling Conventions

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **CSS Classes** | kebab-case | `patient-card` | BEM methodology |
| **CSS Variables** | kebab-case with prefix | `--healthcare-primary` | Global variables |
| **Tailwind Classes** | Standard Tailwind | `bg-blue-50 hover:bg-blue-100` | Utility classes |
| **Component Variants** | camelCase | `variant="primaryAction"` | TypeScript enums |

### Directory and Route Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Page Routes** | kebab-case | `/patient-search` | URL-friendly |
| **API Routes** | kebab-case | `/api/patient-verification` | REST convention |
| **Directory Names** | kebab-case | `patient-management/` | Consistent structure |
| **Component Directories** | PascalCase | `PatientCard/` | Match component name |

### Variable and Function Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Variables** | camelCase | `patientData` | Descriptive names |
| **Constants** | SCREAMING_SNAKE_CASE | `API_ENDPOINTS` | All caps |
| **Functions** | camelCase | `handlePatientClick` | Action-oriented |
| **Event Handlers** | handle + Action | `handleSubmit` | Consistent prefix |
| **Boolean Variables** | is/has/can prefix | `isLoading` | Clear state indication |
| **Async Functions** | Action + Async suffix | `fetchPatientAsync` | Async indication |

### Healthcare-Specific Naming

| Element | Convention | Example | Notes |
|---------|------------|---------|--------|
| **Patient Data** | patient prefix | `patientId`, `patientName` | HIPAA clarity |
| **Medical Terms** | Full words | `appointment` not `appt` | Professional clarity |
| **Staff Roles** | Descriptive | `doctorPermissions` | Clear role indication |
| **HIPAA Fields** | Encrypted suffix | `phoneNumberEncrypted` | Security awareness |
