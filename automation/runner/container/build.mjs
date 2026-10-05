import {appendFile} from 'node:fs/promises';
import path from 'node:path';
import {createBuildContext} from './build-context.mjs';
import {dockerCommand} from '../runtime-container.mjs';
try{
 if(process.platform!=='linux'||!path.isAbsolute(process.env.RUNNER_TEMP||'')||!path.isAbsolute(process.env.GITHUB_OUTPUT||''))throw Error();
 const folder=await createBuildContext(process.env.RUNNER_TEMP);
 const output=await dockerCommand(['build','--platform','linux/amd64','--quiet','--file',path.join(folder,'Dockerfile'),folder],{timeout:240000,maxBytes:256});
 const image=output.trim();if(!/^sha256:[a-f0-9]{64}$/.test(image))throw Error();
 await appendFile(process.env.GITHUB_OUTPUT,'image='+image+'\n');
 console.log('CONTAINER_IMAGE_PREPARED');
}catch{console.error('CONTAINER_BUILD_FAILED');process.exitCode=1;}
