#!/usr/bin/env bash
# Isolated experiment: preserve the measured JS-EH build and all native pins.
set -euo pipefail
build_root=${1:-/home/devcontainers/quickmaths-browser-build}
mode=${2:-eh}
case "$mode" in
  eh) settings='-fwasm-exceptions -pthread' ;;
  eh-tail) settings='-fwasm-exceptions -mtail-call -pthread' ;;
  *) echo 'Expected eh or eh-tail' >&2; exit 2 ;;
esac
script_dir=$(cd "$(dirname "$0")" && pwd)
cd "$build_root"
export PATH="$build_root/cmake-3.31.6-linux-x86_64/bin:$PATH"
source emsdk/emsdk_env.sh >/dev/null 2>&1
export PKG_CONFIG_LIBDIR=/usr/lib/i386-linux-gnu/pkgconfig
source_dir="$build_root/lean-upstream-$mode"
output_dir="$build_root/build-matched32-$mode"
test "$(git -C lean-upstream rev-parse HEAD)" = 6a10ac8c22beadecabdbb0919c2b50214762f91d
if [ ! -d "$source_dir" ]; then
  git -C lean-upstream worktree add --detach "$source_dir" 6a10ac8c22beadecabdbb0919c2b50214762f91d
fi
if git -C "$source_dir" diff --quiet HEAD; then
  git -C "$source_dir" apply "$script_dir/lean-6a10-curated-full.patch"
  python3 - "$source_dir" "$settings" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1])/'src/CMakeLists.txt'
s=p.read_text()
old='set(EMSCRIPTEN_SETTINGS "-sDISABLE_EXCEPTION_CATCHING=0 -pthread")'
assert s.count(old)==1
p.write_text(s.replace(old,'set(EMSCRIPTEN_SETTINGS "'+sys.argv[2]+'")'))
PY
  cp lean-upstream/src/emscripten-exports.txt "$source_dir/src/emscripten-exports.txt"
fi
test "$(git -C "$source_dir" rev-parse HEAD)" = 6a10ac8c22beadecabdbb0919c2b50214762f91d
grep -qF "set(EMSCRIPTEN_SETTINGS \"$settings\")" "$source_dir/src/CMakeLists.txt"
cmake -S "$source_dir/src" -B "$output_dir" -G 'Unix Makefiles' \
  -DSTAGE=1 -DPREV_STAGE="$build_root/build-matched32/stage0" \
  -DPREV_STAGE_CMAKE_EXECUTABLE_SUFFIX= -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER_WORKS=1 -DUSE_GMP=OFF -DMMAP=OFF -DUSE_MIMALLOC=OFF \
  -DCMAKE_AR="$build_root/emsdk/upstream/emscripten/emar" \
  -DCMAKE_TOOLCHAIN_FILE="$build_root/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DLEAN_INSTALL_SUFFIX=-linux_wasm32 '-DLEAN_EXTRA_LINKER_FLAGS=-sDECLARE_ASM_MODULE_EXPORTS=0 --emit-symbol-map'
cmake --build "$output_dir" --target leanmain leanshell leancpp leanrt make_stdlib -j8
python3 "$script_dir/exports.py" "$output_dir" "$source_dir/src/emscripten-exports.txt" \
  --llvm-nm "$build_root/emsdk/upstream/bin/llvm-nm" --metadata "$build_root/exports-native-$mode.json"
cmake --build "$output_dir" -j8
