import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = new URL('../metamodern-interface-studio/assets/studio-shell/src/studio/annotations/', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'studio-annotations-test-'));
writeFileSync(join(dir, 'location.mjs'), stripTypeScriptTypes(readFileSync(new URL('../location.ts', source), 'utf8'), {mode:'strip'}));
writeFileSync(join(dir, 'protocol.mjs'), stripTypeScriptTypes(readFileSync(new URL('../protocol.ts', source), 'utf8'), {mode:'strip'}));
for (const name of ['model', 'client', 'bridge', 'schedule']) writeFileSync(join(dir, `${name}.mjs`), stripTypeScriptTypes(readFileSync(new URL(`${name}.ts`, source), 'utf8'), {mode:'strip'}).replace(/from "\.\/model"/g, 'from "./model.mjs"').replace(/from "\.\/schedule"/g, 'from "./schedule.mjs"').replace(/from "\.\.\/protocol"/g, 'from "./protocol.mjs"'));
const {validCommand, validEvent, validAnnotation, eligibleAnnotationPage, feedbackMarkdown, validRecord, captureAnnotationValues, annotationPreviewSettled, annotationHydration, safeAnnotationDesign, safeAnnotationTokens, annotationHostBottom} = await import(pathToFileURL(join(dir,'model.mjs')));
const {scheduleAnnotationWork, ANNOTATION_IDLE_TIMEOUT_MS} = await import(pathToFileURL(join(dir,'schedule.mjs')));
const {committedStudioLocation,subscribeStudioLocation,replaceStudioLocation} = await import(pathToFileURL(join(dir,'location.mjs')));
const {annotationBridge} = await import(pathToFileURL(join(dir,'bridge.mjs')));
const {createAnnotationClient} = await import(pathToFileURL(join(dir,'client.mjs')));
const annotation = {id:'note1', comment:'Do exactly this.\nKeep this second line.', element:'Button', elementPath:'[data-kit-component="Button"]', timestamp:Date.now(), x:10, y:20};
const session = {generation:'g1', fingerprint:'f1', context:{layer:'preview', page:'library', scenario:'button', viewport:{width:360,height:480,scale:1},shellVersion:'0.19.1'}};
const tick = () => new Promise(resolve => setImmediate(resolve));
test('actual page eligibility respects Library, module and view precedence', () => {
 assert.equal(eligibleAnnotationPage({library:'button',module:'tools',view:'compare'}),'library');
 assert.equal(eligibleAnnotationPage({module:'tools',view:'inspect'}),null);
 for(const view of ['compare','responsive','gallery','present','design']) assert.equal(eligibleAnnotationPage({view}),null);
 assert.equal(eligibleAnnotationPage({view:'inspect'}),'inspect');
});
test('bounded typed envelopes reject invalid records without truncating comments', () => {
 assert.ok(validCommand({action:'activate',session,notes:[annotation]}));
 assert.ok(validEvent({...annotation, action:'upsert',annotation,generation:'g',fingerprint:'f'}));
 assert.ok(!validAnnotation({...annotation, comment:'x'.repeat(32768)}));
 assert.ok(!validCommand({action:'activate',session:{...session,context:{...session.context,viewport:{width:NaN,height:480,scale:1}}},notes:[]}));
 assert.ok(!validEvent({action:'delete',id:{},generation:'g',fingerprint:'f'}));
 assert.ok(!validCommand({action:'deactivate',generation:4}));
});
test('revocation cancels delayed loads and prevents stale mutations', async () => {
 let resolve; let loads=0,mounts=0,disposals=0,callback; const events=[];
 const client=createAnnotationClient({load:()=>{loads++; return new Promise(r=>{resolve=r})}});
 const runtime={mountAnnotations(options){mounts++; callback=options.onMutation; return ()=>{disposals++}}};
 assert.equal(loads,0);
 client.receive({action:'activate',session,notes:[]},e=>events.push(e));
 client.receive({action:'deactivate',generation:'g1'},e=>events.push(e));
 resolve(runtime); await tick(); assert.equal(mounts,0); assert.equal(events[0].action,'stopped');
 client.receive({action:'activate',session:{...session,generation:'g2'},notes:[annotation]},e=>events.push(e));
 resolve(runtime); await tick(); assert.equal(mounts,1); assert.equal(events.at(-1).action,'ready');
 callback({action:'upsert',annotation}); assert.equal(events.at(-1).action,'upsert');
 callback({action:'upsert',annotation:{...annotation,comment:'x'.repeat(40000)}}); assert.equal(events.at(-1).action,'error');
 client.dispose(); assert.equal(disposals,1); const before=events.length; callback({action:'clear'}); assert.equal(events.length,before);
});
test('Markdown keeps raw comments, captured context and distinct change scopes', () => {
 const record={schema:'studio-feedback/1',key:'key',capturedAt:'now',product:'product',origin:'http://localhost:1',repository:'example/product',session,scope:'example',source:{owner:'Button story',confidence:'verified',paths:['src/Button.story.tsx']},annotation};
 assert.ok(validRecord(record));
 const output=feedbackMarkdown([record,{...record,key:'key2',scope:'shared',source:{owner:'Button',confidence:'unresolved',paths:[],candidates:['src/Button.tsx']}}]);
 assert.ok(output.includes(annotation.comment)); assert.ok(output.includes('Scope: example')); assert.ok(output.includes('Scope: shared')); assert.ok(output.includes('Source confidence: unresolved')); assert.ok(output.includes('no merge, release or publication authority')); assert.ok(output.includes('"width": 360'));
});
test('vendor runtime is lazy and local-only in both host builders', () => {
 const slot=readFileSync(new URL('slot.tsx',source),'utf8');
 assert.match(slot,/__STUDIO_LOCAL_ANNOTATIONS__/); assert.match(slot,/eligibleAnnotationPage/);
 const runtime=readFileSync(new URL('runtime.tsx',source),'utf8');
 for(const expected of ['copyToClipboard={false}','enableKeyboardShortcuts={false}','autoClearAfterCopy: false','webhooksEnabled: false','portalContainer={portal}','saveAnnotations(location.pathname']) assert.ok(runtime.includes(expected),expected);
 assert.ok(!runtime.includes('endpoint='));
 for(const host of ['vite','next']) {
  const packageJson=JSON.parse(readFileSync(new URL(`../metamodern-interface-studio/assets/studio-hosts/${host}/package.json`,import.meta.url),'utf8'));
  assert.equal(packageJson.dependencies.agentation,'3.1.2');
 }
});

test('redacted values still revoke capture identity without exposing their contents', () => {
 const first=captureAnnotationValues({label:'Private first',enabled:true,variant:'primary',storyState:{private:'first'}},{enabled:true,variant:'primary'});
 const second=captureAnnotationValues({label:'Private second',enabled:true,variant:'primary',storyState:{private:'second'}},{enabled:true,variant:'primary'});
 assert.notEqual(first.valuesFingerprint,second.valuesFingerprint);
 assert.deepEqual(first.omittedValues,['label','storyState']);
 assert.ok(!JSON.stringify(first).includes('Private first'));
 assert.ok(!JSON.stringify(second).includes('Private second'));
 assert.deepEqual(captureAnnotationValues({label:'private',enabled:true}).values,{enabled:true});
});

test('failed remounts and rejected or pending appearance/draft/values cannot annotate incoming context', () => {
 const settled={current:'visible',newest:'visible',currentKey:'mount1',requestedKey:'mount1',error:false,values:'v1',acknowledgedValues:'v1',appearance:'a1',acknowledgedAppearance:'a1',draft:'d1',acknowledgedDraft:'d1'};
 assert.ok(annotationPreviewSettled(settled));
 assert.ok(!annotationPreviewSettled({...settled,newest:'failed-new-frame'}));
 assert.ok(!annotationPreviewSettled({...settled,requestedKey:'requested-but-not-mounted'}));
 assert.ok(!annotationPreviewSettled({...settled,values:'v2'}));
 assert.ok(!annotationPreviewSettled({...settled,appearance:'rejected-a2'}));
 assert.ok(!annotationPreviewSettled({...settled,draft:'rejected-d2'}));
 assert.ok(!annotationPreviewSettled({...settled,error:true}));
 assert.ok(annotationPreviewSettled({...settled,values:'v2',acknowledgedValues:'v2'}));
});

test('bounded marker hydration preserves session usability without dropping durable feedback', () => {
 const notes=Array.from({length:4},(_,index)=>({...annotation,id:`note${index}`,comment:'x'.repeat(20000)}));
 const result=annotationHydration(session,notes);
 assert.ok(validCommand(result.command)); assert.equal(result.command.notes.length,3); assert.equal(result.omitted,1); assert.equal(notes.length,4);
});
test('registered safe design values and literal tokens remain useful without exporting arbitrary CSS or URLs',()=>{
 assert.deepEqual(safeAnnotationDesign({density:1.1,accent:'#123456',icon:'stroke',secret:'PRIVATE'},[{id:'density',kind:'scale',apply:{}},{id:'accent',kind:'color',apply:{}},{id:'icon',kind:'enum',choices:[{id:'stroke'}],apply:{}}]),{density:1.1,accent:'#123456',icon:'stroke'});
 assert.deepEqual(safeAnnotationTokens({'--space':'4px','--accent':'oklch(50% .2 30)','--url':'url(https://private.example)','--css':'secret; content: PRIVATE'}),{'--space':'4px','--accent':'oklch(50% .2 30)'});
});
test('a raw-valid note whose full durable envelope exceeds the limit is rejected before persistence', () => {
 const raw={...annotation,comment:'x'.repeat(31000)};
 assert.ok(validAnnotation(raw));
 const record={schema:'studio-feedback/1',key:'key',capturedAt:'now',product:'product',origin:'http://localhost:1',repository:'example/product',session:{...session,context:{...session.context,location:'x'.repeat(3000)}},scope:'example',source:{owner:'Button',confidence:'verified',paths:['src/Button.tsx']},annotation:raw};
 assert.ok(!validRecord(record));
 const host=readFileSync(new URL('host.tsx',source),'utf8');
 assert.ok(host.indexOf('if (!validRecord(note))') < host.indexOf('persist([...notesRef.current.filter'));
});

test('new activation and revoked acknowledgement await actual asynchronous root disposal',async()=>{
 let release, mounts=0;const events=[];
 const client=createAnnotationClient({load:async()=>({mountAnnotations(){mounts++;return ()=>new Promise(resolve=>{release=resolve})}})});
 client.receive({action:'activate',session,notes:[]},event=>events.push(event));await tick();assert.equal(mounts,1);
 client.receive({action:'deactivate',generation:session.generation},event=>events.push(event));
 client.receive({action:'activate',session:{...session,generation:'new'},notes:[]},event=>events.push(event));
 await tick();assert.equal(mounts,1);assert.ok(!events.some(event=>event.action==='stopped'));
 release();await tick();assert.equal(mounts,2);assert.ok(events.some(event=>event.action==='stopped'));
 const disposed=client.dispose();release();await disposed;
});

test('expanded portal ownership notifies close/unmount and preserves another owner',()=>{
 const first={id:'first'}, second={id:'second'};let updates=0;
 const release=annotationBridge.subscribe(()=>updates++);
 annotationBridge.setPortal('first',first);assert.equal(annotationBridge.portal(),first);
 const changed=updates;annotationBridge.setPortal('first',first);assert.equal(updates,changed);
 annotationBridge.setPortal('second',second);assert.equal(annotationBridge.portal(),second);
 annotationBridge.setPortal('first',null);assert.equal(annotationBridge.portal(),second);
 annotationBridge.setPortal('second',null);assert.equal(annotationBridge.portal(),null);
 assert.equal(updates,4);release();
 const host=readFileSync(new URL('host.tsx',source),'utf8');
 assert.ok(host.includes('portalContainer ?? document.body'));
 assert.ok(host.includes('value={selected} disabled>Selected preview unavailable'));
 assert.ok(!host.includes('document.querySelector("[data-studio-annotation-portal]")'));
});

function paintScheduler() {
 let sequence=0;const frames=new Map(),idle=new Map(),idleOptions=[];
 return {frames,idle,idleOptions,host:{requestAnimationFrame(callback){const id=++sequence;frames.set(id,callback);return id},cancelAnimationFrame(id){frames.delete(id)},requestIdleCallback(callback,options){idleOptions.push(options);const id=++sequence;idle.set(id,callback);return id},cancelIdleCallback(id){idle.delete(id)}},paint(){const work=[...frames.values()];frames.clear();work.forEach(callback=>callback())},flushIdle(){const work=[...idle.values()];idle.clear();work.forEach(callback=>callback())}};
}
test('optional SDK initialization yields two paints and an idle task, without polling',async()=>{
 const scheduler=paintScheduler(),controller=new AbortController();let calls=0;
 const work=scheduleAnnotationWork(()=>{calls++;return 'runtime'},controller.signal,scheduler.host);
 assert.equal(calls,0);scheduler.paint();assert.equal(calls,0);scheduler.paint();assert.equal(calls,0);assert.equal(scheduler.idle.size,1);assert.equal(scheduler.idleOptions[0].timeout,ANNOTATION_IDLE_TIMEOUT_MS);scheduler.flushIdle();assert.equal(await work,'runtime');assert.equal(calls,1);assert.equal(scheduler.frames.size,0);assert.equal(scheduler.idle.size,0);
});
test('revocation cancels pending frame/idle work before import or mount can run',async()=>{
 for(const phase of ['before-paint','after-paint']){
  const scheduler=paintScheduler(),controller=new AbortController();let calls=0;
  const work=scheduleAnnotationWork(()=>{calls++},controller.signal,scheduler.host);const rejected=assert.rejects(work,{name:'AbortError'});
  if(phase==='after-paint'){scheduler.paint();scheduler.paint()}
  controller.abort();await rejected;scheduler.paint();scheduler.flushIdle();assert.equal(calls,0);assert.equal(scheduler.frames.size,0);assert.equal(scheduler.idle.size,0);
 }
});
test('background scheduler fallback carries cancellation and explicit background priority',async()=>{
 const scheduler=paintScheduler(),controller=new AbortController();let task,options,calls=0;
 const host={requestAnimationFrame:scheduler.host.requestAnimationFrame,cancelAnimationFrame:scheduler.host.cancelAnimationFrame,scheduler:{postTask(callback,provided){task=callback;options=provided;return Promise.resolve()}}};
 const work=scheduleAnnotationWork(()=>{calls++},controller.signal,host);scheduler.paint();scheduler.paint();assert.equal(options.priority,'background');assert.equal(options.signal.aborted,false);assert.equal(calls,0);task();await work;assert.equal(calls,1);
});

test('a starved background task makes bounded progress once and cancels the losing task',async()=>{
 const scheduler=paintScheduler(),controller=new AbortController(),timers=new Map();let task,options,calls=0,next=0;
 const host={requestAnimationFrame:scheduler.host.requestAnimationFrame,cancelAnimationFrame:scheduler.host.cancelAnimationFrame,setTimeout(callback,delay){const id=++next;timers.set(id,{callback,delay});return id},clearTimeout(id){timers.delete(id)},scheduler:{postTask(callback,provided){task=callback;options=provided;return new Promise(()=>{})}}};
 const work=scheduleAnnotationWork(()=>{calls++;return 'runtime'},controller.signal,host);scheduler.paint();scheduler.paint();
 const timeout=[...timers.values()][0];assert.equal(timeout.delay,ANNOTATION_IDLE_TIMEOUT_MS);timeout.callback();assert.equal(await work,'runtime');assert.equal(calls,1);assert.equal(options.signal.aborted,true);assert.equal(timers.size,0);task();assert.equal(calls,1);
});

test('context-only updates notify selected preview without flushing Studio/off/availability consumers',()=>{
 const target={id:'selective-preview',label:'Preview',available:true,context:session.context,send(){}};
 const remove=annotationBridge.register(target);
 const counts={studio:0,off:0,selected:0,availability:0};
 const releases=[annotationBridge.subscribeFor('studio',()=>counts.studio++),annotationBridge.subscribeFor(null,()=>counts.off++),annotationBridge.subscribeFor(target.id,()=>counts.selected++),annotationBridge.subscribe(()=>counts.availability++)];
 const before=annotationBridge.snapshotFor(target.id),studioBefore=annotationBridge.snapshotFor('studio');
 annotationBridge.update({...target,context:{...target.context,viewport:{width:361,height:480,scale:1}}});
 assert.deepEqual(counts,{studio:0,off:0,selected:1,availability:0});
 assert.notEqual(annotationBridge.snapshotFor(target.id),before);assert.equal(annotationBridge.snapshotFor('studio'),studioBefore);
 assert.equal(annotationBridge.targets().filter(value=>value.id===target.id).length,1);
 annotationBridge.update({...target,available:false,context:{...target.context,viewport:{width:362,height:480,scale:1}}});
 assert.deepEqual(counts,{studio:1,off:1,selected:2,availability:1});
 remove();assert.ok(!annotationBridge.targets().some(value=>value.id===target.id));
 assert.deepEqual(counts,{studio:2,off:2,selected:3,availability:2});releases.forEach(release=>release());
});
test('updated membership keeps its owner and an older cleanup cannot remove its replacement',()=>{
 const target={id:'owner-preview',label:'Preview',available:true,context:session.context,send(){}};
 const first=annotationBridge.register(target);annotationBridge.update({...target,context:{...target.context,theme:'dark'}});
 const second=annotationBridge.register(target);first();assert.ok(annotationBridge.targets().some(value=>value.id===target.id));second();assert.ok(!annotationBridge.targets().some(value=>value.id===target.id));
});
test('Studio location publishes actual canonical URL after replacement, without duplicate notifications',()=>{
 const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location'),previousHistory=Object.getOwnPropertyDescriptor(globalThis,'history');
 const order=[],observed=[];const location={hash:'#before'};
 Object.defineProperty(globalThis,'location',{configurable:true,value:location});Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState(_state,_title,url){order.push(url);location.hash='#committed-normalized'}}});
 const unsubscribe=subscribeStudioLocation(()=>{order.push('notified');observed.push([committedStudioLocation(),location.hash])});
 try{replaceStudioLocation('#requested');assert.deepEqual(order,['#requested','notified']);assert.deepEqual(observed,[['#committed-normalized','#committed-normalized']]);replaceStudioLocation('#requested');assert.equal(observed.length,1)}finally{unsubscribe();if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;if(previousHistory)Object.defineProperty(globalThis,'history',previousHistory);else delete globalThis.history}
 const store=readFileSync(new URL('../store.tsx',new URL('../',source)),'utf8');assert.equal((store.match(/replaceStudioLocation\(`#\$\{q\}`\)/g)??[]).length,3);assert.ok(!store.includes('history.replaceState'));
});
test('annotation-only hashes are guarded and Host observes page/committed URL rather than full Studio Context',()=>{
 const live=readFileSync(new URL('../live-preview.tsx',source),'utf8');assert.ok(live.indexOf('if (annotationEligible)')<live.indexOf('const annotationContext ='));
 assert.ok(live.includes('annotationPage !== "library" || annotationOptIn'));
 const host=readFileSync(new URL('host.tsx',source),'utf8');assert.ok(!host.includes('useStudio'));assert.ok(host.includes('subscribeStudioLocation'));assert.ok(host.includes('annotationBridge.subscribeFor(observedTarget'));
 const slot=readFileSync(new URL('slot.tsx',source),'utf8');assert.ok(slot.includes('React.memo(module.Annotations)'));assert.ok(slot.includes('<Annotations page={page}'));
});

test('host annotation placement clears wrapped docks without moving child toolbars', () => {
  assert.equal(annotationHostBottom(844, 716), 140);
  assert.equal(annotationHostBottom(768, 650), 130);
  assert.equal(annotationHostBottom(1024, 950), 86);
  assert.equal(annotationHostBottom(844, null), 24);
  assert.equal(annotationHostBottom(844, 900), 24);
  const runtime = readFileSync(new URL('runtime.tsx', source), 'utf8');
  assert.match(runtime, /context.layer === "studio" \? "studio-host-annotation-toolbar" : undefined/);
  assert.match(runtime, /:host\(\.studio-host-annotation-toolbar\).*:not\(\[style\]\)/);
});

test('layout membership notification is inert when compiled off and coalesces local mount changes', async () => {
  const text = stripTypeScriptTypes(readFileSync(new URL('capability.ts', source), 'utf8'), { mode: 'strip' });
  const originalWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  try {
    for (const enabled of [false, true]) {
      const file = join(dir, `capability-${enabled}.mjs`);
      writeFileSync(file, text.replaceAll('__STUDIO_LOCAL_ANNOTATIONS__', String(enabled)));
      const module = await import(pathToFileURL(file));
      module.notifyAnnotationLayout();
      module.notifyAnnotationLayout();
      await Promise.resolve();
      assert.equal(events.length, enabled ? 1 : 0);
      if (enabled) {
        assert.equal(events[0], module.ANNOTATION_LAYOUT_EVENT);
        module.notifyAnnotationLayout();
        await Promise.resolve();
        assert.equal(events.length, 2);
      }
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
