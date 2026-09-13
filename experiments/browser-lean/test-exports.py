"""Focused export-list regression: C visibility and actual WASM symbol names."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('exports',Path(__file__).with_name('exports.py'))
exports=importlib.util.module_from_spec(spec);spec.loader.exec_module(exports)

class Exports(unittest.TestCase):
    def test_posix_and_visibility(self):
        self.assertEqual(exports.nm_record('lean_mk_string T 0 10'),('_lean_mk_string','T'))
        self.assertEqual(exports.nm_record('__main_argc_argv T 1 d'),('_main','T'))
        self.assertEqual(exports.nm_record('l_Thing___closed__0 D 0 4'),('_l_Thing___closed__0','D'))
        self.assertIsNone(exports.nm_record('l_local d 0 4'))
        self.assertIsNone(exports.nm_record('missing U 0 0'))
        self.assertIsNone(exports.nm_record('archive(member.o):'))
    def test_interpreter_contract(self):
        for name,t in [('_lean_mk_string','T'),('_initialize_Lean','T'),('_runtime_initialize_Lean_Message','T'),('_meta_initialize_Lean_Message','T'),('_l_Thing___boxed','T'),('_l_Thing','D')]:
            self.assertTrue(exports.keep(name,t),(name,t))
        self.assertFalse(exports.keep('_l_Thing','T'))
        self.assertFalse(exports.keep('_arbitrary','T'))

if __name__=='__main__':unittest.main()
