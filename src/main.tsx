import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { onboardingKeys } from './hooks/useOnboardingQuery';
import { IS_DEV_MODE, MOCK_ONBOARDING_STATE } from './lib/mock';
import { getOnboardingState, setOnboardingState } from './lib/settings';
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

// Pre-seed onboarding cache from IndexedDB for instant load
if (IS_DEV_MODE) {
  console.log('[DEV MODE] Mock mode enabled - using mock data');
  setOnboardingState(MOCK_ONBOARDING_STATE).then(() => {
    queryClient.setQueryData(onboardingKeys.all, MOCK_ONBOARDING_STATE);
  });
} else {
  getOnboardingState().then((state) => {
    queryClient.setQueryData(onboardingKeys.all, state);
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
