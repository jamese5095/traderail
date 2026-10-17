'use client';
import { Suspense } from 'react';
import { RailDemo } from '@/components/rail-demo';
export default function OperationsPage(){return <Suspense fallback={<div className="page-loading">TradeRail…</div>}><RailDemo/></Suspense>;}
