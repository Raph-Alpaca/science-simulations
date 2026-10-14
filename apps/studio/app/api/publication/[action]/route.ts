import {publicationTrustConfig,createPublicationTokenVerifier,PublicationAuthError} from '../../../../lib/publication-auth.mjs';
import {createPublicationHttpHandler,publicationResponse} from '../../../../lib/publication-http.mjs';
import {createPublicationGateway} from '../../../../lib/publication-gateway.mjs';
import {database} from '../../../../lib/supabase';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
let handler:ReturnType<typeof createPublicationHttpHandler>|undefined;
let versionKey='';
export async function POST(request:Request,context:{params:Promise<{action:string}>}){
 try{
  const config=publicationTrustConfig(process.env),key=config.trustedShas.join(',');
  if(!handler||versionKey!==key){handler=createPublicationHttpHandler({verifyToken:createPublicationTokenVerifier(config),gateway:createPublicationGateway(database())});versionKey=key;}
  return handler(request,(await context.params).action);
 }catch(error){return publicationResponse({error:error instanceof PublicationAuthError?error.code:'PUBLICATION_SERVICE_UNAVAILABLE'},error instanceof PublicationAuthError?error.status:503);}
}
