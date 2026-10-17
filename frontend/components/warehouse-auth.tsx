'use client';
import { useLocale } from '@/lib/i18n/locale';
export function WarehouseAuth({ required, token, setToken }: { required: boolean; token: string; setToken: (token: string) => void }) {
  const { t } = useLocale();
  if (!required) return null;
  return <div className="warehouse-auth"><label htmlFor="warehouse-token">{t("Warehouse API token")}</label><input id="warehouse-token" type="password" autoComplete="off" placeholder={t("Enter authorized warehouse token")} value={token} onChange={e => setToken(e.target.value)} /><small>{t("Used only for this page session. Warehouse transactions are signed by the server.")}</small></div>;
}
