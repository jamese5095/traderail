'use client';
import { useLocale } from '@/lib/i18n/locale';
import type { Snapshot } from '@/lib/types';
import { Timeline } from './timeline';
import { ChainEvidence } from './chain-evidence';

export function LiveSettlement({ data, selectedHash, onSelectHash, returnHref, hidden = false }: { data: Snapshot | null; selectedHash: string; onSelectHash: (hash: string) => void; returnHref: string; hidden?: boolean }) {
  const { t } = useLocale();
  return <section className="live-settlement" id="live-settlement" aria-label={t('Live onchain execution')}>
    <Timeline entries={data?.timeline ?? []} hidden={hidden} selectedHash={selectedHash} onSelectHash={onSelectHash} />
    <ChainEvidence data={data} busy="" submittedHash="" hidden={hidden} selectedHash={selectedHash} onSelectHash={onSelectHash} />
  </section>;
}
