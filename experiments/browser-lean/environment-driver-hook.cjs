// Applied to the hash-pinned cauli Node driver before it evaluates lean.js.
// Use the browser's synchronous import entry point, not the CLI's async task tree.
Module.noInitialRun = true;
Module.onRuntimeInitialized = function () {
  try {
    Module._lean_initialize_runtime_module();
    Module._lean_initialize();
    Module._lean_io_mark_end_initialization();
    Module._lean_init_task_manager_using(2);
    if (Module._lean_enable_initializer_execution) Module._lean_enable_initializer_execution();
    const check = result => {
      if ((Module.getValue(result + 7, 'i8') & 0xff) !== 0) {
        Module._lean_io_result_show_error(result);
        throw Error('Lean environment operation failed');
      }
    };
    check(Module._lean_init_search_path());
    const leanString = text => {
      const pointer = Module.stringToNewUTF8(text);
      try { return Module._lean_mk_string(pointer); } finally { Module._free(pointer); }
    };
    const header = Module.FS.readFile('/work/header.lean', {encoding:'utf8'});
    check(Module._lean_wasm_save_environment(leanString(header), leanString('/work/header.snap')));
    process.exit(0);
  } catch (error) { console.error(error); process.exit(1); }
};
