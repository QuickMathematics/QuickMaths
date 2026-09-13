import json
import subprocess
from types import SimpleNamespace

import pytest

from quickmaths_formal import verifier


def installed_project(tmp_path):
    (tmp_path / 'lean-toolchain').write_text(verifier.LEAN_TOOLCHAIN)
    (tmp_path / 'lake-manifest.json').write_text(json.dumps({
        'packages': [{'name': 'mathlib', 'rev': verifier.MATHLIB_REV}]
    }))
    return tmp_path


def test_safe_environment_preserves_custom_elan_and_windows_but_not_secrets(monkeypatch):
    monkeypatch.setenv('ELAN_HOME', 'X:/runtime/elan')
    monkeypatch.setenv('SystemRoot', 'C:/Windows')
    monkeypatch.setenv('GITHUB_TOKEN', 'must-not-reach-worker')
    monkeypatch.setenv('LEAN_PATH', 'untrusted-library')
    env = verifier._safe_environment()
    assert env['ELAN_HOME'] == 'X:/runtime/elan'
    assert any(k.upper() == 'SYSTEMROOT' for k in env)
    assert 'GITHUB_TOKEN' not in env and 'LEAN_PATH' not in env


def test_missing_environment_is_unavailable(tmp_path):
    assert verifier._environment_error(tmp_path, ['lake', 'env', 'lean'])


def test_health_checks_the_configured_project(tmp_path, monkeypatch):
    from quickmaths_formal import service
    seen = []
    monkeypatch.setattr(service, '_lake_command', lambda project: ['lake', 'env', 'lean'])
    monkeypatch.setattr(service, '_environment_error', lambda project, command: seen.append(project) or None)
    assert service.runtime_status(tmp_path)['lean_available']
    assert seen == [tmp_path]


@pytest.mark.parametrize('failure', ['toolchain', 'manifest', 'checkout', 'executable', 'timeout', None])
def test_actual_environment_must_match_certificate_pins(tmp_path, monkeypatch, failure):
    project = installed_project(tmp_path)
    if failure == 'toolchain':
        (project / 'lean-toolchain').write_text('leanprover/lean4:v0.0.0')
    if failure == 'manifest':
        (project / 'lake-manifest.json').write_text('{"packages": []}')

    def run(command, **kwargs):
        if failure == 'timeout':
            raise subprocess.TimeoutExpired(command, 10)
        if command[0] == 'git':
            value = 'wrong-revision' if failure == 'checkout' else verifier.MATHLIB_REV
        else:
            version = '0.0.0' if failure == 'executable' else verifier.LEAN_TOOLCHAIN.split(':v')[1]
            value = f'Lean (version {version}, test platform)'
        return SimpleNamespace(returncode=0, stdout=value)

    monkeypatch.setattr(verifier.subprocess, 'run', run)
    error = verifier._environment_error(project, ['lake', 'env', 'lean'])
    assert (error is None) == (failure is None)
