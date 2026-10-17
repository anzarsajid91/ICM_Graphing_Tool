// Synthetic test evidence only. Each write owns a new private directory, so
// predictable /tmp filenames cannot overwrite a pre-existing file or symlink.
import fs from 'node:fs/promises';
import path from 'node:path';
export async function writeEvidence(filename,data,encoding){
  const parent=path.dirname(filename);
  await fs.mkdir(parent,{recursive:true});
  const directory=await fs.mkdtemp(path.join(parent,'evidence-'));
  const target=path.join(directory,path.basename(filename));
  await fs.writeFile(target,data,{encoding:typeof encoding==='string'?encoding:undefined,flag:'wx',mode:0o600});
  return target;
}
