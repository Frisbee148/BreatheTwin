import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BreathTwin // Asthma Flare-Up Digital Twin',
  description:
    'A multi-stream digital twin predicting asthma flare-ups 24–48 hours ahead by fusing EHR, continuous wearables, and real Indian ambient air quality.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#020A05] text-[#4CFF8A] font-sans antialiased selection:bg-[#4CFF8A] selection:text-[#020A05]">
        <Suspense fallback={<header className="h-20 bg-[#020A05] border-b border-[#12612F]" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Suspense fallback={<div className="p-8 text-center text-xs font-mono text-[#2FBF63]">&gt; LOADING TWIN TELEMETRY...</div>}>
            {children}
          </Suspense>
        </main>
        <Footer />
      </body>
    </html>
  );
}
