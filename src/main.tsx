import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { getOnboardingState } from "./lib/settings";
import { onboardingKeys } from "./hooks/useOnboardingQuery";
import "./styles/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

// Pre-seed onboarding cache from IndexedDB for instant load
getOnboardingState().then((state) => {
  queryClient.setQueryData(onboardingKeys.all, state);
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
