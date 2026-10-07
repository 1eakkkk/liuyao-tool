import {build,preview} from 'vite';
import {spawn} from 'node:child_process';
const run=(file,url)=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,[file,url],{stdio:'inherit',env:process.env});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error(`${file} failed (${code})`)));});
// Keep the published policy-2 regression suite explicit, then test the actual
// production default. The legacy build has its own directory and origin.
await build({build:{outDir:'test-results/legacy-reading-dist'},define:{
 'import.meta.env.VITE_READING_JUDGMENT_POLICY':'"2"',
 'import.meta.env.VITE_READING_BASIS_POLICY':'"0"',
 'import.meta.env.VITE_READING_STRICT_TRANSPORT':'"0"',
},logLevel:'error'});
const legacy=await preview({build:{outDir:'test-results/legacy-reading-dist'},preview:{host:'127.0.0.1',port:4336,strictPort:true}});
try{await run('scripts/verify-legacy-reading-browser.js',legacy.resolvedUrls.local[0]);}
finally{await new Promise(r=>legacy.httpServer.close(r));}
const target=process.argv[2];const current=target?null:await preview({preview:{host:'127.0.0.1',port:4337,strictPort:true}});
try{await run('scripts/verify-practical-browser.js',target||current.resolvedUrls.local[0]);}
finally{if(current)await new Promise(r=>current.httpServer.close(r));}
