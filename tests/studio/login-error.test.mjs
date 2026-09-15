import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginFailure, loginDiagnostic} from '../../apps/studio/lib/login-error.mjs';

test('login distinguishes transport, rate limit, credentials and other Auth failures', () => {
  assert.deepEqual(loginFailure({name:'AuthRetryableFetchError',status:0}),{code:'AUTH_UNAVAILABLE',status:503});
  assert.equal(loginFailure({status:503}).code,'AUTH_UNAVAILABLE');
  assert.equal(loginFailure({status:429}).code,'AUTH_RATE_LIMITED');
  assert.equal(loginFailure({code:'over_request_rate_limit'}).code,'AUTH_RATE_LIMITED');
  assert.equal(loginFailure({code:'invalid_credentials',status:400}).code,'LOGIN_FAILED');
  assert.equal(loginFailure({code:'email_not_confirmed',status:400}).code,'AUTH_REJECTED');
  assert.equal(loginFailure({message:'invalid_credentials'}).code,'AUTH_REJECTED');
});

test('diagnostics preserve failure stage while excluding arbitrary fields and values', () => {
  const marker='PRIVATE_TEST_MARKER';
  const input={code:'TEACHER_NOT_ALLOWED',status:403,email:marker,password:marker,token:marker,message:marker,cause:marker};
  for(const stage of ['allowlist','active_teacher']) {
    assert.deepEqual(loginDiagnostic(stage,input),{stage,code:'TEACHER_NOT_ALLOWED',status:403});
  }
  assert.deepEqual(loginDiagnostic(marker,{...input,code:marker,status:marker}),{stage:'unknown',code:'UNKNOWN',status:null});
  assert.ok(!JSON.stringify(loginDiagnostic('password_sign_in',input)).includes(marker));
});
