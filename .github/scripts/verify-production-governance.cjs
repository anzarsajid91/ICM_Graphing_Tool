// Fail closed on missing effective settings or an untraceable production revision.
module.exports = async ({github, context, core}) => {
  const {owner, repo} = context.repo;
  const {data:branch} = await github.rest.repos.getBranch({owner,repo,branch:'main'});
  if (!branch.protected) throw new Error('Production branch is not protected');
  const {data:rules} = await github.request('GET /repos/{owner}/{repo}/rules/branches/main',{owner,repo});
  const byType = type => rules.find(rule=>rule.type===type);
  for (const type of ['deletion','non_fast_forward','pull_request','required_status_checks'])
    if(!byType(type)) throw new Error('Missing effective production rule: '+type);
  const checks=byType('required_status_checks').parameters;
  if(!checks.strict_required_status_checks_policy)throw new Error('Require branch up to date before merge');
  const contexts=new Set(checks.required_status_checks.filter(x=>x.integration_id===15368).map(x=>x.context));
  for(const name of ['confidentiality','security','secrets','dependency-review','verify','browser-smoke','browser-firefox-shell','browser-interactions','baseline-performance','analyze (javascript-typescript)','analyze (python)','test (ubuntu-latest, 3.12)','test (windows-latest, 3.12)','security-release / security'])
    if(!contexts.has(name))throw new Error('Required status missing: '+name);
  const {data:sets}=await github.request('GET /repos/{owner}/{repo}/rulesets',{owner,repo,includes_parents:true});
  if(!sets.length)throw new Error('Ruleset evidence unavailable');
  for(const item of sets){
    const {data:full}=await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}',{owner,repo,ruleset_id:item.id});
    if(full.enforcement==='active' && (full.bypass_actors||[]).length)
      throw new Error('Active ruleset contains a bypass actor');
  }
  const {data:prs}=await github.rest.repos.listPullRequestsAssociatedWithCommit({owner,repo,commit_sha:context.sha});
  const merged=prs.find(p=>p.merged_at && p.base.ref==='main' && p.merge_commit_sha===context.sha);
  if(!merged)throw new Error('Production revision is not a PR merge commit');
  const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:merged.number});
  // User-authorised single-maintainer policy: no fabricated second-person approval.
  // Merge is the maintainer's release decision; all required checks still apply.
  if(pr.merged_by?.login!==owner || pr.head.sha!==merged.head.sha)
    throw new Error('Release must be merged by the repository owner at the validated PR head');
  core.notice('Single-maintainer production governance verified for PR #'+merged.number+' at '+context.sha+'; no independent human review');
};
