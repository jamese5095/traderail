'use client';
import { useState } from 'react';
import { WagmiProvider, createConfig, http, injected } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chain, rpcUrl } from '@backend/config/chain';
import { LocaleProvider } from '@/lib/i18n/locale';
const config = createConfig({ chains: [chain], connectors: [injected()], transports: { [chain.id]: http(rpcUrl) }, ssr: true });
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <LocaleProvider><WagmiProvider config={config}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></WagmiProvider></LocaleProvider>;
}
