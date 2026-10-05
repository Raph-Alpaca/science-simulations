import {workerTrustConfig,createWorkerTokenVerifier,WorkerAuthError} from '../../../../lib/worker-auth.mjs';
import {createWorkerHttpHandler} from '../../../../lib/worker-http.mjs';
import {createWorkerGateway} from '../../../../lib/worker-gateway.mjs';
import {database} from '../../../../lib/supabase';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
let handler: ReturnType<typeof createWorkerHttpHandler> | undefined;
let versionKey='';
export async function POST(request: Request,context: {params: Promise<{action:string}>}){
 try{
  const config=workerTrustConfig(process.env);
  const currentVersion=config.trustedShas.join(',');
  if(!handler||versionKey!==currentVersion){handler=createWorkerHttpHandler({verifyToken:createWorkerTokenVerifier(config),gateway:createWorkerGateway(database())});versionKey=currentVersion;}
  return handler(request,(await context.params).action);
 }catch(error){
  return Response.json({error:error instanceof WorkerAuthError?error.code:'WORKER_SERVICE_UNAVAILABLE'},{status:error instanceof WorkerAuthError?error.status:503,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
 }
}
