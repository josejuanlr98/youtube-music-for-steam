const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module'),{EventEmitter,once}=require('node:events'),http=require('node:http'),{WebSocket}=require('ws');
function load(file,modules={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
    {exports,require:name=>modules[name]||require(name),URL,console,...globals});
  return exports;
}
async function dialTests(){
  const {patchDialServer,persistentDialIdentity}=await import('../scripts/cast_receiver_patch.mjs');
  const receiverEntry=require.resolve('yt-cast-receiver'),dialFile=path.join(path.dirname(receiverEntry),'lib/dial/DialServer.js');
  const original=fs.readFileSync(dialFile,'utf8'),patched=patchDialServer(original);
  assert.throws(()=>patchDialServer('changed upstream'),/Unexpected/);
  const peerFile=require.resolve('@patrickkfkan/peer-dial',{paths:[path.dirname(receiverEntry)]});
  const peerSource=path.join(path.dirname(peerFile),'lib/peer-dial.js'),peerRequire=createRequire(peerSource);
  let announcements=[],instances=[];
  const peerModule={exports:{}};
  // Execute the installed peer-dial implementation; replace only multicast IO.
  vm.runInNewContext(fs.readFileSync(peerSource,'utf8'),{
    module:peerModule,exports:peerModule.exports,__dirname:path.dirname(peerSource),console,setInterval:()=>0,clearInterval(){},
    require:name=>name==='@patrickkfkan/peer-ssdp'?{createPeer:()=>{
      const peer=new EventEmitter();peer.start=()=>peer.emit('ready');peer.alive=headers=>announcements.push(headers);return peer;
    }}:peerRequire(name),
  });
  const actualPeer=peerModule.exports;
  const express=require(createRequire(dialFile).resolve('express'));
  const modules={express,http:{createServer:()=>({})},'@patrickkfkan/peer-dial':{Server:class extends actualPeer.Server{constructor(options){super(options);instances.push(this);}}},
    '../utils/Errors.js':{DialServerError:Error},'../Constants.js':{CONF_DEFAULTS:{BRAND:'test',MODEL:'test'},STATUSES:{STOPPED:'stopped'}}};
  const evaluate=source=>{
    const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:name=>modules[name],console});return exports.default;
  };
  const id='84bbd9a4-cc48-4b39-8ac7-1f8e98c20274',options={uuid:id,friendlyName:'Deck',logger:{}};
  new (evaluate(original))({},options);
  assert.notEqual(instances.at(-1).uuid,id,'the unpatched installed dependency really ignores UUID');
  const Dial=evaluate(patched);
  for(let i=0;i<2;i++){new Dial({},options);const server=instances.at(-1);assert.equal(server.uuid,id);server.start();}
  assert(announcements.length>=10);
  assert(announcements.every(headers=>headers.USN.startsWith('uuid:'+id+'::')),'actual SSDP headers preserve identity across receiver reconstruction');
  const build=await require('esbuild').build({entryPoints:[dialFile],bundle:true,platform:'node',format:'cjs',write:false,plugins:[persistentDialIdentity],logLevel:'silent'});
  assert(build.outputFiles[0].text.includes('uuid: options.uuid'),'the production bundler actually applies the UUID patch');
  await assert.rejects(require('esbuild').build({stdin:{contents:'export const unrelated=1;'},bundle:true,write:false,plugins:[persistentDialIdentity],logLevel:'silent'}),/UUID patch was not applied/);
  console.log('PASS real installed DIAL/SSDP identity, restart persistence and fail-closed build patch');
}
async function apiTests(){
  const origin=load('backend/src/localOrigin.ts'),modules={'./localOrigin.js':origin};
  const {handleRequest}=load('backend/src/httpServer.ts',modules),{WsManager}=load('backend/src/wsManager.ts',modules);
  const changes=[],messages=[],server=http.createServer((req,res)=>handleRequest(req,res,ctx)),manager=new WsManager(server);
  const jumps=[];
  const ctx={libraryPlayer:{setVolume:async value=>changes.push(['volume',value.level]),seek:async value=>changes.push(['seek',value])},disconnectCast:async()=>{changes.push(['disconnect']);return true;},
    castPlayer:{playVideoById:async value=>{jumps.push(value);return true;},getQueueWithMetadata:()=>({tracks:[{videoId:'valid-id'}]})}};
  manager.onMessage(msg=>messages.push(msg));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port,steam='https://steamloopback.host';
  const post=(route,body,site=steam)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(site?{Origin:site}:{})},body:JSON.stringify(body)});
  let ws;
  try{
    for(const value of [null,'10',{},-1])assert.equal((await post('/api/seek',{position:value})).status,400);
    for(const value of [null,'loud',{}])assert.equal((await post('/api/volume',{volume:value})).status,400);
    assert.equal(changes.length,0);
    assert.equal((await post('/api/seek',{position:2.5},null)).status,200);
    assert.equal((await post('/api/volume',{volume:125})).status,200);
    assert.equal((await post('/api/volume',{volume:-5})).status,200);
    assert.deepEqual(changes,[['seek',2.5],['volume',100],['volume',0]]);
    for(const videoId of [null,123,{},'','x'.repeat(65),'bad/id'])assert.equal((await post('/api/queue/jump',{videoId})).status,400);
    assert.equal(jumps.length,0,'invalid jump IDs cannot reach the player');
    assert.equal((await post('/api/queue/jump',{videoId:'valid-id',expectedIds:['valid-id'],index:0})).status,200);assert.deepEqual(jumps,['valid-id']);
    const stale=await post('/api/queue/jump',{videoId:'valid-id',expectedIds:['stale-id'],index:0});assert.equal((await stale.json()).ok,false);assert.equal(jumps.length,1);
    for(const site of ['https://example.com','https://steamloopback.host.evil.test','null','https://steamloopback.host@evil.test']){
      const res=await post('/api/cast/disconnect',{},site);assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),null);
    }
    assert.equal(changes.length,3,'foreign pages cannot mutate the local player');
    const health=await fetch(base+'/api/health',{headers:{Origin:steam}});assert.equal(health.status,200);assert.equal(health.headers.get('access-control-allow-origin'),steam);
    assert.equal((await fetch(base+'/api/health',{method:'OPTIONS',headers:{Origin:steam}})).status,204);
    for(const [body,status] of [['{broken',400],['x'.repeat(1024*1024+1),413]]){
      assert.equal((await fetch(base+'/api/cast/disconnect',{method:'POST',headers:{Origin:steam},body})).status,status);
    }
    // Send more than 1MB but deliberately never end the upload. Rejection
    // must happen before 'end', while still delivering a useful 413 response.
    await new Promise((resolve,reject)=>{
      const upload=http.request(base+'/api/cast/disconnect',{method:'POST',headers:{Origin:steam,'Content-Length':10*1024*1024}},res=>{
        try{assert.equal(res.statusCode,413);assert.equal(res.headers.connection,'close');res.resume();res.on('end',resolve);}catch(error){reject(error);}
      });
      upload.on('error',reject);upload.setTimeout(3000,()=>{upload.destroy();reject(Error('Oversized unfinished upload was not rejected promptly'));});
      upload.write(Buffer.alloc(1024*1024+128*1024));
    });
    const rejected=new WebSocket(base.replace('http:','ws:'),{origin:'https://example.com'});
    await assert.rejects(once(rejected,'open'),/401/);
    ws=new WebSocket(base.replace('http:','ws:'),{origin:steam});await once(ws,'open');
    assert.equal(manager.getClientCount(),1);
    ws.send(JSON.stringify({event:'progress',data:{playbackId:'current',currentTime:1}}));
    for(let n=0;n<20&&!messages.length;n++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(messages[0].event,'progress','Steam WebSocket telemetry remains functional');
    console.log('PASS real HTTP/WebSocket origin checks, numeric validation, JSON failures and valid Steam controls');
  }finally{
    if(ws){ws.close();await once(ws,'close');}manager.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
}
async function heartbeatTests(){
  let now=1000,heartbeat;
  class Player{constructor(){this.queue=new EventEmitter();}}
  const {CastPlayer}=load('backend/src/CastPlayer.ts',{'yt-cast-receiver':{Player,Constants:{}},'./ytdlp.js':{}},{
    Date:{now:()=>now},setInterval:fn=>(heartbeat=fn,{unref(){}}),clearInterval(){},
  });
  const player=new CastPlayer({ytdlpPath:'test',wsManager:{},dataStore:{get:async()=>null}});
  player.playing=true;player.sessionCleared=false;player.currentPosition=30;player.currentDuration=200;player.lastAudioReport=now;player.armHeartbeat();
  now+=7000;assert.equal(await player.doGetPosition(),37);
  now+=13000;assert.equal(await player.doGetPosition(),45,'report extrapolation is deliberately capped at 15 seconds');
  heartbeat();assert.equal(await player.doGetPosition(),45);assert.equal(player.progressHeartbeat,null);
  now+=60000;assert.equal(await player.doGetPosition(),45,'heartbeat never invents ongoing playback after audio reports stop');
  console.log('PASS heartbeat freezes the same bounded estimate it reported to the sender');
}
(async()=>{await dialTests();await apiTests();await heartbeatTests();})().catch(error=>{console.error(error);process.exitCode=1;});
