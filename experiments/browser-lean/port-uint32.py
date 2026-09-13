"""Decode boxed UInt32 IO/EIO exits correctly on 32-bit hosts and WASM.

UInt32 fits a tagged scalar on 64-bit Lean, but needs lean_unbox_uint32 on
32-bit Lean. This changes CLI status decoding, not theorem checking.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
for prefix in ['src','stage0/src']:
    edits={
        'util/io.h':[
            ('template<typename T> T get_io_scalar_result(object * o)',
             'inline uint32 get_io_uint32_result(object * o)'),
            ('T r = unbox(io_result_get_value(o));',
             'uint32 r = lean_unbox_uint32(io_result_get_value(o));'),
        ],
        'util/shell.cpp':[
            ('get_io_scalar_result<uint32>', 'get_io_uint32_result'),
            ('rc = unbox(io_result_get_error(r));',
             'rc = lean_unbox_uint32(io_result_get_error(r));'),
        ],
    }
    for relative,replacements in edits.items():
        path=root/prefix/relative;text=path.read_text();original=text
        for before,after in replacements:
            if before in text:
                if text.count(before)!=1:raise ValueError('Ambiguous UInt32 conversion: '+str(path))
                text=text.replace(before,after)
            elif after not in text:raise ValueError('Missing UInt32 conversion: '+str(path))
        if text!=original:path.write_text(text)
path=root/'src/util/shell.cpp';text=path.read_text()
text=text.replace('obj_res lean_shell_main(obj_arg args, obj_arg shell_opts, obj_arg world);',
                  'obj_res lean_shell_main(obj_arg args, obj_arg shell_opts);')
text=text.replace('lean_shell_main(args_obj, opts_obj, lean_box(0))',
                  'lean_shell_main(args_obj, opts_obj)')
path.write_text(text)
print('Preserved 32-bit UInt32 values when returning native CLI status')
