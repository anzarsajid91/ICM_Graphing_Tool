from scripts.app_version import format_version, release_version


def test_integer_release_number_has_three_decimal_places():
    assert format_version(0) == 'v1.000'
    assert format_version(1) == 'v1.001'
    assert format_version(59) == 'v1.059'
    assert format_version(1000) == 'v2.000'


def test_release_and_preview_have_distinct_labels(monkeypatch):
    monkeypatch.delenv('GITHUB_REF', raising=False)
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


def test_v2_milestone_and_following_releases(monkeypatch):
    import scripts.app_version as module

    commits = ['Prior change (#107)']
    monkeypatch.setattr(module, 'git', lambda *args: '\n'.join(commits) if args[0] == 'log' else '')
    monkeypatch.setenv('GITHUB_EVENT_NAME', 'pull_request')
    monkeypatch.setenv('GITHUB_REF', 'refs/pull/108/merge')
    assert module.release_version()['app_version'] == 'v2.0.0-rc.1'

    commits.append('HydraBench 2.0 (#108)')
    monkeypatch.setenv('GITHUB_EVENT_NAME', 'push')
    monkeypatch.setenv('GITHUB_REF', 'refs/heads/main')
    assert module.release_version()['app_version'] == 'v2.0.0'
    commits.extend(['Next change (#110)', 'Duplicate marker (#110)'])
    assert module.release_version()['app_version'] == 'v2.0.1'

    monkeypatch.setenv('GITHUB_EVENT_NAME', 'pull_request')
    monkeypatch.setenv('GITHUB_REF', 'refs/pull/111/merge')
    assert module.release_version()['app_version'] == 'v2.1.0-rc.1'

    commits.append('Merge pull request #111 from anzarsajid91/feature/v2.1-network-explorer')
    monkeypatch.setenv('GITHUB_EVENT_NAME', 'push')
    monkeypatch.setenv('GITHUB_REF', 'refs/heads/main')
    assert module.release_version()['app_version'] == 'v2.1.0'
    commits.append('Subsequent patch (#112)')
    assert module.release_version()['app_version'] == 'v2.1.1'
