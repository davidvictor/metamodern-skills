import test from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const source = new URL('../metamodern-interface-studio/assets/studio-shell/src/studio/annotations/', import.meta.url);
const dir = mkdtempSync(join(tmpdir(), 'studio-annotations-test-'));
writeFileSync(join(dir, 'protocol.mjs'), stripTypeScriptTypes(readFileSync(new URL('../protocol.ts', source), 'utf8'), {mode:'strip'}));
for (const name of ['model', 'client']) writeFileSync(join(dir, `${name}.mjs`), stripTypeScriptTypes(readFileSync(new URL(`${name}.ts`, source), 'utf8'), {mode:'strip'}).replace(/from "\.\/model"/g, 'from "./model.mjs"').replace(/from "\.\.\/protocol"/g, 'from "./protocol.mjs"'));
const {validCommand, validEvent, validAnnotation, eligibleAnnotationPage, feedbackMarkdown, validRecord, captureAnnotationValues, annotationPreviewSettled, annotationHydration, safeAnnotationDesign, safeAnnotationTokens} = await import(pathToFileURL(join(dir,'model.mjs')));
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
