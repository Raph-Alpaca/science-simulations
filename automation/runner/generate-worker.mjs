// Trusted Actions entry point. No candidate execution or DB/GitHub App key.
import {createGitHubTokenProvider,createWorkerApiClient} from './worker-client.mjs';
import {runRemoteGeneration} from './remote-generation.mjs';
import {RunnerError} from './bounded-responses.mjs';
import {WORKER_TRUST} from '../../apps/studio/lib/worker-auth.mjs';

const controller=new AbortController(),cancel=()=>controller.abort();
process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
const timer=setTimeout(cancel,1_200_000);
try{
 if(process.env.STUDIO_GENERATION_ENABLED!=='true'||process.env.GITHUB_REPOSITORY!==WORKER_TRUST.repository||process.env.GITHUB_REF!==WORKER_TRUST.ref||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw new RunnerError('WORKER_SETUP_REQUIRED');
 const jobId=process.env.STUDIO_JOB_ID;
 const api=createWorkerApiClient({jobId,getToken:createGitHubTokenProvider(process.env)});
 const outcome=await runRemoteGeneration({api,jobId,baselineSha:process.env.GITHUB_SHA,apiKey:process.env.OPENAI_API_KEY,signal:controller.signal});
 console.log(JSON.stringify({state:outcome.job.state,calls:outcome.result.calls??null}));
 if(outcome.job.state==='failed')process.exitCode=1;
}catch(error){
 console.error(error instanceof RunnerError&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'WORKER_GENERATION_FAILED');process.exitCode=1;
}finally{clearTimeout(timer);process.off('SIGTERM',cancel);process.off('SIGINT',cancel);}
