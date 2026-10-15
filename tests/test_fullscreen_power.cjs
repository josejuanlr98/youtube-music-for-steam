const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exportsPower={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/fullscreenPower.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsPower,console});
const keys=['system_idle_screensaver_battery_sec','system_idle_screensaver_ac_sec'],journal='ytm-fullscreen-power-v1';
function fixture(initial=[60,300],saved=new Map()){
 const values=new Map(keys.map((key,i)=>[key,initial[i]])),writes=[],warnings=[];
 let unavailable=false,fail,blocked=false,delay;
 const environment={store:()=>unavailable?undefined:{GetClientSetting:key=>[values.get(key),async value=>{
  writes.push([key,value]);if(delay)await delay;
  if(fail?.(key,value))return false;values.set(key,value);return true;
 }]},storage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>{if(blocked)throw Error('Storage unavailable');saved.set(key,value)},removeItem:key=>saved.delete(key)},warn:(...args)=>warnings.push(args)};
 return {values,writes,warnings,saved,environment,power:exportsPower.createFullscreenPower(environment),set unavailable(value){unavailable=value},set fail(value){fail=value},set blocked(value){blocked=value},set delay(value){delay=value}};
}
(async()=>{
 {
 const f=fixture(),release=f.power.acquire();await f.power.settled();assert.deepEqual([...f.values.values()],[0,0]);assert.deepEqual(JSON.parse(f.saved.get(journal)),Object.fromEntries(keys.map((k,i)=>[k,[60,300][i]])));
 release();release();await f.power.settled();assert.deepEqual([...f.values.values()],[60,300]);assert.equal(f.saved.size,0);assert.equal(f.writes.length,4);
 }
 {
 const f=fixture([0,120]),a=f.power.acquire(),b=f.power.acquire();await f.power.settled();a();await f.power.settled();assert.equal(f.values.get(keys[1]),0);b();await f.power.settled();assert.deepEqual([...f.values.values()],[0,120]);assert.deepEqual(f.writes.map(w=>w[0]),[keys[1],keys[1]],'disabled settings stay disabled without writes');
 }
 {
 const f=fixture(),release=f.power.acquire();release();await f.power.settled();assert.equal(f.writes.length,0,'immediate unmount never changes Steam settings');
 }
 {
 const f=fixture();let resolve;f.delay=new Promise(r=>resolve=r);const release=f.power.acquire();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(f.writes.length,1);release();resolve();await f.power.settled();assert.deepEqual([...f.values.values()],[60,300],'late native write is restored after unmount');
 }
 {
 const f=fixture(),release=f.power.acquire();await f.power.settled();f.values.set(keys[1],600);release();await f.power.settled();assert.deepEqual([...f.values.values()],[60,600],'manual changes take precedence');
 }
 {
 const f=fixture();f.fail=(key,value)=>key===keys[1]&&value===0;f.power.acquire();await f.power.settled();assert.deepEqual([...f.values.values()],[60,300],'partial entry failure rolls back the first setting');assert.equal(f.warnings.length,1);assert.equal(f.saved.size,0);
 }
 {
 const f=fixture();f.blocked=true;f.power.acquire();await f.power.settled();assert.equal(f.writes.length,0,'do not change native values without a recovery journal');
 }
 {
 const f=fixture();f.values.set(keys[1],undefined);f.power.acquire();await f.power.settled();assert.equal(f.writes.length,0,'both values must be loaded before any change');
 }
 {
 const f=fixture();f.power.acquire();await f.power.settled();const reloaded=exportsPower.createFullscreenPower(f.environment);await reloaded.recover();assert.deepEqual([...f.values.values()],[60,300]);assert.equal(f.saved.size,0,'new plugin instance recovers a previous crashed session');
 }
 {
 const f=fixture(),release=f.power.acquire();await f.power.settled();f.fail=(key,value)=>key===keys[0]&&value===60;release();await f.power.settled();assert.deepEqual([...f.values.values()],[0,300],'restoring one key fails independently of the other');assert.equal(f.saved.size,1);f.fail=undefined;await f.power.recover();assert.deepEqual([...f.values.values()],[60,300]);assert.equal(f.saved.size,0);
 }
 {
 const f=fixture();const release=f.power.acquire();await f.power.settled();await f.power.dispose();release();const next=f.power.acquire();await f.power.settled();assert.deepEqual([...f.values.values()],[0,0],'stale cleanup cannot damage a newly mounted lease');next();await f.power.settled();assert.deepEqual([...f.values.values()],[60,300]);
 }
 {
 const saved=new Map([[journal,JSON.stringify({[keys[0]]:60,unexpected:55,[keys[1]]:'bad'})]]),f=fixture([0,300],saved);await f.power.recover();assert.deepEqual([...f.values.values()],[60,300]);assert.deepEqual(f.writes,[[keys[0],60]],'recovery only accepts two known keys and finite durations');
 }
 {
 const f=fixture(),first=f.power.acquire();await f.power.settled();first();const second=f.power.acquire();await f.power.settled();assert.equal(f.writes.length,2,'rapid remount must not briefly restore the timer and flash the screensaver');await f.power.recover();assert.deepEqual([...f.values.values()],[0,0],'startup recovery cannot undo a currently active fullscreen lease');second();await f.power.settled();assert.deepEqual([...f.values.values()],[60,300]);
 }
 console.log('PASS 13 fullscreen power scenarios: native AC/battery values, shared leases, disabled/custom settings, unmount races, partial failures, crash recovery and generation-safe teardown');
})().catch(error=>{console.error(error);process.exitCode=1});
