// Local managed-network runners need the proxy for CDNs but direct loopback
// for their preview server. Ordinary CI has no proxy and uses normal launch.
export function browserLaunchOptions(){
  if(!process.env.HTTPS_PROXY)return {headless:true};
  process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK='1';
  return {headless:true,proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}};
}

export function browserContextOptions(){return {ignoreHTTPSErrors:Boolean(process.env.HTTPS_PROXY)};}
