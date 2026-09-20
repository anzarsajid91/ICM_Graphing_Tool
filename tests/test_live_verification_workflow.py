from pathlib import Path


WORKFLOW = Path('.github/workflows/live-pages-verification.yml')


def test_scheduled_live_verification_targets_deployed_build_not_main_head():
    text = WORKFLOW.read_text(encoding='utf-8')
    assert 'WORKFLOW_TARGET_SHA:' in text
    assert "github.event.workflow_run.head_sha || ''" in text
    assert '- name: Resolve deployed revision' in text
    assert 'build.json?resolve=${GITHUB_RUN_ID}' in text
    assert 'TARGET_SHA=$target' in text
    assert "TARGET_SHA: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}" not in text


def test_post_deployment_verification_still_uses_workflow_run_head():
    text = WORKFLOW.read_text(encoding='utf-8')
    assert "github.event.workflow_run.conclusion == 'success'" in text
    assert "github.event.workflow_run.head_branch == 'main'" in text
    assert "github.event.workflow_run.event == 'push'" in text
    assert 'ref: ${{ env.TARGET_SHA }}' in text
