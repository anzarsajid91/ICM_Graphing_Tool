// Test-side observer only: never loaded by the application, never sends user data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function resourcePaths(root=process.cwd()){
  const paths=new Set(['','index.html','build.json','python/package-manifest.json']);
  function walk(dir,prefix){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(entry.name==='tests'||entry.name==='__pycache__')continue;
      const relative=prefix+entry.name;
      if(entry.isDirectory())walk(path.join(dir,entry.name),relative+'/');
      else paths.add(relative);
    }
  }
  walk(path.join(root,'web'),'');
  walk(path.join(root,'src/icm_workbench'),'python/icm_workbench/');
  return paths;
}

export function requestViolation({url,method='GET',body=null,headers={},navigation=false},
  {baseUrl,paths,buildToken,navigations=new Set()}){
  const target=new URL(url),base=new URL(baseUrl);
  if(['blob:','data:','about:','file:'].includes(target.protocol))return null;
  if(!['http:','https:'].includes(target.protocol))return 'Unapproved network protocol';
  if(method!=='GET'||body!==null)return 'Request method/body could transmit data';
  if(target.origin!==base.origin)return 'External network destination';
  if(navigation&&navigations.has(target.href))return null;
  if(target.pathname=== '/favicon.ico'&&!target.search)return null;
  if(!target.pathname.startsWith(base.pathname))return 'Outside application resource root';
  const relative=decodeURIComponent(target.pathname.slice(base.pathname.length));
  if(!paths.has(relative))return 'Not a fixed application resource';
  if(target.hash)return 'Unapproved resource fragment';
  const parameters=[...target.searchParams];
  if(parameters.length&&!(parameters.length===1&&parameters[0][0]==='v'&&parameters[0][1]===buildToken))
    return 'Unapproved resource query/data';
  const allowedHeaders=new Set(['accept','accept-encoding','accept-language','cache-control',
    'connection','cookie','dnt','host','if-modified-since','if-none-match','origin',
    'pragma','priority','range','referer','sec-fetch-dest',
    'sec-fetch-mode','sec-fetch-site','sec-fetch-user','upgrade-insecure-requests',
    'user-agent']);
  for(const key of Object.keys(headers)){
    if(!allowedHeaders.has(key.toLowerCase())&&!key.toLowerCase().startsWith('sec-ch-'))
      return 'Unapproved request header';
  }
  const referrer=headers.referer||headers.Referer;
  if(referrer){
    const ref=new URL(referrer);
    const refParams=[...ref.searchParams];
    const fixedResource=ref.origin===base.origin&&ref.pathname.startsWith(base.pathname)
      &&paths.has(decodeURIComponent(ref.pathname.slice(base.pathname.length)))
      &&refParams.length===1&&refParams[0][0]==='v'&&refParams[0][1]===buildToken;
    if(ref.search&&!navigations.has(ref.href)&&!fixedResource)return 'Unapproved referrer query';
  }
  return null;
}

export function installPrivacyGuard(context,baseUrl,{buildToken=process.env.TARGET_SHA||process.env.GITHUB_SHA||'local',paths=resourcePaths()}={}){
  const violations=[],navigations=new Set(),options={baseUrl,paths,buildToken,navigations};
  let checked=0;
  function attach(target){
    target.on('request',request=>{
      checked++;
      const reason=requestViolation({url:request.url(),method:request.method(),body:request.postDataBuffer(),
        headers:request.headers(),navigation:request.isNavigationRequest()},options);
      // Do not print payloads/headers/URLs that could contain protected information.
      if(reason)violations.push(reason);
    });
    const watchPage=page=>page.on('websocket',()=>violations.push('Network socket opened'));
    for(const page of target.pages())watchPage(page);
    target.on('page',watchPage);
  }
  attach(context);
  return {
    attach,
    async navigate(page,url,settings){
      // Only the test harness may explicitly register its synthetic cache-busting URLs.
      // Registration is exact; application-generated requests gain no query exemption.
      navigations.add(new URL(url).href);
      return page.goto(url,settings);
    },
    assertClean(){
      assert.ok(checked>0,'Privacy observer did not observe requests');
      assert.deepEqual(violations,[],'Data-confidentiality network violations');
      console.log(`DATA_CONFIDENTIALITY_NETWORK_PASS: ${checked} requests; zero violations.`);
    },
  };
}
