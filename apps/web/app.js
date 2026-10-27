/* Browser UI: same-origin HttpOnly cookie, no secret/token persistence. */
const $ = id => document.getElementById(id);
const tgWizard = { attemptId:null, stage:"ACCOUNT" };
const state = { csrf:"", me:null, catalog:{routes:[],sources:[],destinations:[]}, summary:null, queue:[], schedules:[], integrations:[] };
const names = {overview:"نظرة عامة",routes:"مسارات المحتوى",queue:"قائمة المحتوى",planner:"التقويم والجدولة",accounts:"الحسابات والمصادر",settings:"الإعداد والأمان"};
const days = ["الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"];
const kindNames={TEXT:"نص",IMAGE:"صورة",VIDEO:"فيديو",IMAGE_ALBUM:"ألبوم صور",VIDEO_ALBUM:"ألبوم فيديو",MIXED_ALBUM:"ألبوم مختلط"};
function el(tag,text="",className=""){
 const node=document.createElement(tag);
 node.textContent=String(text ?? "");
 if(className)node.className=className;
 return node;
}
function empty(container,title,detail=""){
 const node=el("div","","empty-state");
 node.append(el("strong",title),el("span",detail));
 container.append(node);
}
function notice(message=""){$("notice").textContent=message; if(message)window.scrollTo({top:0,behavior:"smooth"});}
function count(id,value){$(id).textContent=String(value??0);}
function badge(label,kind=""){return el("span",label,"status-badge "+kind);}
async function request(path,opts={}){
 const res=await fetch(path,{credentials:"same-origin",cache:"no-store",...opts});
 if(!res.ok){
   const failure=await res.json().catch(()=>({}));
   const code=failure.error || "HTTP_"+res.status;
   if (res.status===401) window.location.replace("/login");
   throw new Error(code);
 }
 return res.json();
}
const errors={
 TELEGRAM_CONNECT_FAILED:"تعذّر الاتصال بخوادم تيليجرام. تحقق من API ID وAPI Hash والاتصال.",
 BAD_API_CREDENTIALS:"API ID أو API Hash غير صحيح، أو مقيد بواسطة Telegram.",
 TELEGRAM_RATE_LIMIT:"تيليجرام فرض مهلة حماية مؤقتة. لا تكرر طلب الأكواد سريعًا.",
 LOGIN_COOLDOWN:"انتظر دقيقة قبل طلب رمز تحقق جديد.",
 LOGIN_BUSY:"عدد طلبات الربط المتزامنة مرتفع. أعد المحاولة.",
 CHALLENGE_EXPIRED:"انتهت صلاحية محاولة التحقق. ابدأ ربط الحساب مجددًا.",
 INVALID_CHALLENGE_STEP:"هذه المرحلة من التحقق غير متاحة بعد.",
 INVALID_TELEGRAM_INPUT:"تحقق من رقم الهاتف الدولي وبيانات تطبيق Telegram.",
 CODE_INVALID:"رمز الدخول غير صحيح.",
 CODE_EXPIRED:"انتهت صلاحية الرمز؛ ابدأ الربط من جديد.",
 LOGIN_TOO_MANY_ATTEMPTS:"تجاوزت الحد المسموح لمحاولات التحقق. ابدأ من جديد لاحقًا.",
 TWO_FACTOR_INVALID:"كلمة مرور التحقق بخطوتين غير صحيحة.",
 TWO_FACTOR_FAILED:"تعذّر استكمال التحقق بخطوتين. أعد المحاولة.",
 CHANNEL_REFERENCE_INVALID:"أدخل رابط قناة عامة أو @username أو معرّف -100 صالحًا.",
 CHANNEL_NOT_ACCESSIBLE:"الحساب لا يستطيع الوصول إلى القناة أو قراءة محتواها. تحقق من العضوية والمعرّف.",
 NOT_A_CHANNEL:"المعرّف لا يشير إلى قناة تيليجرام.",
 TELEGRAM_VERIFY_FAILED:"تعذّر التحقق من الرمز. راجع اتصال Telegram.",
 ACCOUNT_NOT_REGISTERED:"هذا الرقم ليس مرتبطًا بحساب تيليجرام.",
 TELEGRAM_NOT_AUTHORIZED:"لم تكتمل مصادقة حساب تيليجرام.",

 INVALID_CREDENTIALS:"البريد الإلكتروني أو كلمة المرور غير صحيحة.",
 INSTALL_DISABLED:"رمز التثبيت الأولي غير مضبوط في أسرار الاستضافة.",
 INSTALL_DENIED:"رمز التثبيت غير صحيح.",
 ALREADY_INSTALLED:"تم إنشاء حساب المدير مسبقًا. استخدم تسجيل الدخول.",
 INVALID_EMAIL:"تحقق من البريد الإلكتروني.",
 SECRET_STORE_NOT_CONFIGURED:"الخادم لم يجهز مفتاح التشفير بعد. فعّله من مدير أسرار الاستضافة، ثم أعد المحاولة.",
 INVALID_CREDENTIALS:"بيانات الربط غير صالحة أو تجاوزت الحجم المسموح.",
 ADMIN_REQUIRED:"حفظ وإلغاء بيانات الربط متاح للمدير فقط.",
 INVALID_CSRF:"انتهت صلاحية رمز الحماية. سجّل دخولك مجددًا.",
 FORBIDDEN_ORIGIN:"تأكد من الدخول عبر عنوان النظام الرسمي.",
 SOURCE_NOT_FOUND:"هذا المصدر لم يعد موجودًا.",
 DESTINATION_NOT_FOUND:"هذا الحساب لم يعد موجودًا.",
 SOURCE_ALREADY_EXISTS:"المصدر موجود مسبقًا.",
 DESTINATION_ALREADY_EXISTS:"الحساب موجود مسبقًا.",
 DESTINATION_ASSIGNED:"هذا الحساب مرتبط بمسار آخر.",
 INVALID_SCHEDULE:"راجع مواعيد النشر والأيام والحد اليومي.",
 ACCOUNT_OR_SCHEDULE_NOT_READY:"المسار غير جاهز: يلزم توثيق وربط الحسابات والجدول والتحقق قبل التفعيل.",
 DRAFT_NOT_READY:"لم يكتمل إعداد المسودات.",
 UNAUTHORIZED:"انتهت جلسة الدخول.",
 FORBIDDEN:"لا تملك صلاحية تنفيذ هذا الإجراء."
};
function issue(error){notice(errors[error?.message] || "تعذّر إكمال العملية. راجع الإعدادات أو أعد المحاولة.");}
function navigate(){
 const section=location.hash.replace("#","") || "overview";
 const view=names[section]?section:"overview";
 document.querySelectorAll("[data-view]").forEach(x=>x.classList.toggle("hidden",x.dataset.view!==view));
 document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("active",x.dataset.nav===view));
 $("current-location").textContent=names[view];
}
function selectOptions(id,items,makeText,defaultText="اختر من القائمة"){
 const select=$(id);
 if(!select)return;
 const existing=select.value;
 select.replaceChildren(new Option(defaultText,""));
 for(const item of items){ select.append(new Option(makeText(item),item.id)); }
 if(items.some(x=>x.id===existing))select.value=existing;
}
function detailsIcon(platform){
 const node=el("span",platform==="FACEBOOK"?"f":platform==="INSTAGRAM"?"◎":"➤","platform-icon "+(platform==="FACEBOOK"?"fb":platform==="INSTAGRAM"?"ig":"tg"));
 node.setAttribute("aria-hidden","true");
 return node;
}
function statusItem(icon,heading,description,label,tone=""){
 const root=el("div","","status-item");
 root.append(icon);
 const body=el("div","","status-content");body.append(el("b",heading),el("small",description));
 root.append(body,badge(label,tone));
 return root;
}
function renderOverview(){
 const d=state.summary??{};
 count("source-count",d.sources?.total);
 count("destination-count",d.destinations?.total);
 count("queue-count",d.queue?.PENDING);
 count("published-count",d.publications?.CONFIRMED);
 $("source-hint").textContent=String(d.sources?.connected??0)+" مفعّلة";
 $("destination-hint").textContent=String(d.destinations?.active??0)+" تم التحقق منها";
 const configured=Boolean(d.configured);
 $("connection-label").lastChild.textContent=configured?"حسابات مفعّلة":"بدون حسابات مفعلة";
 const routes=$("overview-routes");routes.replaceChildren();
 const items=state.catalog.routes;
 if(!items.length)empty(routes,"لا توجد مسارات بعد","ابدأ بإضافة مصدر تيليجرام من مركز الإعداد.");
 for(const route of items){
   routes.append(statusItem(detailsIcon("TELEGRAM"),route.slug,route.source_label||"مصدر تيليجرام",route.enabled?"مفعّل":"غير مفعّل",route.enabled?"good":"pending"));
 }
 const ready=$("readiness-list");ready.replaceChildren();
 const checks=[
   ["المصادر",state.catalog.sources.length>0,"أضف قناة محددة"],
   ["بيانات جلسات تيليجرام",state.catalog.sources.some(s=>s.has_session&&s.has_api_credentials),"تُحفظ مشفرة"],
   ["وجهات النشر",state.catalog.destinations.length>0,"Facebook وInstagram"],
   ["بيانات حسابات Meta",state.catalog.destinations.some(d=>d.has_credential),"رموز الوصول مشفرة"],
   ["جداول النشر",state.schedules.length>0,"حدد الأيام والأوقات"],
   ["التحقق من النشر الحي",false,"ينتظر اختبارات الربط والمراجعة"]
 ];
 for(const [title,ok,hint] of checks){
   const row=el("div","","readiness-row");
   row.append(el("span",ok?"✓":"·","readiness-icon "+(ok?"ready":"")),el("span",title),el("small",hint));
   ready.append(row);
 }
 const latest=$("overview-queue");latest.replaceChildren();
 if(!state.queue.length)empty(latest,"لم تتم فهرسة أي منشورات","سيظهر المحتوى بعد ربط مصدر تيليجرام.");
 for(const item of state.queue.slice(0,5)){
   latest.append(statusItem(el("span","▤","list-icon"),item.caption||"منشور دون تعليق",item.slug+" · "+(kindNames[item.kind]||item.kind),item.published+"/"+item.destinations));
 }
}
function renderRoutes(){
 const root=$("route-list");root.replaceChildren();
 if(!state.catalog.routes.length){empty(root,"لم يتم إنشاء مسارات","أضف قناة ثم حدد الحسابات والجدول الخاص بها.");return;}
 for(const route of state.catalog.routes){
   const card=el("article","","route-card");
   const top=el("div","","route-top"),h=el("div","","route-header");
   h.append(detailsIcon("TELEGRAM"));
   const info=el("div");info.append(el("h3",route.slug),el("p",route.source_label||"مصدر جديد"));h.append(info);
   top.append(h,badge(route.enabled?"نشط":"معطّل",route.enabled?"good":"pending"));card.append(top);
   const stats=el("div","","route-stats");
   const source=state.catalog.sources.find(s=>s.id===route.source_id);
   const connected=Boolean(source?.has_session&&source?.has_api_credentials);
   stats.append(el("span","جلسة تيليجرام: "+(connected?"محفوظة":"ناقصة")),
     el("span","آخر نقطة: "+(route.last_indexed_message_id??"—")));
   const rule=state.schedules.find(s=>s.route_id===route.id);
   stats.append(el("span",rule?"جدول: "+rule.daily_limit+" يوميًا":"لم يُحدد جدول"));card.append(stats);
   const buttons=el("div","","route-actions");
   const pause=el("button",route.enabled?"إيقاف النشر":"النشر متوقف","small-button");
   pause.type="button";pause.disabled=!route.enabled||state.me.role==="VIEWER";
   pause.addEventListener("click",async()=>{
     try{await mutate("/api/routes/"+encodeURIComponent(route.id)+"/pause");notice("تم إيقاف المسار.");await load();}
     catch(e){issue(e);}
   });
   const link=el("a","إدارة الإعدادات ←","small-button");link.href="#settings";buttons.append(pause,link);card.append(buttons);root.append(card);
 }
}
function renderQueue(){
 const keyword=$("queue-search").value.trim().toLowerCase();
 const list=state.queue.filter(i=>(i.slug+" "+(i.caption||"")+" "+i.kind).toLowerCase().includes(keyword));
 $("queue-total").textContent=list.length+" منشور";
 const tbody=$("queue-rows");tbody.replaceChildren();
 if(!list.length){const tr=el("tr"),td=el("td","لا توجد منشورات مطابقة للبحث.","empty-state");td.colSpan=5;tr.append(td);tbody.append(tr);return;}
 for(const item of list){
   const tr=el("tr");
   tr.append(el("td",item.slug));
   const comment=el("td",item.caption||"بدون تعليق");comment.className="content-preview";comment.title=item.caption||"";tr.append(comment);
   const kind=el("td");kind.append(el("span",kindNames[item.kind]||item.kind,"type-tag"));tr.append(kind);
   tr.append(el("td",item.published+" / "+item.destinations));
   tr.append(el("td",item.source_created_at?new Date(item.source_created_at).toLocaleDateString("ar-YE"):"—"));tbody.append(tr);
 }
}
function renderPlanner(){
 const root=$("calendar-grid");root.replaceChildren();
 for(let day=1;day<=7;day++){
   const card=el("div","","calendar-day");card.append(el("span",days[day-1],"day-name"));
   let n=0;
   for(const sched of state.schedules){
     if(!sched.enabled||!sched.iso_weekdays?.includes(day))continue;
     for(const slot of sched.slots||[]){
       if(n>=5)break;
       card.append(el("span",sched.slug+" · "+slot,"calendar-event"));n++;
     }
   }
   if(n===0)card.append(el("span","لا توجد مواعيد","calendar-none"));
   root.append(card);
 }
 const list=$("schedule-list");list.replaceChildren();
 if(!state.schedules.length)empty(list,"لم تُضبط أي جداول","يمكنك إنشاء جدول من مركز الإعداد.");
 for(const s of state.schedules){
   list.append(statusItem(el("span","▦","list-icon"),s.slug,
     (s.slots||[]).join("، ")+" · "+s.time_zone+" · "+s.daily_limit+" يوميًا",
     s.enabled?"الجدول محفوظ":"غير مفعّل",s.enabled?"good":"pending"));
 }
}
function renderAccounts(){
 const tg=$("telegram-accounts"),social=$("social-accounts");
 tg.replaceChildren();social.replaceChildren();
 if(!state.catalog.sources.length)empty(tg,"لا توجد قنوات","أنشئ مصدرًا من مركز الإعدادات.");
 for(const source of state.catalog.sources){
   const saved=source.has_session&&source.has_api_credentials;
   const item=statusItem(detailsIcon("TELEGRAM"),source.label,
     "معرّف القناة: "+source.external_peer_id,
     saved?"بيانات مشفرة":"لم تُضف الجلسة",saved?"pending":"");
   if(state.me.role==="ADMIN"&&saved)attachRevoke(item,"telegram",source.id);
   tg.append(item);
 }
 if(!state.catalog.destinations.length)empty(social,"لم تُضف حسابات","أضف صفحة Facebook أو حساب Instagram.");
 for(const account of state.catalog.destinations){
   const item=statusItem(detailsIcon(account.platform),account.display_name,
     account.platform+" · "+account.external_account_id,
     account.enabled?"تم التحقق":account.has_credential?"رمز محفوظ":"يحتاج رمزًا",
     account.enabled?"good":account.has_credential?"pending":"");
   if(state.me.role==="ADMIN"&&account.has_credential)attachRevoke(item,"meta",account.id);
   social.append(item);
 }
}
function attachRevoke(item,type,id){
 const btn=el("button","إلغاء الرمز","small-button danger-button");
 btn.type="button";btn.title="حذف بيانات الربط المحفوظة وتعطيل المسار";
 btn.addEventListener("click",async()=>{
   if(!window.confirm("هل تريد إلغاء بيانات الربط وتعطيل المسار المرتبط؟"))return;
   try{await mutate("/api/setup/"+type+"/"+encodeURIComponent(id)+"/credentials",{method:"DELETE"});notice("أُلغيت بيانات الربط وحُفظ تعطيل المسار.");await load();}
   catch(e){issue(e);}
 });
 item.append(btn);
}
function renderSetup(){
 for(const select of document.querySelectorAll(".route-select")){
   const current=select.value;select.replaceChildren(new Option("اختر المسار",""));
   for(const r of state.catalog.routes)select.append(new Option(r.slug,r.id));
   if(state.catalog.routes.some(r=>r.id===current))select.value=current;
 }
 selectOptions("destination-select",state.catalog.destinations,d=>d.platform+" — "+d.display_name);
 selectOptions("telegram-secret-source",state.catalog.sources,s=>s.label);
 selectOptions("meta-secret-destination",state.catalog.destinations,d=>d.platform+" — "+d.display_name);
 const vault=$("integration-status-list");vault.replaceChildren();
 const descriptions={META_APP_ID:"Meta App ID",META_APP_SECRET:"Meta App Secret",
 STORAGE_ACCESS_KEY_ID:"Storage Access Key",STORAGE_SECRET_ACCESS_KEY:"Storage Secret Key",
 STORAGE_BUCKET:"Storage Bucket",STORAGE_REGION:"Storage Region",
 STORAGE_ENDPOINT:"Storage Endpoint",STORAGE_PUBLIC_HOST:"Staging Host"};
 for(const setting of state.integrations){
   const item=statusItem(el("span","◆","list-icon"),descriptions[setting.name]||setting.name,
     "إعداد تثبيت محفوظ داخل الخادم",setting.configured?"محفوظ مشفّر":"غير مضبوط",setting.configured?"pending":"");
   if(setting.configured && state.me.role==="ADMIN"){
     const revoke=el("button","إلغاء","small-button danger-button");revoke.type="button";
     revoke.addEventListener("click",async()=>{
       if(!window.confirm("إلغاء هذا الإعداد وتعطيل مسارات النشر؟"))return;
       try{await mutate("/api/setup/integrations/"+encodeURIComponent(setting.name),{method:"DELETE"});
         notice("أُلغي الإعداد المشفر وأوقفت المسارات.");await load();}
       catch(e){issue(e);}
     });
     item.append(revoke);
   }
   vault.append(item);
 }
 $("vault-section").classList.toggle("hidden",state.me.role!=="ADMIN");
 $("telegram-wizard-panel").classList.toggle("hidden",state.me.role!=="ADMIN");
 const secured=state.catalog.secretStoreReady;
 $("secret-store-indicator").textContent=secured?"خزنة التشفير جاهزة":"مفتاح التشفير لم يُضبط بالخادم";
 $("credential-setup").classList.toggle("hidden",state.me.role!=="ADMIN");
 $("setup").querySelectorAll("form").forEach(form=>{
   if(form.classList.contains("secure-form"))return;
   form.querySelectorAll("input,select,button,textarea").forEach(control=>{control.disabled=state.me.role==="VIEWER"});
 });
}
async function load(){
 const [summary,queue,catalog,me,schedules,integrations]=await Promise.all([
   request("/api/dashboard"),request("/api/queue"),request("/api/setup/catalog"),
   request("/api/me"),request("/api/schedules"),request("/api/setup/integrations")
 ]);
 state.summary=summary;state.queue=queue.items||[];state.catalog=catalog;
 state.me=me;state.schedules=schedules.schedules||[];state.integrations=integrations.integrations||[];
 $("logout").classList.remove("hidden");
 renderOverview();renderRoutes();renderQueue();renderPlanner();renderAccounts();renderSetup();navigate();
}
async function mutate(path,{method="POST",body}={}){
 return request(path,{method,headers:{"x-csrf-token":state.csrf,...(body?{"content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
}
function bindForm(id,makeRequest,opts={}){
 const form=$(id);
 form.addEventListener("submit",async event=>{
   event.preventDefault();notice("");
   const button=form.querySelector('button[type="submit"]');
   const previous=button.textContent;
   button.disabled=true;button.textContent="جارٍ الحفظ...";
   try{
     const d=new FormData(form);
     const action=makeRequest(d);
     await mutate(action.path,{method:action.method||"POST",body:action.body});
     form.reset();
     notice(opts.secret?"حُفظت بيانات الربط مشفرة، وسيبقى الحساب معطلًا حتى التحقق من صلاحياته.":"حُفظت الإعدادات دون تشغيل النشر الحقيقي.");
     await load();
   }catch(error){issue(error);}
   finally{button.disabled=false;button.textContent=previous;}
 });
}
bindForm("source-form",d=>({path:"/api/setup/source",
 body:{slug:String(d.get("slug")),label:String(d.get("label")),peerId:String(d.get("peerId"))}}));
bindForm("destination-form",d=>({path:"/api/setup/destination",
 body:{platform:String(d.get("platform")),displayName:String(d.get("displayName")),accountId:String(d.get("accountId"))}}));
bindForm("attach-form",d=>({path:"/api/setup/attach",
 body:{routeId:String(d.get("routeId")),destinationId:String(d.get("destinationId"))}}));
bindForm("schedule-form",d=>({
 path:"/api/schedules/"+encodeURIComponent(String(d.get("routeId"))),method:"PUT",
 body:{timeZone:String(d.get("timeZone")),isoWeekdays:String(d.get("isoWeekdays")).split(",").map(x=>Number(x.trim())),
 slots:String(d.get("slots")).split(",").map(x=>x.trim()).filter(Boolean),dailyLimit:Number(d.get("dailyLimit"))}
}));
bindForm("telegram-secret-form",d=>({
 path:"/api/setup/telegram/"+encodeURIComponent(String(d.get("sourceId")))+"/credentials",method:"PUT",
 body:{apiId:Number(d.get("apiId")),apiHash:String(d.get("apiHash")),sessionString:String(d.get("sessionString"))}
}),{secret:true});
bindForm("meta-secret-form",d=>({
 path:"/api/setup/meta/"+encodeURIComponent(String(d.get("destinationId")))+"/credentials",method:"PUT",
 body:{accessToken:String(d.get("accessToken"))}
}),{secret:true});
bindForm("integration-secret-form",d=>({
 path:"/api/setup/integrations/"+encodeURIComponent(String(d.get("name"))),method:"PUT",
 body:{value:String(d.get("value"))}
}),{secret:true});

function showTelegramStage(stage){
 tgWizard.stage=stage;
 const ids={ACCOUNT:"tg-connect-account",CODE:"tg-connect-code",PASSWORD:"tg-connect-password",CHANNEL:"tg-connect-channel"};
 for(const [name,id] of Object.entries(ids))$(id).classList.toggle("hidden",name!==stage);
 document.querySelectorAll("[data-tg-step]").forEach(node=>node.classList.toggle("selected",node.dataset.tgStep===stage));
 $("tg-wizard-cancel").classList.toggle("hidden",stage==="ACCOUNT");
}
function tgStatus(message){$("tg-wizard-status").textContent=message;}
async function telegramForm(id,build,done){
 const form=$(id);
 form.addEventListener("submit",async event=>{
   event.preventDefault();
   const button=form.querySelector('button[type="submit"]');
   const previous=button.textContent;
   button.disabled=true;button.textContent="جارٍ التحقق...";
   try{
     const input=build(new FormData(form));
     const data=await mutate(input.path,{body:input.body});
     form.reset();
     await done(data);
   }catch(error){tgStatus(errors[error?.message]||"تعذّر استكمال الربط. أعد المحاولة.");}
   finally{button.disabled=false;button.textContent=previous;}
 });
}
void telegramForm("tg-connect-account",d=>({
 path:"/api/telegram/connect/start",
 body:{apiId:Number(d.get("apiId")),apiHash:String(d.get("apiHash")),phone:String(d.get("phone")).trim()}
}),async data=>{
 tgWizard.attemptId=data.attemptId;
 showTelegramStage("CODE");
 $("tg-code-hint").textContent=data.delivery==="TELEGRAM_APP"?
  "أرسل Telegram الرمز غالبًا داخل تطبيق تيليجرام على جهاز آخر. أدخل الرمز هنا.":
  "أرسل Telegram الرمز عبر طريقة التحقق المتاحة لحسابك. أدخل الرمز هنا.";
 tgStatus("أُرسل طلب التحقق بنجاح. تبقى صلاحية المحاولة لمدة عشر دقائق.");
});
void telegramForm("tg-connect-code",d=>({
 path:"/api/telegram/connect/code",
 body:{attemptId:tgWizard.attemptId,code:String(d.get("code")).trim()}
}),async data=>{
 showTelegramStage(data.step);
 tgStatus(data.step==="PASSWORD"?"الحساب يستخدم التحقق بخطوتين. أدخل كلمة المرور الإضافية.":"تم تأكيد الرمز. أدخل رابط القناة واختبر صلاحية القراءة.");
});
void telegramForm("tg-connect-password",d=>({
 path:"/api/telegram/connect/password",
 body:{attemptId:tgWizard.attemptId,password:String(d.get("password"))}
}),async()=>{
 showTelegramStage("CHANNEL");
 tgStatus("نجح التحقق بخطوتين. أدخل القناة المرجعية للمحتوى.");
});
void telegramForm("tg-connect-channel",d=>({
 path:"/api/telegram/connect/channel",
 body:{attemptId:tgWizard.attemptId,reference:String(d.get("reference")).trim(),
       slug:String(d.get("slug")).trim(),label:String(d.get("label")).trim()}
}),async data=>{
 tgWizard.attemptId=null;
 showTelegramStage("ACCOUNT");
 tgStatus("تم التحقق من قراءة قناة "+data.channel.title+" وحفظ الجلسة مشفّرة. ستبدأ المزامنة المستقبلية من المنشورات الجديدة فقط، ومسار النشر يبقى معطّلًا.");
 await load();
});
$("tg-wizard-cancel").addEventListener("click",async()=>{
 try{await mutate("/api/telegram/connect/cancel");}
 catch(error){issue(error);}
 tgWizard.attemptId=null;
 showTelegramStage("ACCOUNT");
 tgStatus("ألغيت عملية الربط. لم تُحفظ جلسة مؤقتة.");
});
$("queue-search").addEventListener("input",renderQueue);
window.addEventListener("hashchange",navigate);
$("logout").addEventListener("click",async()=>{
 try {
   await mutate("/api/auth/logout");
   state.csrf="";
   window.location.replace("/login");
 } catch (e) { issue(e); }
});
async function restore(){
 try{
   await request("/api/me");
   const token=await request("/api/auth/csrf");
   state.csrf=token.csrfToken;
   await load();
 }catch(error){
   window.location.replace("/login");
 }
}
void restore();
