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
 const [data,queue]=await Promise.all([request("/api/dashboard"),request("/api/queue")]);
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
}
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
