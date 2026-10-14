import {checkOidcConnection} from './oidc-connection.mjs';

const result=await checkOidcConnection({env:process.env,role:process.argv.length===3?process.argv[2]:null});
process.stdout.write(JSON.stringify(result)+'\n');
if(result.status!=='verified')process.exitCode=1;
