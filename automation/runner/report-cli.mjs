import {reportWorker} from './report-worker.mjs';
const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,600000);
process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
try{console.log(JSON.stringify(await reportWorker(process.argv[2],{signal:controller.signal})));}
catch{console.error('REPORT_WORKER_FAILED');process.exitCode=1;}
finally{clearTimeout(timer);process.off('SIGTERM',cancel);process.off('SIGINT',cancel);}
