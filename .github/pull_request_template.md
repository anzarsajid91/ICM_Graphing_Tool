## Change and validation

Describe the user-visible change and the checks actually run.

## Mandatory confidentiality review

- [ ] I read `SECURITY.md` and `AGENTS.md` and this change preserves local processing.
- [ ] No imported data, identifying metadata, calculation input/output or sensitive
      diagnostics can be sent over the network, including in resource requests.
- [ ] I reviewed changed network-capable sources; any approval update has a specific
      rationale and is not blind rebaselining or an upload exception.
- [ ] Confidentiality checks passed; release browser request assertions remain enabled.
- [ ] Fixtures and shared evidence contain synthetic data only.

Do not merge or release with an unresolved confidentiality failure.

## Security impact and release evidence

- Change class and reason (labels never suppress mandatory checks):
- Network/storage/dependency/file-processing impact:
- Engineering methodology/output changes (separate approval if any):
- Claim IDs/evidence affected; independent reviewer:
- Exact tests actually run, failures and limitations:
- Synthetic browser request evidence and IT Security screenshots:
- Dependency/licence/advisory disposition and SBOM links:
- Effective server-side rules verified (otherwise Not Enforced):
- Approved final head, release/rollback plan and actual live SHA after deployment:

No confidential data in this PR or its evidence. No automatic repair grants merge authority.
