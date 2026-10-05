import {createHash} from 'node:crypto';

// Official model/token-count/Responses documentation checked 2026-10-04.
// No tools, code execution, file inputs, arbitrary hosts or SDK retry loop.
export const PRICING=Object.freeze({model:'gpt-5.4-mini-2026-03-17',checkedAt:'2026-10-04',expiresAt:'2026-11-04T00:00:00Z',inputNanodollars:750,cacheWriteNanodollars:938,outputNanodollars:4500});
export const CALL_LIMITS=Object.freeze({inputTokens:24000,developerOutputTokens:16384,reviewOutputTokens:4096,timeoutMs:90000,responseBytes:2_000_000,promptBytes:150_000});
const roles=new Set(['curriculum','subject','design','developer','reviewer']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class RunnerError extends Error{constructor(code){super(code);this.name='RunnerError';this.code=code;}}
const need=(condition,code)=>{if(!condition)throw new RunnerError(code);};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
export function costCeiling(input,output){
 need(integer(input)&&integer(output)&&input<=CALL_LIMITS.inputTokens&&output<=CALL_LIMITS.developerOutputTokens,'INVALID_TOKEN_COUNT');
 // Ignore cache discounts; reserve at a conservative cache-write upper rate.
 return Math.ceil((input*PRICING.cacheWriteNanodollars+output*PRICING.outputNanodollars)/1000);
}
export function usageCost(usage){
 need(integer(usage?.input_tokens)&&integer(usage?.output_tokens),'USAGE_UNCERTAIN');
 need(usage.input_tokens<=CALL_LIMITS.inputTokens&&usage.output_tokens<=CALL_LIMITS.developerOutputTokens,'USAGE_EXCEEDS_BOUND');
 const writes=usage.input_tokens_details?.cache_write_tokens??0;
 need(integer(writes)&&writes<=usage.input_tokens,'USAGE_UNCERTAIN');
 // Bill cached reads at the full input rate too: conservative internal ledger.
 return Math.ceil(((usage.input_tokens-writes)*PRICING.inputNanodollars+writes*PRICING.cacheWriteNanodollars+usage.output_tokens*PRICING.outputNanodollars)/1000);
}
export function requestForRole({role,instructions,input},now=Date.now()){
 need(roles.has(role)&&typeof instructions==='string'&&instructions.length>0&&typeof input==='string'&&input.length>0,'INVALID_ROLE_INPUT');
 need(Number.isFinite(now)&&now<Date.parse(PRICING.expiresAt),'PRICING_REVIEW_REQUIRED');
 need(Buffer.byteLength(instructions)+Buffer.byteLength(input)<=CALL_LIMITS.promptBytes,'PROMPT_TOO_LARGE');
 return {model:PRICING.model,input:[{role:'developer',content:instructions},{role:'user',content:input}],max_output_tokens:role==='developer'?CALL_LIMITS.developerOutputTokens:CALL_LIMITS.reviewOutputTokens,store:false,stream:false,background:false,service_tier:'default',reasoning:{effort:'low'},tools:[],tool_choice:'none',truncation:'disabled'};
}
async function limitedJson(response){
 need(response.body,'PROVIDER_RESPONSE_INVALID');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const value=await reader.read();if(value.done)break;size+=value.value.length;if(size>CALL_LIMITS.responseBytes){await reader.cancel();throw new RunnerError('PROVIDER_RESPONSE_TOO_LARGE');}chunks.push(value.value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RunnerError('PROVIDER_RESPONSE_INVALID');}
}
// ledger is a trusted DB-backed service. The API key never reaches its methods,
// the model input, generated files or report. Default transport is native fetch.
export function createBoundedResponses({apiKey,ledger,transport=fetch,now=Date.now}){
 need(typeof apiKey==='string'&&apiKey.startsWith('sk-')&&apiKey.length>20,'OPENAI_KEY_REQUIRED');
 need(typeof ledger?.reserve==='function'&&typeof ledger?.settle==='function','DURABLE_LEDGER_REQUIRED');
 return async function call({jobId,callId,role,instructions,input,signal}){
  need(uuid.test(jobId)&&uuid.test(callId),'INVALID_CALL_ID');
  need(!signal?.aborted,'JOB_CANCELLED');
  const request=requestForRole({role,instructions,input},now());
  const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const maxUsdMicros=costCeiling(CALL_LIMITS.inputTokens,request.max_output_tokens);
  let receipt;
  try{receipt=await ledger.reserve({jobId,callId,requestHash,role,maxUsdMicros});}
  catch{throw new RunnerError('BUDGET_RESERVATION_FAILED');}
  need(receipt?.newReservation===true,'CALL_ALREADY_RESERVED');
  const controller=new AbortController();let timer;
  const cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)controller.abort();
  let generationMayHaveStarted=false,settled=false;
  const post=async(path,body)=>{
   const response=await transport('https://api.openai.com/v1/responses'+path,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   if(!response.ok){
    // A definite request rejection is not an ambiguous 5xx/transport failure.
    if([400,401,403,404,422,429].includes(response.status))generationMayHaveStarted=false;
    await response.body?.cancel();throw new RunnerError(response.status===429?'PROVIDER_RATE_LIMITED':response.status===401||response.status===403?'PROVIDER_AUTH_REJECTED':'PROVIDER_REQUEST_FAILED');
   }
   return limitedJson(response);
  };
  try{
   need(!signal?.aborted,'JOB_CANCELLED');
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new RunnerError('PROVIDER_TIMEOUT'));},CALL_LIMITS.timeoutMs);});
   const generated=await Promise.race([timeout,(async()=>{
    const count=await post('/input_tokens',{model:request.model,input:request.input});
    need(count.object==='response.input_tokens'&&integer(count.input_tokens)&&count.input_tokens<=CALL_LIMITS.inputTokens,'INPUT_TOKEN_LIMIT');
    need(!controller.signal.aborted,'PROVIDER_TIMEOUT');
    generationMayHaveStarted=true;
    return post('',request);
   })()]);
   need(generated.model===PRICING.model&&generated.service_tier==='default','PROVIDER_PRICING_UNCERTAIN');
   need(generated.usage?.output_tokens<=request.max_output_tokens,'USAGE_EXCEEDS_BOUND');
   const chargedUsdMicros=usageCost(generated.usage);
   need(chargedUsdMicros<=maxUsdMicros,'USAGE_EXCEEDS_BOUND');
   const settlement=await ledger.settle({jobId,callId,chargedUsdMicros,uncertain:false});
   need(settlement?.state==='settled'&&!settlement.budgetBreach,'BUDGET_SETTLEMENT_FAILED');settled=true;
   need(!signal?.aborted,'JOB_CANCELLED');
   need(generated.status==='completed','MODEL_OUTPUT_INCOMPLETE');
   need(Array.isArray(generated.output),'MODEL_OUTPUT_INVALID');
   const messages=generated.output.filter(item=>item.type==='message');
   need(messages.length>0&&generated.output.every(item=>['message','reasoning'].includes(item.type)),'MODEL_OUTPUT_INVALID');
   const content=messages.flatMap(item=>item.content||[]);
   need(content.length>0&&content.every(item=>item.type==='output_text'&&typeof item.text==='string'),'MODEL_REFUSAL_OR_INVALID');
   const text=content.map(item=>item.text).join('\n');
   need(text.trim().length>0,'MODEL_OUTPUT_EMPTY');
   return {text,model:generated.model,requestHash,callId,usage:{inputTokens:generated.usage.input_tokens,outputTokens:generated.usage.output_tokens},chargedUsdMicros};
  }catch(error){
   if(!settled){
    // Timeout does not cancel already incurred billing. Unknown calls retain
    // both their reservation and the global job slot until reconciliation.
    try{const receipt=await ledger.settle({jobId,callId,chargedUsdMicros:generationMayHaveStarted?null:0,uncertain:generationMayHaveStarted});need(receipt?.state===(generationMayHaveStarted?'uncertain':'settled'),'BUDGET_SETTLEMENT_UNCERTAIN');}
    catch{throw new RunnerError('BUDGET_SETTLEMENT_UNCERTAIN');}
   }
   throw signal?.aborted?new RunnerError('JOB_CANCELLED'):error instanceof RunnerError?error:new RunnerError('PROVIDER_CONNECTION_UNCERTAIN');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controller.abort();}
 };
}
