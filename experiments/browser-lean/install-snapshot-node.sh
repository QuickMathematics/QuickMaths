#!/usr/bin/env bash
set -euo pipefail
cd "${1:-/home/devcontainers/quickmaths-browser-build}"
archive=node-v24.21.0-linux-x64.tar.xz
curl --fail --location --silent --show-error "https://nodejs.org/dist/v24.21.0/$archive" -o "$archive"
printf '%s  %s\n' fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 "$archive" | sha256sum -c -
tar -xJf "$archive"
./node-v24.21.0-linux-x64/bin/node --version
