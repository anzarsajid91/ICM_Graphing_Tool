/* SPDX-FileCopyrightText: 2026 Anzar Sajid and other applicable rights holders
 * SPDX-License-Identifier: AGPL-3.0-only */
import {constants,createReadStream,createWriteStream,openAsBlob} from 'node:fs';
import {access,copyFile,link,mkdtemp,open,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import '../web/assets/simulation-results-core.js';

const {streamPackageFromCsv}=globalThis.HydraSimulationResults;
const usage='Usage: node scripts/pack_simulation_results.mjs SOURCE.csv MAPPING.json OUTPUT.hbresults';

export async function packSimulationResults(sourcePath,mappingPath,outputPath,{signal,onProgress}={}){
  const target=resolve(outputPath);
  try{
    await access(target,constants.F_OK);
    throw new Error('The output already exists. Choose a new results filename.');
  }catch(error){if(error.code!=='ENOENT')throw error;}

  const [source,mappingFile]=await Promise.all([openAsBlob(sourcePath),openAsBlob(mappingPath)]);
  if(!mappingFile.size||mappingFile.size>8*1024**2)throw new Error('Choose a reviewed CSV mapping JSON up to 8 MiB.');
  let mapping;
  try{mapping=JSON.parse(await mappingFile.text());}
  catch{throw new Error('The CSV mapping JSON is malformed.');}
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw new Error('Choose a reviewed CSV mapping object.');
  const folder=await mkdtemp(join(dirname(target),'.hydra-results-'));
  const body=join(folder,'validated-body.bin'),complete=join(folder,'validated-package.hbresults');
  try{
    const spool=await open(body,'wx',0o600);
    let header;
    try{
      header=await streamPackageFromCsv(source,mapping,async block=>spool.writeFile(new Uint8Array(await block.arrayBuffer())),{signal,onProgress});
    }finally{await spool.close();}
    const parts=async function*(){yield new Uint8Array(await header.arrayBuffer());yield* createReadStream(body);};
    await pipeline(Readable.from(parts()),createWriteStream(complete,{flags:'wx',mode:0o600}),{signal});
    await rm(body);
    signal?.throwIfAborted();
    try{await link(complete,target);}
    catch(error){
      if(error.code==='EEXIST')throw new Error('The output already exists. Choose a new results filename.');
      if(!['ENOTSUP','EOPNOTSUPP','EPERM','EXDEV'].includes(error.code))throw error;
      await copyFile(complete,target,constants.COPYFILE_EXCL);
    }
  }finally{await rm(folder,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===1&&['--help','-h'].includes(args[0]))console.log(usage);
  else if(args.length!==3){console.error(usage);process.exitCode=2;}
  else{
    const controller=new AbortController(),cancel=()=>controller.abort();
    process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
    let previous=-10;
    try{
      await packSimulationResults(...args,{signal:controller.signal,onProgress:(loaded,total)=>{
        const percent=10*Math.floor(10*loaded/total);
        if(percent>previous){process.stderr.write(`Read ${percent}% of the local CSV.\n`);previous=percent;}
      }});
      console.log('Portable results package written.');
    }catch(error){
      console.error(error.name==='AbortError'?'Conversion cancelled.':error.message);
      process.exitCode=1;
    }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
  }
}
