import type {Metadata} from 'next';
import '../../frontend/app/globals.css';
import {LocaleProvider} from '../../frontend/lib/i18n/locale';
export const metadata:Metadata={title:'贸脉 TradeRail · Project Pitch',description:'贸脉 TradeRail — Trade settlement and financing on Monad. Explore the business context, protocol, Why Monad and future privacy roadmap.',other:{google:'notranslate'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN" translate="no" className="notranslate"><body translate="no"><LocaleProvider presentation>{children}</LocaleProvider></body></html>;}
