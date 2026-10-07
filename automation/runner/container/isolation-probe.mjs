// Reviewed infrastructure probe; no user source or credential is supplied.
import {readFile,writeFile} from 'node:fs/promises';
import net from 'node:net';
try{
 if(process.getuid()===0)throw Error();
 const status=await readFile('/proc/self/status','utf8');
 if(!/^NoNewPrivs:\s+1$/m.test(status)||!/^Seccomp:\s+2$/m.test(status))throw Error();
 for(const name of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb'])if(!new RegExp('^'+name+':\\s+0+$','m').test(status))throw Error();
 if(Object.keys(process.env).some(k=>/TOKEN|SECRET|KEY|GITHUB|ACTIONS|SUPABASE|OPENAI/i.test(k)))throw Error();
 let denied=false;try{await writeFile('/app/untrusted-write-probe','probe',{flag:'wx'});}catch(e){denied=['EROFS','EACCES'].includes(e.code);}if(!denied)throw Error();
 const blocked=await new Promise(resolve=>{const s=net.createConnection({host:'1.1.1.1',port:443});const end=v=>{s.destroy();resolve(v);};s.setTimeout(1500,()=>end(false));s.once('connect',()=>end(false));s.once('error',e=>end(['ENETUNREACH','EHOSTUNREACH'].includes(e.code)));});
 if(!blocked)throw Error();
 process.stdout.write(JSON.stringify({isolated:true}));
}catch{process.stderr.write('CONTAINER_ISOLATION_FAILED\n');process.exitCode=1;}
