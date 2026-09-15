// Static contract checks only. These do not execute or validate PostgreSQL/RLS behavior.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const sql=await fs.readFile(new URL('../../supabase/proposals/studio_v1.sql',import.meta.url),'utf8');
const service=await fs.readFile(new URL('../../apps/studio/lib/service.ts',import.meta.url),'utf8');
test('server RPC arguments and explicit EXECUTE grant signatures match the SQL proposal',()=>{
  const calls=[...service.matchAll(/\.rpc\('([a-z_]+)',\s*\{([^}]+)\}/g)];
  assert.equal(calls.length,3);
  for(const [,name,body] of calls){
    const definition=sql.match(new RegExp('create function studio\\.'+name+'\\(([^)]+)\\)'));
    assert.ok(definition,name);
    const args=definition[1].split(',').map(part=>part.trim().split(/\s+/));
    const keys=[...body.matchAll(/\b(p_\w+)\s*:/g)].map(match=>match[1]).sort();
    assert.deepEqual(keys,args.map(arg=>arg[0]).sort(),name);
    assert.ok(sql.includes('studio.'+name+'('+args.map(arg=>arg[1]).join(',')+')'),name+' grant');
  }
});
test('every server table reference exists and SQL proposal retains a single non-overwriting transaction',()=>{
  for(const [,name] of service.matchAll(/\.from\('([a-z_]+)'\)/g))assert.ok(sql.includes('create table studio.'+name+' ('),name);
  const executable=sql.replace(/--[^\n]*/g,'');
  assert.match(executable,/^\s*begin;/);assert.match(executable,/commit;\s*$/);
  assert.doesNotMatch(executable,/\b(drop|truncate)\b|create\s+or\s+replace|disable\s+row\s+level\s+security/i);
  assert.match(sql,/revoke all on all functions in schema studio from public, anon, authenticated/);
  assert.match(sql,/row\.state_version is distinct from p_expected or row\.state_version>=19/);
});
