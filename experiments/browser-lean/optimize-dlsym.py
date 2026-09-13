"""Avoid an export-table scan when dlsym does not need a catch-up index.

This preserves enumerable-own-property/stub checks and the original index for
new function-table entries. It neither caches failed lookups nor freezes tables.
"""
def optimize(source: str) -> str:
    old='newSymIndex=Object.keys(lib.exports).indexOf(symbol);if(newSymIndex==-1||lib.exports[symbol].stub)'
    new='if(!Object.prototype.propertyIsEnumerable.call(lib.exports,symbol)||lib.exports[symbol].stub)'
    slow='result=addFunction(result,result.sig);(growMemViews(),HEAPU32)[symbolIndex>>>2>>>0]=newSymIndex'
    replacement='newSymIndex=Object.keys(lib.exports).indexOf(symbol);'+slow
    if source.count(old)!=1 or source.count(slow)!=1:
        raise ValueError('Pinned Emscripten dlsym hook drifted')
    return source.replace(old,new).replace(slow,replacement)
