import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./routes/HomePage";
import { OAuthCallbackPage } from "./routes/OAuthCallbackPage";
import { PrivacyPolicyPage } from "./routes/PrivacyPolicyPage";
import { TermsPage } from "./routes/TermsPage";

const rootRoute = createRootRoute({
  component: AppShell,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const legacyAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: HomePage,
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: OAuthCallbackPage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPolicyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  legacyAppRoute,
  oauthCallbackRoute,
  privacyRoute,
  termsRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
