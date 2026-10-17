'use client';
import { Suspense } from 'react';
import { RailDemo } from '@/components/rail-demo';
export default function EvidencePage(){return <Suspense fallback={<div className="page-loading">TradeRail…</div>}><RailDemo evidenceOnly/></Suspense>;}
