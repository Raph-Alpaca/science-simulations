import assert from 'node:assert/strict';
import test from 'node:test';
import {redactConnectionChecks,assessBackupConnection} from '../../automation/studio/backup-checks.mjs';

test('reports a failed database-side TLS check without turning it into success', () => {
  assert.deepEqual(redactConnectionChecks({database_ok:true,read_only:true,tls:false,tls_version:null,server_major:17,studio_exists:true}), {
    database_ok:true,read_only:true,tls:false,tls_version:null,server_major:17,studio_exists:true,
  });
});

test('excludes credentials, connection strings and arbitrary fields', () => {
  const result = redactConnectionChecks({database_ok:false,read_only:true,tls:true,tls_version:'TLSv1.3',server_major:18,studio_exists:false,password:'SYNTHETIC_PRIVATE',connectionString:'SYNTHETIC_PRIVATE',error:'SYNTHETIC_PRIVATE'});
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE'), false);
  assert.equal(result.server_major, 18);
  assert.equal(result.database_ok, false);
  assert.equal(result.studio_exists, false);
  assert.deepEqual(Object.keys(result), ['database_ok','read_only','tls','tls_version','server_major','studio_exists']);
});

test('invalid field values remain unknown and cannot carry private strings', () => {
  const result = redactConnectionChecks({database_ok:'SYNTHETIC_PRIVATE',read_only:1,tls:'true',tls_version:'SYNTHETIC_PRIVATE',server_major:{secret:'SYNTHETIC_PRIVATE'},studio_exists:[]});
  assert.equal(Object.values(result).every(value => value === null), true);
});

test('missing or malformed check objects do not claim successful checks', () => {
  for (const input of [null,undefined,[],true,'SYNTHETIC_PRIVATE',{}]) {
    assert.equal(Object.values(redactConnectionChecks(input)).every(value => value === null), true);
  }
});

const valid = {database_ok:true, read_only:true, tls:false, tls_version:null, server_major:17, studio_exists:true};
test('session pooler distinguishes verified client TLS from unencrypted upstream observation', () => {
  const result = assessBackupConnection(valid, {mode:'session',clientVerifyFull:true});
  assert.equal(result.accepted, true);
  assert.equal(result.databaseSideTls, false);
  assert.equal(result.checks.tls_version, null);
  assert.equal(assessBackupConnection(valid, {mode:'session',clientVerifyFull:false}).accepted, false);
});
test('direct mode still rejects missing database-side TLS', () => {
  assert.equal(assessBackupConnection(valid, {mode:'direct',clientVerifyFull:true}).accepted, false);
  assert.equal(assessBackupConnection({...valid,tls:true,tls_version:'TLSv1.3'}, {mode:'direct',clientVerifyFull:true}).accepted, true);
});
test('session mode cannot hide a wrong target, writable session, missing schema or unknown transport', () => {
  for (const change of [{database_ok:false},{read_only:false},{studio_exists:false},{server_major:18},{tls:null}]) {
    assert.equal(assessBackupConnection({...valid,...change}, {mode:'session',clientVerifyFull:true}).accepted, false);
  }
  assert.equal(assessBackupConnection(valid, {mode:'transaction',clientVerifyFull:true}).accepted, false);
});
