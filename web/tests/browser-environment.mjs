// Local managed-network runners need the proxy for CDNs but direct loopback
// for their preview server. Ordinary CI has no proxy and uses normal launch.
export function browserLaunchOptions(){
  const executable=process.env.ICM_BROWSER_EXECUTABLE?{executablePath:process.env.ICM_BROWSER_EXECUTABLE}:{};
  if(!process.env.HTTPS_PROXY)return {...executable,headless:true};
  process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK='1';
  return {...executable,headless:true,proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}};
}

export function browserContextOptions(){return {ignoreHTTPSErrors:Boolean(process.env.HTTPS_PROXY)};}
