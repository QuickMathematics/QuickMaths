#!/usr/bin/env bash
# Run inside the F:-backed Ubuntu installation. Never changes production pins.
set -euo pipefail
build_root=${1:-/home/devcontainers/quickmaths-browser-build}
target=${2:-stage0}
script_dir=$(cd "$(dirname "$0")" && pwd)
cd "$build_root"
export PATH="$build_root/cmake-3.31.6-linux-x86_64/bin:$PATH"
test "$(git -C lean-upstream rev-parse HEAD)" = 6a10ac8c22beadecabdbb0919c2b50214762f91d
source emsdk/emsdk_env.sh >/dev/null 2>&1
export PKG_CONFIG_LIBDIR=/usr/lib/i386-linux-gnu/pkgconfig
cmake -S lean-upstream -B build-matched32 -G 'Unix Makefiles' \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER_WORKS=1 \
  -DSTAGE0_USE_GMP=OFF -DUSE_GMP=OFF -DUSE_MIMALLOC=OFF \
  -DSTAGE0_LEAN_EXTRA_CXX_FLAGS='-m32 -msse2 -mfpmath=sse' \
  -DSTAGE0_LEANC_OPTS='-m32 -msse2 -mfpmath=sse' \
  -DSTAGE0_LEAN_EXTRA_LINKER_FLAGS=-m32 \
  -DSTAGE0_CMAKE_C_FLAGS=-m32 -DSTAGE0_CMAKE_CXX_FLAGS=-m32 \
  -DSTAGE0_CMAKE_CXX_COMPILER="$build_root/emsdk/upstream/bin/clang++" \
  -DSTAGE0_CMAKE_C_COMPILER="$build_root/emsdk/upstream/bin/clang" \
  -DSTAGE0_CMAKE_EXECUTABLE_SUFFIX= -DMMAP=OFF -DSTAGE0_MMAP=OFF \
  -DCMAKE_AR="$build_root/emsdk/upstream/emscripten/emar" \
  -DCMAKE_TOOLCHAIN_FILE="$build_root/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DLEAN_INSTALL_SUFFIX=-linux_wasm32 \
  -DLEAN_EXTRA_LINKER_FLAGS=-sDECLARE_ASM_MODULE_EXPORTS=0 \
  -DSTAGE0_CMAKE_LIBRARY_PATH=/usr/lib/i386-linux-gnu/
if [ "$target" = stage1 ]; then
  cmake --build build-matched32 --target stage1-configure -j8
  cmake --build build-matched32/stage1 --target leanmain leanshell leancpp leanrt make_stdlib -j8
  python3 "$script_dir/exports.py" build-matched32/stage1 lean-upstream/src/emscripten-exports.txt \
    --llvm-nm "$build_root/emsdk/upstream/bin/llvm-nm" \
    --metadata "$build_root/exports-matched.json"
fi
cmake --build build-matched32 --target "$target" -j8
