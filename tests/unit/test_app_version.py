from scripts.app_version import format_version, release_version


def test_integer_release_number_has_three_decimal_places():
    assert format_version(0) == 'v1.000'
    assert format_version(1) == 'v1.001'
    assert format_version(59) == 'v1.059'
    assert format_version(1000) == 'v2.000'


def test_release_and_preview_have_distinct_labels(monkeypatch):
    monkeypatch.setenv('GITHUB_EVENT_NAME','push')
    release=release_version()
    monkeypatch.setenv('GITHUB_EVENT_NAME','pull_request')
    preview=release_version()
    assert preview['release_iteration']==release['release_iteration']+1
    assert preview['app_version'].endswith('-preview')


def test_only_unique_pr_merge_or_squash_subjects_advance_version(monkeypatch):
    import json
    import scripts.app_version as module
    baseline=json.loads((module.ROOT/'release-history.json').read_text())
    def fake_git(*args):
        return '\n'.join(['direct fix commit','Merge PR #999: example','Merge pull request #999 from branch','Squashed change (#998)']) if args[0]=='log' else ''
    monkeypatch.setattr(module,'git',fake_git)
    monkeypatch.setenv('GITHUB_EVENT_NAME','push')
    assert module.release_version()['release_iteration']==len(baseline['merged_prs'])+2
