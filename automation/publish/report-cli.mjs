import {reportPublicationWorker} from './report-worker.mjs';
const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,60000);
process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
try{if(process.argv.length!==2)throw Error();console.log(JSON.stringify(await reportPublicationWorker({signal:controller.signal})));}
catch{console.error('PUBLICATION_REPORT_FAILED');process.exitCode=1;}
finally{clearTimeout(timer);process.off('SIGTERM',cancel);process.off('SIGINT',cancel);}
