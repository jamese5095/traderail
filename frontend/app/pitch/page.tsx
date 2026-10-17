import type { Metadata } from 'next';
import {payChain} from '@backend/config/payables';
import { PitchDeck } from '@/components/pitch/deck';

export const dynamic='force-dynamic';

export const metadata: Metadata = {
  title: 'TradeRail · Project Pitch',
  description: 'TradeRail connects digitized supply-chain records to programmable stablecoin settlement on Monad, helping capital move with business progress. Seven pages explain positioning, settlement bottlenecks, architecture, Why Monad, the Private Settlement roadmap and commercial adoption.',
};

export default function PitchPage() {
  return <PitchDeck networkName={payChain.name} />;
}
