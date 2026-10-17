import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const verify=createRequire(import.meta.url)('../../.github/scripts/verify-production-governance.cjs');
const contexts=['confidentiality','security','secrets','dependency-review','verify','browser-smoke','browser-firefox-shell','browser-interactions','baseline-performance','analyze (javascript-typescript)','analyze (python)','test (ubuntu-latest, 3.12)','test (windows-latest, 3.12)','security-release / security'];
function fixture(){
 const state={protected:true,rules:[{type:'deletion'},{type:'non_fast_forward'},{type:'pull_request',parameters:{required_approving_review_count:0}},{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:contexts.map(context=>({context,integration_id:15368}))}}],bypass:[],prs:[{number:81,merged_at:'synthetic',base:{ref:'main'},merge_commit_sha:'merge',head:{sha:'head'}}],merger:'maintainer',head:'head'};
 const github={rest:{repos:{getBranch:async()=>({data:{protected:state.protected}}),listPullRequestsAssociatedWithCommit:async()=>({data:state.prs})},pulls:{get:async()=>({data:{merged_by:{login:state.merger},head:{sha:state.head}}})}},request:async(path)=>({data:path.endsWith('/main')?state.rules:path.endsWith('/{ruleset_id}')?{enforcement:'active',bypass_actors:state.bypass}:[{id:1}]})};
 return {state,run:()=>verify({github,context:{repo:{owner:'maintainer',repo:'synthetic'},sha:'merge'},core:{notice:()=>{}}})};
}
await fixture().run();
for(const mutate of [s=>s.protected=false,s=>s.rules.pop(),s=>s.rules[3].parameters.strict_required_status_checks_policy=false,s=>s.rules[3].parameters.required_status_checks.pop(),s=>s.rules[3].parameters.required_status_checks[0].integration_id=0,s=>s.bypass.push({actor_id:1}),s=>s.prs=[],s=>s.merger='other',s=>s.head='moved']){
 const f=fixture();mutate(f.state);await assert.rejects(f.run());
}
console.log('PASS single-maintainer governance: required checks, no bypass, owner merge and exact PR head; nine negative cases');
