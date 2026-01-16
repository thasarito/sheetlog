/**
 * Mock mode for offline development
 *
 * Enable by setting VITE_DEV_MODE=true in your .env.local file
 */

export const IS_DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

export * from './mockGoogle';
export * from './mockOAuth';
export * from './mockOnboarding';
export * from './mockStorage';
