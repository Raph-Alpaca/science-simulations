import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', timeout:20000, globalTimeout:180000, retries:0, workers:1, maxFailures:5,
  reporter:[['list'],['html',{open:'never'}]],
  use:{channel:'chrome',baseURL:'http://127.0.0.1:4174/science-simulations/',viewport:{width:1440,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:[
    {command:'node automation/catalog/serve.mjs --build --port 4174',url:'http://127.0.0.1:4174/science-simulations/',reuseExistingServer:false,timeout:30000},
    {command:'node tests/fixtures/serve.mjs',url:'http://127.0.0.1:4175/science-simulations/',reuseExistingServer:false,timeout:30000}
  ]
});
