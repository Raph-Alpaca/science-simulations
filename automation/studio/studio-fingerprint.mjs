import {createHash} from 'node:crypto';
const tables=['approvals','conversations','job_events','jobs','messages','releases','reviews','teachers'];
const digest=value=>createHash('sha256').update(value).digest('hex');
export const metadataSql=`select json_build_object(
 'schema',(select json_build_object('owner',pg_get_userbyid(nspowner),'acl',(select json_agg(v order by v) from unnest(nspacl::text[])v)) from pg_namespace where nspname='studio'),
 'tables',(select json_agg(x order by relname) from(select c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,(select json_agg(v order by v) from unnest(c.relacl::text[])v) acl from pg_class c where c.relnamespace='studio'::regnamespace and c.relkind in ('r','S','v','m'))x),
 'columns',(select json_agg(x order by relation,attnum) from(select c.relname relation,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value,(select json_agg(v order by v) from unnest(a.attacl::text[])v) acl from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='studio'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped)x),
 'constraints',(select json_agg(x order by relation,name) from(select conrelid::regclass::text relation,conname name,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='studio'::regnamespace)x),
 'policies',(select json_agg(x order by tablename,policyname) from(select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='studio')x),
 'functions',(select json_agg(x order by name,args) from(select p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,(select json_agg(v order by v) from unnest(p.proacl::text[])v) acl from pg_proc p where p.pronamespace='studio'::regnamespace)x),
 'indexes',(select json_agg(x order by indexname) from(select indexname,indexdef from pg_indexes where schemaname='studio')x))::text;`;
export async function fingerprint(session){
  const data={};
  for(const table of tables)data[table]=await session.json(`select json_build_object('rows',count(*),'md5',md5(coalesce(string_agg(row::text,E'\\n' order by row::text collate "C"),'[]')))::text from(select to_jsonb(t) row from studio.${table} t)x;`);
  const metadata=await session.json(metadataSql);
  return {data,metadata,dataHash:digest(JSON.stringify(data)),metadataHash:digest(JSON.stringify(metadata))};
}
