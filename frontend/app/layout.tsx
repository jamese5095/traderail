import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
export const metadata: Metadata = { title: 'TradeRail · Trade Settlement on Monad', description: 'Event-driven stablecoin trade settlement with optional receivables financing on Monad.', other: { google: 'notranslate' } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en" translate="no" className="notranslate"><body translate="no"><Providers><Shell>{children}</Shell></Providers></body></html>;
}
