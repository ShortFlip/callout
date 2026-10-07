import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PlayerProvider } from '@/components/game/PlayerProvider';
import { Toaster } from 'sonner';
import './globals.css';

// The three faces are vendored in ./fonts instead of fetched by next/font/google.
// Google Fonts now and then answers with extensionless `/l/font?kit=` URLs that
// Turbopack cannot parse, and that fails the build at random
// (vercel/next.js#99114). Self-hosting keeps every build off the network.
// The files are the latin variable subsets from @fontsource-variable 5.3.0,
// which republishes Google Fonts' own files. Each weight range stops where the old static
// weight list stopped, so `font-black` still renders at 800 as it did before.

// Display/headers — bold and characterful for "Arcade Lounge" feel
const outfit = localFont({
  src: './fonts/outfit-latin-wght-normal.woff2',
  variable: '--font-display',
  weight: '400 800',
});

// Body/UI — clean geometric sans
const plusJakartaSans = localFont({
  src: './fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '400 700',
});

// Monospace — room codes, stats, timestamps
const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin-wght-normal.woff2',
  variable: '--font-mono',
  weight: '400 700',
});

export const metadata: Metadata = {
  title: 'Callout',
  description: 'Real-time multiplayer bingo for your friend group.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Dark mode is the default — apply class here so CSS vars resolve correctly
    <html
      lang="en"
      className={`dark ${outfit.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* TooltipProvider required at root for all shadcn Tooltip components */}
        <TooltipProvider>
          <PlayerProvider>
            {children}
          </PlayerProvider>
          <Toaster theme="dark" position="bottom-right" richColors />
        </TooltipProvider>
      </body>
    </html>
  );
}
