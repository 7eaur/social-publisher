const form=document.getElementById("install-form");
const message=document.getElementById("install-message");
const button=document.getElementById("install-submit");
function showMessage(text){
 message.textContent=text;
 message.classList.toggle("hidden",!text);
}
async function verifySetup(){
 try{
   const response=await fetch("/api/install/status",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)return;
   const status=await response.json();
   if(!status.required){window.location.replace("/login");return;}
   if(!status.available){
     document.getElementById("install-hint").textContent="إعداد رمز التثبيت غير متوفر. أضف INSTALL_SETUP_TOKEN في Railway قبل المتابعة.";
     button.disabled=true;
   }
 }catch{showMessage("تعذر التحقق من حالة التهيئة. حاول تحديث الصفحة.");}
}
form.addEventListener("submit",async event=>{
 event.preventDefault();
 showMessage("");
 button.disabled=true;
 const label=button.textContent;
 button.textContent="جارٍ إنشاء الحساب...";
 try{
   const data=new FormData(form);
   const response=await fetch("/api/install/admin",{
     method:"POST",credentials:"same-origin",cache:"no-store",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({setupToken:String(data.get("setupToken")),email:String(data.get("email")),password:String(data.get("password"))})
   });
   if(response.status===409){window.location.replace("/login");return;}
   if(!response.ok){
     showMessage(response.status===403?"رمز التثبيت غير صحيح.":response.status===503?"إعداد التثبيت غير متاح.":"تعذر إنشاء المدير. راجع المدخلات وأعد المحاولة.");
     return;
   }
   form.reset();
   window.location.replace("/login?setup=complete");
 }catch{showMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");}
 finally{button.disabled=false;button.textContent=label;}
});
void verifySetup();
