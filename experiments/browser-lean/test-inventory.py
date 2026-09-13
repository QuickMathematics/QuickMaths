"""Header parsing must not omit public/meta imports or count commented examples."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('corpus-closure.py'))
inventory=importlib.util.module_from_spec(spec);spec.loader.exec_module(inventory)

class Headers(unittest.TestCase):
    def test_module_header(self):
        source='''/- outer /- import Wrong.Nested -/ comment -/
module
prelude
public meta import Mathlib.Actual
import all Init.Data.List -- import Wrong.Comment
public section
def exampleText := "import Wrong.Body"
'''
        self.assertEqual(inventory.header_imports(source),['Mathlib.Actual','Init.Data.List'])
    def test_multiline_comment_and_duplicates(self):
        self.assertEqual(inventory.header_imports('import Init\n/-\nimport Wrong\n-/\nimport Init\nimport Std\nnamespace N\n'),['Init','Std'])

if __name__=='__main__':unittest.main()
