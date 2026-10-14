export const LEGACY_TABLES=Object.freeze(['approvals','conversations','job_events','jobs','messages','releases','reviews','teachers']);
export const WORKER_TABLES=Object.freeze(['dispatch_intents','budget_policy','budget_jobs','budget_calls','worker_runs','worker_evidence','worker_oidc_receipts','input_reviews','result_feedback','content_heads'].sort());
export const FOUNDATION_TABLES=Object.freeze([...LEGACY_TABLES,...WORKER_TABLES].sort());
export const PUBLICATION_TABLES=Object.freeze(['release_baseline','release_reviews','source_reviews','publication_dispatches','publication_oidc_receipts','publication_checks','publication_authorizations','publication_outcomes'].sort());
export function backupScope(mode='legacy'){
 if(!['legacy','worker-foundation'].includes(mode))throw Error('BACKUP_SCOPE_REJECTED');
 return mode==='legacy'?LEGACY_TABLES:FOUNDATION_TABLES;
}
export function fingerprintScope(tables,excludeColumns={}){
 if(!Array.isArray(tables)||tables.length<1||tables.length>64||new Set(tables).size!==tables.length||tables.some(t=>!/^[_a-z][_a-z0-9]*$/.test(t)))throw Error('FINGERPRINT_SCOPE_REJECTED');
 if(!excludeColumns||typeof excludeColumns!=='object'||Array.isArray(excludeColumns))throw Error('FINGERPRINT_SCOPE_REJECTED');
 for(const [table,columns] of Object.entries(excludeColumns))if(!tables.includes(table)||!Array.isArray(columns)||columns.length>32||columns.some(c=>!/^[_a-z][_a-z0-9]*$/.test(c)))throw Error('FINGERPRINT_SCOPE_REJECTED');
 return {tables:[...tables],excludeColumns:structuredClone(excludeColumns)};
}
