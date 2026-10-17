import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const js=await readFile(new URL("../app.js",import.meta.url),"utf8");
const css=await readFile(new URL("../style.css",import.meta.url),"utf8");

test("all referenced static element IDs exist in the page",()=>{
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
 const targets=new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(x=>x[1]));
 for(const name of targets) assert.ok(ids.has(name),"missing HTML element "+name);
 assert.equal(ids.size,[...html.matchAll(/\bid="([^"]+)"/g)].length,"duplicate DOM id");
});

test("navigation targets and all requested onboarding forms exist",()=>{
 const sections=new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(x=>x[1]));
 const tabs=new Set([...html.matchAll(/data-nav="([^"]+)"/g)].map(x=>x[1]));
 assert.deepEqual([...sections].sort(),[...tabs].sort());
 for(const id of ["source-form","destination-form","attach-form","schedule-form",
   "telegram-secret-form","meta-secret-form","integration-secret-form","login-form"]){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
});

test("secret entry is password/textarea and avoids local browser credential persistence",()=>{
 assert.match(html,/name="apiHash" type="password"/);
 assert.match(html,/<textarea name="sessionString"/);
 assert.match(html,/<textarea name="accessToken"/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
 assert.match(css,/\.setup-grid/);
});

test("Meta app and storage settings are masked, and browser receives no raw secret on GET",()=>{
 assert.match(html,/id="integration-secret-form"/);
 assert.match(html,/name="value" type="password"/);
 assert.match(js,/request\("\/api\/setup\/integrations"\)/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|innerHTML/);
});
