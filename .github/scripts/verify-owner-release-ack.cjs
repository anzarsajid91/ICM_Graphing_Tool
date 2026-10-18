// Read-only CI checks a fresh authenticated owner record; it never creates one.
const PREFIX = 'HYDRA_RELEASE_ACK_V1\n';
const MAX_AGE = 6 * 60 * 60 * 1000;
const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys.slice().sort().join(',');

module.exports = async ({github, owner, repo, pr, sha, rulesets, core}) => {
  const {data:repository} = await github.rest.repos.get({owner, repo});
  if(repository.owner?.type !== 'User' || !Number.isSafeInteger(repository.owner.id))
    throw new Error('Single-maintainer release requires a verifiable owner account');
  const comments = await github.paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {owner, repo, issue_number:pr.number, per_page:100});
  for(const comment of comments.slice().reverse()) {
    if(comment.user?.id !== repository.owner.id || comment.user?.login !== repository.owner.login ||
       comment.user?.type !== 'User' || !comment.body?.startsWith(PREFIX)) continue;
    const {node} = await github.graphql(`query($id:ID!){node(id:$id){... on IssueComment{
      id body createdAt updatedAt lastEditedAt isMinimized editor{login}
      repository{nameWithOwner} author{__typename login ... on User{databaseId}}
    }}}`, {id:comment.node_id});
    // Explicit edit metadata rejects even same-second edits; REST dates alone cannot.
    if(!node || node.id !== comment.node_id || node.body !== comment.body ||
       node.lastEditedAt !== null || node.editor !== null || node.isMinimized !== false ||
       node.updatedAt !== node.createdAt || node.author?.__typename !== 'User' ||
       node.author.databaseId !== repository.owner.id || node.author.login !== repository.owner.login ||
       node.repository?.nameWithOwner !== repository.full_name) continue;
    const created = Date.parse(node.createdAt), merged = Date.parse(pr.merged_at), now = Date.now();
    if(!Number.isFinite(created) || !Number.isFinite(merged) || created < merged || created > now || now-created > MAX_AGE) continue;
    let ack;
    try { ack = JSON.parse(node.body.slice(PREFIX.length)); } catch { continue; }
    if(!keysAre(ack, ['schema','repository','pull_request','release_sha','pr_head_sha','review_policy','rulesets']) ||
       ack.schema !== 1 || ack.repository !== repository.full_name || ack.pull_request !== pr.number ||
       ack.release_sha !== sha || ack.pr_head_sha !== pr.head.sha || ack.review_policy !== 'single-maintainer' ||
       !Array.isArray(ack.rulesets) || ack.rulesets.length !== rulesets.length) continue;
    const seen = new Set();
    const valid = ack.rulesets.every(evidence => {
      if(!keysAre(evidence, ['id','source_type','source','updated_at','bypass_actors']) ||
         !Number.isSafeInteger(evidence.id) || seen.has(evidence.id) ||
         !Array.isArray(evidence.bypass_actors) || evidence.bypass_actors.length) return false;
      seen.add(evidence.id);
      const actual = rulesets.find(rule => rule.id === evidence.id);
      return actual && ['source_type','source','updated_at'].every(key => evidence[key] === actual[key]) &&
        Number.isFinite(Date.parse(actual.updated_at)) && Date.parse(actual.updated_at) <= created;
    });
    if(valid) {
      core.notice('Owner administrative release record #'+comment.id+' verified for '+sha+
        '; bypass inventory is owner-verified where GitHub redacts it from CI; no independent human review');
      return;
    }
  }
  throw new Error('Fresh unedited owner release record unavailable for this merge SHA and current rulesets; verify administration settings and post HYDRA_RELEASE_ACK_V1 on the merged PR');
};
