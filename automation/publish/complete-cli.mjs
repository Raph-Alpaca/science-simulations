import {completePublicationWorker} from './complete-worker.mjs';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000),hard=setTimeout(()=>process.exit(1),60000);
try{const r=await completePublicationWorker({signal:controller.signal});console.log(r.published?'PUBLICATION_CONFIRMED':'PUBLICATION_RESULT_UNCONFIRMED');if(!r.published)process.exitCode=1;}
catch{console.error('PUBLICATION_RESULT_UNCONFIRMED');process.exitCode=1;}
finally{clearTimeout(timer);clearTimeout(hard);}
