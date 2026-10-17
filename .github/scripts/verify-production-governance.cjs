// Trusted deployment prerequisite. Never treats a missing setting/API response as success.
module.exports = async ({github, context, core}) => {
  const {owner, repo} = context.repo;
  const {data:branch} = await github.rest.repos.getBranch({owner,repo,branch:'main'});
  if (!branch.protected) throw new Error('Production branch is not protected');
  const {data:rules} = await github.request('GET /repos/{owner}/{repo}/rules/branches/main',{owner,repo});
  const byType = type => rules.find(rule=>rule.type===type);
  for (const type of ['deletion','non_fast_forward','pull_request','required_status_checks'])
    if(!byType(type)) throw new Error('Missing effective production rule: '+type);
  const prRule=byType('pull_request').parameters;
  if(prRule.required_approving_review_count<1 || !prRule.dismiss_stale_reviews_on_push ||
     !prRule.require_code_owner_review || !prRule.require_last_push_approval)
    throw new Error('Independent, current code-owner review is not enforced');
  const checks=byType('required_status_checks').parameters;
  if(!checks.strict_required_status_checks_policy)throw new Error('Require branch up to date before merge');
  const contexts=new Set(checks.required_status_checks.map(x=>x.context));
  for(const name of ['confidentiality','security','secrets','review','verify','browser-smoke','browser-firefox-shell','browser-interactions','baseline-performance','analyze (javascript-typescript)','analyze (python)'])
    if(!contexts.has(name))throw new Error('Required status missing: '+name);
  const {data:sets}=await github.request('GET /repos/{owner}/{repo}/rulesets',{owner,repo,includes_parents:true});
  if(!sets.length)throw new Error('Ruleset evidence unavailable');
  for(const item of sets){
    const {data:full}=await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}',{owner,repo,ruleset_id:item.id});
    if(full.enforcement==='active' && (full.bypass_actors||[]).length)
      throw new Error('Active ruleset contains a bypass actor; independent governance review required');
  }
  const {data:prs}=await github.rest.repos.listPullRequestsAssociatedWithCommit({owner,repo,commit_sha:context.sha});
  const merged=prs.find(p=>p.merged_at && p.base.ref==='main' && p.merge_commit_sha===context.sha);
  if(!merged)throw new Error('Production revision is not the reviewed PR merge commit');
  const reviews=await github.paginate(github.rest.pulls.listReviews,{owner,repo,pull_number:merged.number});
  const latest=new Map();for(const review of reviews)latest.set(review.user.login,review);
  if(![...latest.values()].some(r=>r.state==='APPROVED'&&r.user.login!==merged.user.login&&r.commit_id===merged.head.sha))
    throw new Error('No independent approval for the final PR head');
  core.notice('Production governance verified for PR #'+merged.number+' at '+context.sha);
};
