/* Dashboard uses same-origin cookie sessions; no token is persisted in browser storage. */
const $=id=>document.getElementById(id);
let csrf="";
async function request(path,opts={}){
 const response=await fetch(path,{credentials:"same-origin",...opts});
 if(!response.ok){const e=await response.json().catch(()=>({}));throw new Error(e.error??"HTTP "+response.status);}
 return response.json();
}
function notice(message=""){$("notice").textContent=message;}
function number(id,value){$(id).textContent=String(value??0);}
function element(tag,text,className){
 const n=document.createElement(tag);n.textContent=text;
 if(className)n.className=className;
 return n;
}
async function render(){
 const [data,queue,catalog,me]=await Promise.all([request("/api/dashboard"),request("/api/queue"),request("/api/setup/catalog"),request("/api/me")]);
 $("login-panel").classList.add("hidden");$("dashboard").classList.remove("hidden");
 $("logout").classList.remove("hidden");
 number("source-count",data.sources?.total);
 number("destination-count",data.destinations?.active);
 number("queue-count",data.queue?.PENDING);
 number("published-count",data.publications?.CONFIRMED);
 $("setup-status").textContent=data.configured?"بعض الحسابات متصلة":"بانتظار ربط القنوات والحسابات";
 const routes=$("route-list");routes.replaceChildren();
 if(!data.routes.length)routes.append(element("p","لم تُضف القنوات بعد. سنضيفها بعد ربط تيليجرام.","empty"));
 for(const route of data.routes){
   const card=element("article","","route");
   const box=document.createElement("div");
   box.append(element("h3",route.slug),element("p",route.source_label));
   const button=element("button",route.enabled?"إيقاف":"غير مفعّل","small-button");
   button.type="button";button.disabled=!route.enabled;
   button.addEventListener("click",async()=>{
     try{await request("/api/routes/"+encodeURIComponent(route.id)+"/pause",{
       method:"POST",headers:{"x-csrf-token":csrf}
     });notice("أُوقف المسار");await render();}
     catch{notice("تعذّر تغيير الحالة؛ أعد تسجيل الدخول ثم حاول مجددًا.");}
   });
   card.append(box,button);routes.append(card);
 }
 const tbody=$("queue-rows");tbody.replaceChildren();
 if(!queue.items.length){
   const tr=document.createElement("tr");const td=element("td","لم تُفهرس منشورات بعد.","empty");td.colSpan=4;tr.append(td);tbody.append(tr);
 }
 for(const item of queue.items){
   const tr=document.createElement("tr");
   for(const value of [item.slug,item.caption||"بدون تعليق",item.kind,
     String(item.published)+"/"+String(item.destinations)]){
     tr.append(element("td",String(value)));
   }tbody.append(tr);
 }
 const setup=$("setup");
 setup.classList.toggle("hidden",me.role==="VIEWER");
 for(const select of document.querySelectorAll(".route-select")){
   select.replaceChildren();
   for(const route of catalog.routes){
     const option=document.createElement("option");
     option.value=route.id;option.textContent=route.slug;select.append(option);
   }
 }
 const targets=$("destination-select");targets.replaceChildren();
 for(const destination of catalog.destinations){
   const option=document.createElement("option");
   option.value=destination.id;
   option.textContent=destination.platform+" — "+destination.display_name;
   targets.append(option);
 }
}
async function submitSetup(formId,makeRequest){
 const form=$(formId);
 form.addEventListener("submit",async event=>{
   event.preventDefault();notice("");
   const data=new FormData(form);
   try{
     const {path,body,method="POST"}=makeRequest(data);
     await request(path,{method,headers:{"content-type":"application/json","x-csrf-token":csrf},
       body:JSON.stringify(body)});
     notice("تم حفظ الإعداد كمسودة معطلة؛ لن يبدأ النشر قبل ربط الحسابات.");
     await render();
   }catch{notice("تعذر حفظ الإعداد. راجع البيانات أو تأكد من الصلاحيات.");}
 });
}
void submitSetup("source-form",d=>({
 path:"/api/setup/source",
 body:{slug:String(d.get("slug")),label:String(d.get("label")),peerId:String(d.get("peerId"))}
}));
void submitSetup("destination-form",d=>({
 path:"/api/setup/destination",
 body:{platform:String(d.get("platform")),displayName:String(d.get("displayName")),
   accountId:String(d.get("accountId"))}
}));
void submitSetup("attach-form",d=>({
 path:"/api/setup/attach",
 body:{routeId:String(d.get("routeId")),destinationId:String(d.get("destinationId"))}
}));
void submitSetup("schedule-form",d=>({
 method:"PUT",path:"/api/schedules/"+encodeURIComponent(String(d.get("routeId"))),
 body:{timeZone:String(d.get("timeZone")),isoWeekdays:String(d.get("isoWeekdays")).split(",").map(Number),
   slots:String(d.get("slots")).split(",").map(v=>v.trim()).filter(Boolean),
   dailyLimit:Number(d.get("dailyLimit"))}
}));
async function restore(){
 try{await request("/api/me");const auth=await request("/api/auth/csrf");csrf=auth.csrfToken;await render();}
 catch{$("dashboard").classList.add("hidden");$("login-panel").classList.remove("hidden");}
}
$("login-form").addEventListener("submit",async event=>{
 event.preventDefault();notice("");
 const form=new FormData(event.currentTarget);
 try{
   const result=await request("/api/auth/login",{method:"POST",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({email:form.get("email"),password:form.get("password")})
   });
   csrf=result.csrfToken;
   event.currentTarget.reset();
   await render();
 }catch{notice("تعذر تسجيل الدخول. تحقق من البيانات أو أعد المحاولة لاحقًا.");}
});
$("logout").addEventListener("click",async()=>{
 try{await request("/api/auth/logout",{method:"POST",headers:{"x-csrf-token":csrf}});}
 catch{notice("تعذر تسجيل الخروج عبر الخادم.");return;}
 csrf="";$("dashboard").classList.add("hidden");$("login-panel").classList.remove("hidden");
 $("logout").classList.add("hidden");notice("");
});
restore();
