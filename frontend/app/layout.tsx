import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
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
      <body className="min-h-full flex flex-col bg-[#020A05] text-[#5CFF95] font-sans antialiased selection:bg-[#4CFF8A] selection:text-[#020A05]">
        <Navbar />
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
