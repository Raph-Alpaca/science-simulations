import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Operations scripts keep SQL, rows and libpq diagnostics private. They only
// expose fixed error codes; callers must explicitly select report fields.
export async function runProcess(executable,args,{env,input,timeout=30000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env,windowsHide:true});
    let stdout='',stderr='',done=false;
    const finish=(error,code)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve({code,stdout,stderr});};
    const timer=setTimeout(()=>{child.kill();finish(Error('PROCESS_TIMEOUT'));},timeout);
    child.stdout.on('data',value=>{stdout+=value;if(stdout.length>8_000_000){child.kill();finish(Error('OUTPUT_LIMIT'));}});
    child.stderr.on('data',value=>{stderr+=value;if(stderr.length>1_000_000){child.kill();finish(Error('OUTPUT_LIMIT'));}});
    child.on('error',()=>finish(Error('PROCESS_START_FAILED')));
    child.on(executable.endsWith('pg_ctl.exe')?'exit':'close',code=>finish(null,code));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export class PrivatePgSession {
  constructor(bin,env){
    this.child=spawn(join(bin,'psql.exe'),['-X','-qAt','-w','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,windowsHide:true});
    this.pending=null;this.buffer='';this.closed=false;this.exited=false;
    this.child.stdout.on('data',chunk=>{
      this.buffer+=chunk;
      if(this.buffer.length>8_000_000){this.child.kill();return;}
      if(!this.pending)return;
      const at=this.buffer.indexOf(this.pending.marker),end=at<0?-1:this.buffer.indexOf('\n',at);
      if(end<0)return;
      const p=this.pending;this.pending=null;clearTimeout(p.timer);
      const answer=this.buffer.slice(0,at).trim();this.buffer=this.buffer.slice(end+1);p.resolve(answer);
    });
    this.child.stderr.on('data',()=>{});
    const fail=()=>{this.exited=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('SQL_SESSION_FAILED'));this.pending=null;}};
    this.child.on('error',fail);this.child.on('exit',fail);this.child.stdin.on('error',fail);
  }
  sql(sql){
    if(this.pending||this.closed||this.exited)throw Error('SQL_SESSION_UNAVAILABLE');
    return new Promise((resolve,reject)=>{
      const marker='COMPLETE_'+randomUUID().replaceAll('-','');
      const timer=setTimeout(()=>{this.pending=null;this.child.kill();reject(Error('SQL_TIMEOUT'));},30000);
      this.pending={marker,timer,resolve,reject};this.child.stdin.write(sql+'\n\\echo '+marker+'\n');
    });
  }
  async json(sql){return JSON.parse(await this.sql(sql));}
  close(){if(!this.closed&&!this.exited){this.closed=true;this.child.stdin.end('\\q\n');}}
}
export const sqlString=value=>"'"+String(value).replaceAll("'","''")+"'";
