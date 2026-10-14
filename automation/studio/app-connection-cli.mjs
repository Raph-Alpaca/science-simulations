// Read one bounded credential packet from stdin, never from argv or env files.
import {probeAppConnection} from './app-connection.mjs';

const stopped={status:'blocked',code:'APP_CONNECTION_INPUT_REJECTED',requests:0,executionReady:false};
const deadline=setTimeout(()=>{process.stdout.write(JSON.stringify({status:'blocked',code:'APP_CONNECTION_DEADLINE',executionReady:false})+'\n');process.exit(1);},25000);
try{
 if(process.argv.length!==3||process.argv[2]!=='--stdin')throw Error();
 const inputTimeout=setTimeout(()=>process.stdin.destroy(Error('INPUT_TIMEOUT')),5000);
 let input;
 try{
  const chunks=[];let size=0;
  for await(const chunk of process.stdin){size+=chunk.length;if(size>32768)throw Error();chunks.push(chunk);}
  input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }finally{clearTimeout(inputTimeout);}
 const fields=['appClientId','installationId','privateKey','expectedSha'];
 if(!input||Object.keys(input).length!==fields.length||!fields.every(k=>typeof input[k]==='string'))throw Error();
 const result=await probeAppConnection({env:{STUDIO_GITHUB_APP_CLIENT_ID:input.appClientId,STUDIO_GITHUB_INSTALLATION_ID:input.installationId,STUDIO_GITHUB_APP_PRIVATE_KEY:input.privateKey},expectedSha:input.expectedSha});
 input=null;process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.status==='metadata_verified'?0:1;
}catch{process.stdout.write(JSON.stringify(stopped)+'\n');process.exitCode=1;}
finally{clearTimeout(deadline);process.stdin.destroy();}
