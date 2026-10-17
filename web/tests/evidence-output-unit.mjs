import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeEvidence} from './evidence-output.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hydra-evidence-test-'));
try{
 const original=path.join(dir,'result.json');await fs.writeFile(original,'preserve',{flag:'wx',mode:0o600});
 const one=await writeEvidence(original,'first','utf8'),two=await writeEvidence(original,'second');
 assert.notEqual(one,two);assert.equal(await fs.readFile(original,'utf8'),'preserve');
 assert.equal(await fs.readFile(one,'utf8'),'first');assert.equal(await fs.readFile(two,'utf8'),'second');
 if(process.platform!=='win32')assert.equal((await fs.stat(one)).mode&0o777,0o600);
 console.log('PASS private unique evidence files: repeated writes retain prior data and cannot clobber requested path');
}finally{await fs.rm(dir,{recursive:true,force:true});}
