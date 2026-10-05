// Manual, offline rehearsal. Synthetic data only; never reads environment files.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['supabase/proposals/studio_v1.sql','supabase/proposals/studio_v2.sql'];
const sql=files.map(f=>readFileSync(f));
const directory='.local/db-rehearsal/'+randomUUID(); mkdirSync(directory,{recursive:true});
let source,restored;
const fingerprint=async db=>{
 const tables=(await db.query("select tablename from pg_tables where schemaname='studio' order by tablename")).rows;
 const rows={};for(const {tablename} of tables) rows[tablename]=(await db.query(`select to_jsonb(t) row from studio.${tablename} t order by to_jsonb(t)::text`)).rows;
 const metadata=(await db.query("select c.relname,c.relrowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='studio' and c.relkind='r' order by c.relname")).rows;
 const policies=(await db.query("select tablename,policyname,roles::text,cmd,qual,with_check from pg_policies where schemaname='studio' order by tablename,policyname")).rows;
 const functions=(await db.query("select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosrc,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='studio' order by p.proname,args")).rows;
 return hash(JSON.stringify({rows,metadata,policies,functions}));
};
try {
 source=await PGlite.create();
 assert.equal((await source.query("select to_regnamespace('studio') n")).rows[0].n,null);
 await source.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
 await source.exec(sql[0].toString());
 const owner='00000000-0000-4000-8000-000000000011';
 await source.query('insert into auth.users values($1)',[owner]);
 await source.query('insert into studio.teachers values($1,true)',[owner]);
 await source.exec('set role service_role');
 const c=(await source.query('select studio.new_conversation($1,$2) c',[owner,'BACKUP TEST ONLY'])).rows[0].c;
 const request=randomUUID();
 const snapshot={schemaVersion:1,payload:{schoolYear:2024,requirements:'Synthetic backup fixture only'}};
 await source.query('select studio.submit_job($1,$2,$3,$4,$5,$6,$7)',[owner,c.id,request,'a'.repeat(64),snapshot,randomUUID(),randomUUID()]);
 await source.exec('reset role');
 await source.exec(sql[1].toString());
 assert.equal((await source.query('select studio.conversation_delete_enabled_v2() enabled')).rows[0].enabled,false);
 assert.equal((await source.query("select to_regclass('studio.dispatch_intents') n")).rows[0].n,null);
 const before=await fingerprint(source);
 const blob=await source.dumpDataDir('gzip');
 const path=directory+'/synthetic-pglite.tar.gz';
 writeFileSync(path,Buffer.from(await blob.arrayBuffer()));
 await source.close(); source=null;
 // Fresh independent instance, populated ONLY from the on-disk archive, not the source object.
 restored=await PGlite.create({loadDataDir:new Blob([readFileSync(path)])});
 assert.equal(await fingerprint(restored),before);
 await restored.exec('set role service_role');
 assert.equal((await restored.query('select studio.conversation_delete_enabled_v2() enabled')).rows[0].enabled,false);
 assert.ok((await restored.query('select studio.new_conversation_v2($1,$2,$3) c',[owner,'RESTORE TEST ONLY',randomUUID()])).rows[0].c.id);
 await restored.exec('reset role;set role authenticated');
 await assert.rejects(()=>restored.query('update studio.conversations set title=$1',['DENIED']),e=>e.code==='42501');
 const report={result:'PASS',engine:'PGlite 0.5.8',sql:files.map((path,i)=>({path,sha256:hash(sql[i])})),baselineThenV2:true,backupFile:path,backupSha256:hash(readFileSync(path)),restoredRowsPoliciesFunctionsAndTableACLMatch:true,restoredRpc:true,restoredWriteDenied:true,deleteEnabled:false,runnerApplied:false,twoConnectionConcurrency:'NOT EXECUTED: single-connection engine'};
 for(let i=0;i<files.length;i++)assert.equal(hash(readFileSync(files[i])),hash(sql[i]));
 writeFileSync(directory+'/result.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await source?.close();await restored?.close();}
