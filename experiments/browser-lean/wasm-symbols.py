"""List exported names for function indices in exact raw/gzipped WASM bytes."""
import argparse
import gzip
import hashlib
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('wasm',type=Path)
parser.add_argument('indices',type=int,nargs='+')
args=parser.parse_args()
raw=args.wasm.read_bytes()
if raw[:2]==b'\x1f\x8b':raw=gzip.decompress(raw)
if raw[:8]!=b'\0asm\1\0\0\0':raise ValueError('Not a WASM module')
print('wasmSha256',hashlib.sha256(raw).hexdigest())
i=8
def leb():
    global i
    value=shift=0
    while True:
        byte=raw[i];i+=1;value|=(byte&127)<<shift;shift+=7
        if byte<128:return value
def string():
    global i
    size=leb();value=raw[i:i+size].decode();i+=size;return value
while i<len(raw):
    section=raw[i];i+=1;size=leb();end=i+size
    if section==7:
        for _ in range(leb()):
            name=string();kind=raw[i];i+=1;index=leb()
            if kind==0 and index in args.indices:print(index,name)
    i=end
