"""Apply the reference's two width fixes to the newer, vendor-marked stage0.

No parser/typechecker bypass: preserve full 64-bit Name hashes in 32-bit pointer
slots, and use an addressable thread stack. Changes match the pinned fork.
"""
from pathlib import Path
import sys

source=Path(sys.argv[1]).resolve()
# The vendored GetGitRevisionDescription reads the common checkout's HEAD for
# linked worktrees. Ask Git for this worktree's actual base revision instead.
cmake=source/'src/CMakeLists.txt'
text=cmake.read_text()
before='  get_git_head_revision(GIT_REFSPEC GIT_SHA1 ALLOW_LOOKING_ABOVE_CMAKE_SOURCE_DIR)'
after='  execute_process(COMMAND git rev-parse HEAD WORKING_DIRECTORY "${LEAN_SOURCE_DIR}" OUTPUT_VARIABLE GIT_SHA1 OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)'
if before in text:
    if text.count(before)!=1:raise ValueError('Unexpected Git metadata configuration')
    cmake.write_text(text.replace(before,after))
elif after not in text:
    raise ValueError('Missing Git metadata configuration')
changed=False
for name,before in [
    ('stage0/src/include/lean/lean.h','#ifdef LEAN_EMSCRIPTEN\n#define LEAN_SCALAR_PTR_LITERAL'),
    ('stage0/src/runtime/thread.cpp','#ifndef LEAN_DEFAULT_THREAD_STACK_SIZE\n#ifdef LEAN_EMSCRIPTEN'),
]:
    path=source/name;text=path.read_text()
    after=before.replace('#ifdef LEAN_EMSCRIPTEN','#if defined(LEAN_EMSCRIPTEN) || UINTPTR_MAX == UINT32_MAX')
    if after in text:continue
    if text.count(before)!=1:raise ValueError('Unexpected bootstrap source: '+name)
    path.write_text(text.replace(before,after))
    changed=True
    print('Applied 32-bit width fix:',name)
if changed or '--invalidate-stdlib' in sys.argv:
    # The bootstrap's custom C build does not track this header dependency.
    # Invalidate generated C timestamps; otherwise old truncated literals remain.
    for path in (source/'stage0/stdlib').rglob('*.c'):
        path.resolve().relative_to(source)
        path.touch()
    print('Invalidated generated bootstrap C after the scalar-layout fix')
