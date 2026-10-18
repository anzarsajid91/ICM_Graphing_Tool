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
  if(byType('pull_request').parameters.required_review_thread_resolution!==true)
    throw new Error('Pull request conversation resolution is not enforced');
  const codeql=byType('code_scanning')?.parameters?.code_scanning_tools?.find(tool=>tool.tool==='CodeQL');
  if(codeql?.security_alerts_threshold!=='high_or_higher' || codeql?.alerts_threshold!=='errors')
    throw new Error('Required CodeQL high/error alert protection is not enforced');
  if(!checks.strict_required_status_checks_policy)throw new Error('Require branch up to date before merge');
  const contexts=new Set(checks.required_status_checks.filter(x=>x.integration_id===15368).map(x=>x.context));
  for(const name of ['confidentiality','security','secrets','dependency-review','verify','browser-smoke','browser-firefox-shell','browser-interactions','baseline-performance','analyze (javascript-typescript)','analyze (python)','test (ubuntu-latest, 3.12)','test (windows-latest, 3.12)','security-release / security'])
    if(!contexts.has(name))throw new Error('Required status missing: '+name);
  const sets=await github.paginate('GET /repos/{owner}/{repo}/rulesets',{owner,repo,includes_parents:true,per_page:100});
  if(!sets.length)throw new Error('Ruleset evidence unavailable');
  const active=[];
  for(const item of sets){
    const {data:full}=await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}',{owner,repo,ruleset_id:item.id});
    if(full.enforcement!=='active')continue;
    if(!Number.isSafeInteger(full.id) || active.some(rule=>rule.id===full.id) ||
       !full.source_type || !full.source || !Number.isFinite(Date.parse(full.updated_at)))
      throw new Error('Active ruleset identity/version evidence unavailable');
    if(Object.hasOwn(full,'bypass_actors') && (!Array.isArray(full.bypass_actors) || full.bypass_actors.length))
      throw new Error('Active ruleset bypass inventory is malformed or nonempty');
    // A missing field is redacted/unknown, never an empty list. Every release
    // additionally requires authenticated owner evidence for all active rulesets.
    active.push(full);
  }
  if(!active.length)throw new Error('No active ruleset evidence');
  const {data:prs}=await github.rest.repos.listPullRequestsAssociatedWithCommit({owner,repo,commit_sha:context.sha});
  const merged=prs.find(p=>p.merged_at && p.base.ref==='main' && p.merge_commit_sha===context.sha);
  if(!merged)throw new Error('Production revision is not a PR merge commit');
  const {data:pr}=await github.rest.pulls.get({owner,repo,pull_number:merged.number});
  // User-authorised single-maintainer policy: no fabricated second-person approval.
  // Merge is the maintainer's release decision; all required checks still apply.
  if(pr.merged_by?.login!==owner || pr.head.sha!==merged.head.sha)
    throw new Error('Release must be merged by the repository owner at the validated PR head');
  await require('./verify-owner-release-ack.cjs')({github,owner,repo,pr,sha:context.sha,rulesets:active,core});
  core.notice('Effective production rules and authenticated owner release record verified for PR #'+merged.number+' at '+context.sha+'; no independent human review');
};
