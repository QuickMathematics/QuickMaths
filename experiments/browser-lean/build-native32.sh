#!/usr/bin/env bash
# Matching i386 compiler produces pointer-width-compatible Mathlib artifacts.
set -euo pipefail
build_root=${1:-/home/devcontainers/quickmaths-browser-build}
cd "$build_root"
export PATH="$build_root/cmake-3.31.6-linux-x86_64/bin:$PATH"
export PKG_CONFIG_LIBDIR=/usr/lib/i386-linux-gnu/pkgconfig
test "$(git -C lean-upstream rev-parse HEAD)" = 6a10ac8c22beadecabdbb0919c2b50214762f91d
cmake -S lean-upstream/src -B build-native32 -G 'Unix Makefiles' \
  -DSTAGE=1 -DPREV_STAGE="$build_root/build-matched32/stage0" \
  -DCMAKE_BUILD_TYPE=Release -DUSE_GMP=OFF -DMMAP=OFF -DUSE_MIMALLOC=OFF \
  -DCMAKE_C_FLAGS=-m32 -DCMAKE_CXX_FLAGS=-m32 \
  -DCMAKE_C_COMPILER="$build_root/emsdk/upstream/bin/clang" \
  -DCMAKE_CXX_COMPILER="$build_root/emsdk/upstream/bin/clang++" \
  -DLEAN_EXTRA_CXX_FLAGS='-m32 -msse2 -mfpmath=sse' \
  -DLEANC_OPTS='-m32 -msse2 -mfpmath=sse' \
  -DLEANC_EXTRA_CC_FLAGS='-m32 -msse2 -mfpmath=sse' \
  -DLEAN_EXTRA_LINKER_FLAGS=-m32 -DCMAKE_LIBRARY_PATH=/usr/lib/i386-linux-gnu/
cmake --build build-native32 -j4
