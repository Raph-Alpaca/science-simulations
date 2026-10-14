import {claimPublicationWorker} from './claim-worker.mjs';
const controller=new AbortController(),timer=setTimeout(()=>{controller.abort();process.exitCode=1;},55000),hard=setTimeout(()=>process.exit(1),60000);
try{await claimPublicationWorker({signal:controller.signal});console.log('PUBLICATION_AUTHORITY_CLAIMED');}
catch{console.error('PUBLICATION_AUTHORITY_UNCONFIRMED');process.exitCode=1;}
finally{clearTimeout(timer);clearTimeout(hard);}
