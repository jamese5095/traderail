import type {NextConfig} from 'next';
const config:NextConfig={output:'export',basePath:process.env.PAGES_BASE_PATH??'/traderail',poweredByHeader:false,images:{unoptimized:true}};
export default config;
