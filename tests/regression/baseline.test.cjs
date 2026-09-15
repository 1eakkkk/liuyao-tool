const {test} = require('node:test');
const assert = require('node:assert/strict');
const {baseline,capture} = require('./harness.cjs');
const fixtures = require('./fixtures/casts.json');
test('frozen original reproduces all 24 captured outputs',()=>{
 const dom=baseline();
 try {for(const f of fixtures)assert.deepEqual(JSON.parse(JSON.stringify(capture(dom.window,f.input))),f.expected,f.id);}
 finally {dom.window.close();}
});
