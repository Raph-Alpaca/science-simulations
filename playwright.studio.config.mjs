import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/studio/browser',outputDir:'.local/test-results/studio',timeout:30000,globalTimeout:180000,retries:0,workers:1,maxFailures:3,
  reporter:[['list']],use:{channel:'chrome',baseURL:'http://127.0.0.1:3001',viewport:{width:1440,height:1100},trace:'retain-on-failure'},
  webServer:{command:'node node_modules/next/dist/bin/next start apps/studio --hostname 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001',reuseExistingServer:false,timeout:60000,
    env:{SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:'',ALLOWED_USER_IDS:'',STUDIO_ORIGIN:'',STUDIO_DB_READY:'false',NEXT_TELEMETRY_DISABLED:'1'}},
});
