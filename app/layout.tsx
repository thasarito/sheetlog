import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '../components/AppProvider';

export const metadata: Metadata = {
  title: 'SheetLog',
  description: 'Rapid financial logging to Google Sheets',
  applicationName: 'SheetLog',
  themeColor: '#0f172a',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="no-tap-highlight">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
