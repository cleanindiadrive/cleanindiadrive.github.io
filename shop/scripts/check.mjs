import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
let failed=false;
for(const file of readdirSync('.').filter(f=>f.endsWith('.js'))){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.status!==0)failed=true;
}
if(failed)process.exit(1);
console.log('All application JavaScript files passed syntax checks.');
