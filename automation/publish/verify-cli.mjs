import {verifyPublicationWorker} from './verify-worker.mjs';
const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,100000);
process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
try{if(process.argv.length!==2)throw Error();const result=await verifyPublicationWorker({signal:controller.signal});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;}
catch{console.error('PUBLICATION_VERIFY_FAILED');process.exitCode=1;}
finally{clearTimeout(timer);process.off('SIGTERM',cancel);process.off('SIGINT',cancel);}
