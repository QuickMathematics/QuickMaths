import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = (ROOT / "optimize-dlsym.py").read_text(encoding="utf-8")
namespace = {}
exec(compile(SOURCE, str(ROOT / "optimize-dlsym.py"), "exec"), namespace)
optimize = namespace["optimize"]

HOOK_SOURCE = (
    "function __dlsym_js(handle,symbol,symbolIndex){handle>>>=0;symbol>>>=0;symbolIndex>>>=0;"
    "symbol=UTF8ToString(symbol);var result;var newSymIndex;var lib=LDSO.loadedLibsByHandle[handle];"
    "newSymIndex=Object.keys(lib.exports).indexOf(symbol);if(newSymIndex==-1||lib.exports[symbol].stub){"
    "dlSetError(`Tried to lookup unknown symbol \"${symbol}\" in dynamic lib: ${lib.name}`);return 0}"
    "result=lib.exports[symbol];if(typeof result==\"function\"){var addr=getFunctionAddress(result);"
    "if(addr){result=addr}else{result=addFunction(result,result.sig);"
    "(growMemViews(),HEAPU32)[symbolIndex>>>2>>>0]=newSymIndex}}return result}"
)

NODE_HARNESS = r"""
const source = JSON.parse(process.argv[1]);
const events = [];
const symbols = new Map([[1, 'native'], [2, 'data'], [3, 'missing'], [4, 'inherited'],
  [5, 'hidden'], [6, 'stub'], [7, 'present'], [8, 'later']]);
function UTF8ToString(pointer) { return symbols.get(pointer); }
function makeFunction(label) { const fn = function () {}; fn.label = label; fn.sig = 'v'; return fn; }
const exports = Object.create({inherited: makeFunction('inherited')});
exports.native = makeFunction('native');
exports.data = {kind: 'data'};
exports.stub = makeFunction('stub');
exports.stub.stub = true;
exports.present = makeFunction('present');
Object.defineProperty(exports, 'hidden', {value: makeFunction('hidden'), enumerable: false});
const lib = {name: 'fixture', exports};
const LDSO = {loadedLibsByHandle: {0: lib}};
const HEAPU32 = new Uint32Array(8);
let keysCalls = 0;
const realKeys = Object.keys;
Object.keys = value => { keysCalls++; return realKeys(value); };
function dlSetError(message) { events.push(['error', message]); }
function getFunctionAddress(fn) { return fn.label === 'native' ? 0x1234 : 0; }
function addFunction(fn, sig) { events.push(['add', fn.label, sig]); return 'added:' + fn.label; }
function growMemViews() { events.push(['grow']); }
eval(source);
function invoke(name) {
  keysCalls = 0; events.length = 0; HEAPU32.fill(0);
  const pointer = [...symbols.entries()].find(([, value]) => value === name)[0];
  const result = __dlsym_js(0, pointer, 8);
  return {result, keysCalls, events: events.map(event => [...event]), heap: [...HEAPU32]};
}
const before = invoke('later');
exports.later = makeFunction('later');
const after = invoke('later');
process.stdout.write(JSON.stringify({
  cases: Object.fromEntries(['native', 'data', 'missing', 'inherited', 'hidden', 'stub', 'present'].map(name => [name, invoke(name)])),
  before, after,
}));
"""


def run_node(source):
    completed = subprocess.run(
        ["node", "--input-type=commonjs", "-e", NODE_HARNESS, json.dumps(source)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


class DlsymOptimizerTests(unittest.TestCase):
    def test_optimized_function_matches_original_and_avoids_unneeded_scans(self):
        optimized = optimize(HOOK_SOURCE)
        original_result = run_node(HOOK_SOURCE)
        optimized_result = run_node(optimized)
        self.assertEqual(
            {name: {key: value for key, value in item.items() if key != "keysCalls"}
             for name, item in optimized_result["cases"].items()},
            {name: {key: value for key, value in item.items() if key != "keysCalls"}
             for name, item in original_result["cases"].items()},
        )
        self.assertEqual(
            {key: value for key, value in optimized_result["after"].items() if key != "keysCalls"},
            {key: value for key, value in original_result["after"].items() if key != "keysCalls"},
        )

        cases = optimized_result["cases"]
        self.assertEqual(cases["native"]["keysCalls"], 0)
        self.assertEqual(cases["data"]["keysCalls"], 0)
        self.assertEqual(cases["missing"]["keysCalls"], 0)
        self.assertEqual(cases["inherited"]["result"], 0)
        self.assertEqual(cases["hidden"]["result"], 0)
        self.assertEqual(cases["stub"]["result"], 0)
        self.assertEqual(cases["present"]["keysCalls"], 1)

    def test_new_function_slot_preserves_index_and_catch_up_order(self):
        result = run_node(optimize(HOOK_SOURCE))
        after = result["after"]
        self.assertEqual(after["result"], "added:later")
        self.assertEqual(after["heap"][2], 4)
        self.assertEqual(after["events"], [["add", "later", "v"], ["grow"]])
        self.assertEqual(result["before"]["result"], 0)

    def test_later_export_is_discoverable_after_an_initial_miss(self):
        result = run_node(optimize(HOOK_SOURCE))
        self.assertEqual(result["before"]["keysCalls"], 0)
        self.assertEqual(result["after"]["result"], "added:later")

    def test_optimizer_fails_closed_when_hooks_drift(self):
        with self.assertRaisesRegex(ValueError, "Pinned Emscripten dlsym hook drifted"):
            optimize(HOOK_SOURCE.replace("newSymIndex=Object.keys", "newSymIndex=Object.getOwnPropertyNames"))
        with self.assertRaisesRegex(ValueError, "Pinned Emscripten dlsym hook drifted"):
            optimize(HOOK_SOURCE.replace("(growMemViews(),HEAPU32)", "(growMemViews(),HEAPU8)"))


if __name__ == "__main__":
    unittest.main()
