import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const verify=createRequire(import.meta.url)('../../.github/scripts/verify-production-governance.cjs');
const contexts=['confidentiality','security','secrets','dependency-review','verify','browser-smoke','browser-firefox-shell','browser-interactions','baseline-performance','analyze (javascript-typescript)','analyze (python)','test (ubuntu-latest, 3.12)','test (windows-latest, 3.12)','security-release / security'];
const MERGE='a'.repeat(40), HEAD='b'.repeat(40), REPOSITORY='maintainer/synthetic', PREFIX='HYDRA_RELEASE_ACK_V1\n';
const iso=offset=>new Date(Date.now()+offset).toISOString();
function fixture(){
 const state={protected:true,rules:[{type:'deletion'},{type:'non_fast_forward'},{type:'pull_request',parameters:{required_approving_review_count:0,required_review_thread_resolution:true}},{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:contexts.map(context=>({context,integration_id:15368}))}},{type:'code_scanning',parameters:{code_scanning_tools:[{tool:'CodeQL',security_alerts_threshold:'high_or_higher',alerts_threshold:'errors'}]}}],bypass:[],rulesets:[{id:1,enforcement:'active',source_type:'Repository',source:REPOSITORY,updated_at:iso(-900000)}],prs:[{number:81,merged_at:iso(-600000),base:{ref:'main'},merge_commit_sha:MERGE,head:{sha:HEAD}}],merger:'maintainer',head:HEAD,created:iso(-300000),ownerType:'User',nodeOverrides:{},commentOverrides:{},calls:[],notices:[]};
 state.ack={schema:1,repository:REPOSITORY,pull_request:81,release_sha:MERGE,pr_head_sha:HEAD,review_policy:'single-maintainer',rulesets:state.rulesets.map(({id,source_type,source,updated_at})=>({id,source_type,source,updated_at,bypass_actors:[]}))};
 const body=()=>state.rawBody??PREFIX+JSON.stringify(state.ack);
 const comment=()=>({id:100,node_id:'IC_synthetic',user:{id:42,login:'maintainer',type:'User'},body:body(),...state.commentOverrides});
 const github={rest:{repos:{
  getBranch:async()=>({data:{protected:state.protected}}),
  get:async()=>({data:{full_name:REPOSITORY,owner:{id:42,login:'maintainer',type:state.ownerType}}}),
  listPullRequestsAssociatedWithCommit:async()=>({data:state.prs})
 },pulls:{get:async()=>({data:{...state.prs[0],merged_by:{login:state.merger},head:{sha:state.head}}})}},
 request:async(path,args)=>{
  if(path.endsWith('/main'))return {data:state.rules};
  const rule=state.rulesets.find(rule=>rule.id===args.ruleset_id);
  return {data:{...rule,...(state.omitBypass?{}:{bypass_actors:state.bypass})}};
 },
 paginate:async(path,args)=>{
  state.calls.push({path,args});
  if(state.paginationError)throw Error('Synthetic pagination unavailable');
  return path.endsWith('/rulesets')?state.rulesets:state.noReceipt?[]:[comment()];
 },
 graphql:async(query,args)=>{
  assert.ok(query.includes('lastEditedAt')&&query.includes('databaseId'));
  assert.equal(args.id,'IC_synthetic');
  if(state.graphqlError)throw Error('Synthetic edit metadata unavailable');
  return {node:state.noNode?null:{id:'IC_synthetic',body:comment().body,createdAt:state.created,updatedAt:state.created,lastEditedAt:null,editor:null,isMinimized:false,repository:{nameWithOwner:REPOSITORY},author:{__typename:'User',databaseId:42,login:'maintainer'},...state.nodeOverrides}};
 }};
 return {state,run:()=>verify({github,context:{repo:{owner:'maintainer',repo:'synthetic'},sha:MERGE},core:{notice:message=>state.notices.push(message)}})};
}
const baseline=fixture();await baseline.run();
assert.equal(baseline.state.calls.length,2);
assert.ok(baseline.state.calls.every(call=>call.args.per_page===100));
assert.match(baseline.state.notices[0],/owner-verified/);
const hidden=fixture();hidden.state.omitBypass=true;await hidden.run();
const multi=fixture();multi.state.rulesets.push({...multi.state.rulesets[0],id:2});
multi.state.ack.rulesets.push({...multi.state.ack.rulesets[0],id:2});
multi.state.ack.rulesets.reverse();await multi.run();
const cases=[
 ['unprotected',s=>s.protected=false],
 ['missing CodeQL',s=>s.rules.pop()],
 ['not up to date',s=>s.rules[3].parameters.strict_required_status_checks_policy=false],
 ['missing required check',s=>s.rules[3].parameters.required_status_checks.pop()],
 ['untrusted check provider',s=>s.rules[3].parameters.required_status_checks[0].integration_id=0],
 ['visible bypass actor despite receipt',s=>s.bypass.push({actor_id:1})],
 ['no merged PR',s=>s.prs=[]],
 ['different merger',s=>s.merger='other'],
 ['moved PR head',s=>s.head='c'.repeat(40)],
 ['unresolved conversations allowed',s=>s.rules[2].parameters.required_review_thread_resolution=false],
 ['weak CodeQL threshold',s=>s.rules[4].parameters.code_scanning_tools[0].security_alerts_threshold='critical'],
 ['weak CodeQL quality',s=>s.rules[4].parameters.code_scanning_tools[0].alerts_threshold='none'],
 ['redacted bypass and missing owner record',s=>{s.omitBypass=true;s.noReceipt=true;}],
 ['missing owner record even with visible empty actors',s=>s.noReceipt=true],
 ['wrong REST owner',s=>s.commentOverrides.user={id:7,login:'maintainer',type:'User'}],
 ['bot author',s=>s.commentOverrides.user={id:42,login:'maintainer',type:'Bot'}],
 ['wrong GraphQL owner',s=>s.nodeOverrides.author={__typename:'User',databaseId:7,login:'maintainer'}],
 ['edited including same-second edit',s=>s.nodeOverrides.lastEditedAt=s.created],
 ['edit metadata absent',s=>s.nodeOverrides.lastEditedAt=undefined],
 ['editor present',s=>s.nodeOverrides.editor={login:'github-actions[bot]'}],
 ['minimized record',s=>s.nodeOverrides.isMinimized=true],
 ['body changed between APIs',s=>s.nodeOverrides.body='changed'],
 ['missing comment node',s=>s.noNode=true],
 ['edit API unavailable',s=>s.graphqlError=true],
 ['wrong repository',s=>s.ack.repository='other/repo'],
 ['wrong PR',s=>s.ack.pull_request=82],
 ['wrong merge SHA',s=>s.ack.release_sha='c'.repeat(40)],
 ['wrong head SHA',s=>s.ack.pr_head_sha='c'.repeat(40)],
 ['wrong review policy',s=>s.ack.review_policy='automatic'],
 ['unexpected override field',s=>s.ack.override=true],
 ['malformed record',s=>s.rawBody=PREFIX+'{invalid'],
 ['stale record',s=>{s.created=iso(-7*3600000);s.prs[0].merged_at=iso(-8*3600000);}],
 ['future record',s=>s.created=iso(3600000)],
 ['record predates merge',s=>s.created=iso(-660000)],
 ['invalid creation time',s=>s.created='invalid'],
 ['ruleset changed after owner read',s=>s.rulesets[0].updated_at=iso(-120000)],
 ['missing ruleset in receipt',s=>s.ack.rulesets=[]],
 ['extra ruleset in receipt',s=>s.ack.rulesets.push({...s.ack.rulesets[0],id:2})],
 ['duplicate receipt ruleset',s=>{s.rulesets.push({...s.rulesets[0],id:2});s.ack.rulesets.push({...s.ack.rulesets[0]});}],
 ['wrong ruleset source',s=>s.ack.rulesets[0].source='other/repo'],
 ['ruleset updated after record',s=>{s.rulesets[0].updated_at=iso(3600000);s.ack.rulesets[0].updated_at=s.rulesets[0].updated_at;}],
 ['nonempty owner evidence',s=>s.ack.rulesets[0].bypass_actors.push({actor_id:1})],
 ['malformed visible bypass list',s=>s.bypass=null],
 ['missing ruleset version',s=>delete s.rulesets[0].updated_at],
 ['duplicate active ruleset',s=>s.rulesets.push({...s.rulesets[0]})],
 ['pagination unavailable',s=>s.paginationError=true],
 ['unverifiable owner type',s=>s.ownerType='Organization'],
 ['invalid merge time',s=>s.prs[0].merged_at='invalid']
];
for(const [name,mutate] of cases){
 const f=fixture();mutate(f.state);await assert.rejects(f.run(),undefined,name);
}
console.log('PASS production governance: existing controls, paginated settings/comments, fresh unedited owner record and '+cases.length+' negative cases; redacted actor data is never treated as empty.');
