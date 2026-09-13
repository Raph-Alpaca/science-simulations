import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, hash } from './content.mjs';
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'});
const split=text=>text.split('\0').filter(Boolean);
const tracked=split(git('ls-files','-z'));
const candidates=[...new Set([...tracked,...split(git('ls-files','--others','--exclude-standard','-z'))])].sort();
const ignored=split(git('ls-files','--others','--ignored','--exclude-standard','--directory','-z'));
const problems=[];
const signatures=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],['api-key',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b/],['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['credential-url',/https?:\/\/[^\s/:]+:[^\s/@]+@/]];
const candidateManifest=[];
for(const file of candidates) {
  if (/(^|\/)(\.local|node_modules|dist|recordings|playwright-report|test-results)(\/|$)|(^|\/)\.env(?!\.example$)|\.(pem|key|p12|pfx|pdf|docx|hwp|hwpx|log)$/i.test(file)) problems.push({path:file,type:'private-or-generated-path'});
  const stat=await fs.lstat(path.join(ROOT,file));
  if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1) { problems.push({path:file,type:'nonregular-or-linked'});continue; }
  if(stat.size>5*1024*1024) { problems.push({path:file,type:'oversize-not-scanned'});continue; }
  const bytes=await fs.readFile(path.join(ROOT,file));
  const text=bytes.toString('utf8');
  for(const [type,pattern] of signatures) if(pattern.test(text)) problems.push({path:file,type});
  if(file.endsWith('.env.example')) for(const line of text.split(/\r?\n/)) {
    const match=line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    const knownRepoPlaceholder=match?.[1]==='GH_REPO' && match[2]==='science-simulations';
    if(match && match[2] && !knownRepoPlaceholder && !/^(false|true|\d+|["']?[<\[].*[>\]]["']?|["']?["']?)$/.test(match[2]) && !/example|placeholder|your_|replace_|changeme/i.test(match[2])) problems.push({path:file,type:'env-example-value-needs-review'});
  }
  candidateManifest.push({path:file,hash:hash(bytes)});
}
const report={recordedAt:new Date().toISOString(),branch:git('symbolic-ref','--short','HEAD').trim(),commits:Number(git('rev-list','--all','--count').trim()),tracked:tracked.length,candidates,candidateManifest,ignored,problems,draftSourceCandidates:candidates.filter(p=>p.startsWith('content/simulations/mendel-inheritance/')),note:'후보는 업로드 승인이 아님. Patterns only; arbitrary encoded secrets/personal notes require human review. No values printed.'};
const folder=path.join(ROOT,'.local/evidence/pages04');await fs.mkdir(folder,{recursive:true});
await fs.writeFile(path.join(folder,'upload-audit.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(folder,'upload-candidates.txt'),candidates.join('\n')+'\n');
await fs.writeFile(path.join(folder,'excluded-paths.txt'),ignored.join('\n')+'\n');
console.log(JSON.stringify({branch:report.branch,commits:report.commits,tracked:report.tracked,candidates:candidates.length,ignored,problems,draftSourceCandidates:report.draftSourceCandidates},null,2));
if(problems.length)process.exitCode=1;
