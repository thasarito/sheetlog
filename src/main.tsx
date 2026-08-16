import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { IS_DEV_MODE, MOCK_ONBOARDING_STATE } from './lib/mock';
import { setOnboardingState } from './lib/settings';
import { router } from './router';
import './styles/globals.css';

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

if (IS_DEV_MODE) {
  console.log('[DEV MODE] Mock mode enabled - using mock data');
  const devSheetId = 'mock-sheet-id-dev';
  void setOnboardingState(MOCK_ONBOARDING_STATE, devSheetId).catch((error) => {
    console.warn('[DEV MODE] Failed to seed scoped mock onboarding:', error);
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
