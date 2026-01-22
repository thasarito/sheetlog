/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_LEMONSQUEEZY_PERSONAL_CHECKOUT_URL?: string;
  readonly VITE_LEMONSQUEEZY_PRO_CHECKOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
