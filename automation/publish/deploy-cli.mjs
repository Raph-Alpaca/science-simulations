import {deployPublicationWorker} from './deploy-worker.mjs';
const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),220000),hard=setTimeout(()=>process.exit(1),230000);
try{const r=await deployPublicationWorker({signal:controller.signal});console.log(r.state==='verified'?'PUBLICATION_BYTES_VERIFIED':'PUBLICATION_DEPLOYMENT_UNCONFIRMED');}
catch{console.error('PUBLICATION_DEPLOYMENT_UNCONFIRMED');process.exitCode=1;}
finally{clearTimeout(timer);clearTimeout(hard);}
