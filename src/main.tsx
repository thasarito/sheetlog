import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { installCategoryGestureSelectionGuard } from './components/categoryGestureSelectionLock';
import { IS_DEV_MODE, MOCK_ONBOARDING_STATE } from './lib/mock';
import { setOnboardingState } from './lib/settings';
import { router } from './router';
import './styles';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

const removeCategoryGestureSelectionGuard =
  installCategoryGestureSelectionGuard(document);

if (import.meta.hot) {
  import.meta.hot.dispose(removeCategoryGestureSelectionGuard);
}

async function startApplication(container: HTMLElement): Promise<void> {
  onlineManager.setOnline(window.navigator.onLine);

  if (IS_DEV_MODE) {
    console.log('[DEV MODE] Mock mode enabled - using mock data');
    try {
      await setOnboardingState(MOCK_ONBOARDING_STATE, 'mock-sheet-id-dev');
    } catch (error) {
      console.warn('[DEV MODE] Failed to seed scoped mock onboarding:', error);
    }
  }

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void startApplication(rootElement);
