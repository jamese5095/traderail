import 'server-only';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { deployment, isLocal } from './config/chain';
import { ApiError } from './http';

export const shipmentPattern = /^SHIP-\d{3,4}$/;
export interface DemoRounds { active: string; rounds: string[]; }
const directory = process.env.DEMO_SESSION_DIR ?? resolve(process.cwd(), '.demo-sessions');
const name = `${deployment.chainId}-${deployment.protocol.toLowerCase()}`;
const file = join(directory, `${name}.json`);
const lock = join(directory, `${name}.lock`);
export const initialRounds: DemoRounds = { active: 'SHIP-001', rounds: ['SHIP-001'] };
export const preparedShipments = (deployment as typeof deployment & { demoShipments?: string[] }).demoShipments ?? ['SHIP-001'];

export async function getRounds(): Promise<DemoRounds> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as DemoRounds;
    if (!shipmentPattern.test(value.active) || !Array.isArray(value.rounds) || !value.rounds.every(id => shipmentPattern.test(id)) || !value.rounds.includes(value.active)) throw new Error('Invalid demo session file');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...initialRounds, rounds: [...initialRounds.rounds] };
    throw error;
  }
}

export function nextShipment(rounds: DemoRounds) {
  const next = `SHIP-${String(Number(rounds.active.slice(5)) + 1).padStart(3, '0')}`;
  if (!shipmentPattern.test(next)) throw new ApiError('Demo shipment limit reached', 409);
  if (!isLocal && !preparedShipments.includes(next)) throw new ApiError('No prepared testnet rounds remain. Deploy more registered demo shipments.', 409);
  return next;
}

export async function saveRounds(value: DemoRounds) {
  await mkdir(directory, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600 });
  await rename(temporary, file);
}

// A filesystem lock works across Next route bundles/processes on a persistent Node host.
export async function withRoundLock<T>(work: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  try { await mkdir(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const age = Date.now() - (await stat(lock)).mtimeMs;
    if (age < 180_000) throw new ApiError('Another demo transaction is in progress. Try again after confirmation.', 409);
    await rm(lock, { recursive: true, force: true });
    try { await mkdir(lock); } catch { throw new ApiError('Another demo transaction is in progress. Try again after confirmation.', 409); }
  }
  try { return await work(); } finally { await rm(lock, { recursive: true, force: true }); }
}

export async function requireActiveShipment(id: string) {
  const rounds = await getRounds();
  if (id !== rounds.active) throw new ApiError('Demo round changed. Refresh before submitting another transaction.', 409);
  return rounds;
}
