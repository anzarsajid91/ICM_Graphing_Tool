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
