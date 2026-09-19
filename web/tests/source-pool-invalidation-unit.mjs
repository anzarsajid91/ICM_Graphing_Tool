import fs from 'node:fs/promises';
import vm from 'node:vm';

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe(target, options) { this.target = target; this.options = options; }
  fire(records = [{type:'childList'}]) { this.callback(records, this); }
}

const state = { files: new Map([['a', {id:'a', status:'ready', file:{name:'FM01.fdv'}}]]) };
const context = vm.createContext({
  window: {},
  state,
  MutationObserver: FakeMutationObserver,
});
const source = await fs.readFile(new URL('../assets/source-pool-invalidation-guard.js', import.meta.url), 'utf8');
vm.runInContext(source, context, {filename:'source-pool-invalidation-guard.js'});
context.MutationObserver = context.window.MutationObserver;

let invalidations = 0;
const observer = new context.MutationObserver(() => { invalidations += 1; });
observer.observe({id:'poolBody'}, {childList:true, subtree:true});

observer.fire();
if (invalidations !== 0) throw new Error('DOM-only source-pool mutation must not invalidate survey results');

state.files.set('b', {id:'b', status:'ready', file:{name:'FM02.fdv'}});
observer.fire();
if (invalidations !== 1) throw new Error('Actual source-pool change must invalidate survey results exactly once');

observer.fire();
if (invalidations !== 1) throw new Error('Repeated DOM-only mutation after a source change must be ignored');

console.log('Source-pool invalidation regression passed.');
