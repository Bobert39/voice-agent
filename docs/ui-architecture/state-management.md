# State Management

## State Management Rationale

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

## Store Structure

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

## State Management Template

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
