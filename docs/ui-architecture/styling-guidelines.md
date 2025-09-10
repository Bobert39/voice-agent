# Styling Guidelines

## Styling Approach

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

## Global Theme Variables

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
