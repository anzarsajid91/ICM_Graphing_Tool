# Live deployment improvement loop

Pre-deployment tests and the existing live verifier use synthetic engineering inputs. Live verification waits for the expected source revision in build.json and retains non-sensitive evidence. Failure creates a visible live-regression signal for investigation.

Every repair, including AI-generated CSS, ingestion or deployment changes, must use a pull request, pass all mandatory checks and receive independent review. There is no unreviewed automatic merge or direct push to production. Networking, runtime dependencies, storage, imports, engineering methods, security controls and release configuration require relevant authorised review.

A failed live test must trigger investigation and, if necessary, a controlled rollback; never a relaxed test or network exception. Follow [security governance](security-governance.md). The issue text does not confer merge authority. The scope and success of the actual live run must be checked before closing the incident. A green run is evidence for exercised flows, not universal assurance.
