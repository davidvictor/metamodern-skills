import {mkdirSync} from 'node:fs';
const out=process.env.EVIDENCE_OUT ?? new URL('.',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import {writeFileSync} from 'node:fs';
import {captureResources} from './capture.mjs';
const results=[];
for(const engine of ['chromium','webkit']) {
 const browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?(process.env.WEBKIT_EXECUTABLE ? {executablePath:process.env.WEBKIT_EXECUTABLE} : {}):{});
 for(const [host,port] of [['vite',process.env.VITE_ORIGIN ?? 'http://127.0.0.1:4225'],['next',process.env.NEXT_ORIGIN ?? 'http://127.0.0.1:4226']]) {
  const context=await browser.newContext({viewport:{width:768,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),origin=`${port}`,capture=captureResources(page,origin);
  await page.goto(origin+'/?centered&provenance=long#view=design&scenario=tasks.list&tab=adjust');
  const opener=page.getByRole('button',{name:'Open centered picker',exact:true});await opener.click();
  const dialog=page.getByRole('dialog',{name:'Synthetic centered picker',exact:true});await dialog.waitFor();await page.mouse.click(8,8);await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.textContent==='Open centered picker');
  await page.getByRole('button',{name:'Tokens',exact:true}).click();for(const button of await page.getByRole('button',{name:'Source',exact:true}).all())await button.click();await page.getByText('Source lock: sha256:',{exact:false}).first().waitFor();
  results.push({engine,host,outsideDismissFocus:true,resources:await capture()});await context.close();
 }
 await browser.close();
}
writeFileSync(`${out}/lineage.json`,JSON.stringify(results,null,2)+'\n');
