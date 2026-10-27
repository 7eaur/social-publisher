const form=document.getElementById("login-form");
const message=document.getElementById("login-message");
const button=document.getElementById("login-submit");
const visibility=document.getElementById("password-visibility");
const passwordInput=document.getElementById("login-password");
function showMessage(text){
 message.textContent=text;
 message.classList.toggle("hidden",!text);
}
visibility.addEventListener("click",()=>{
 const show=passwordInput.type==="password";
 passwordInput.type=show?"text":"password";
 visibility.textContent=show?"إخفاء":"إظهار";
 visibility.setAttribute("aria-pressed",String(show));
 visibility.setAttribute("aria-label",show?"إخفاء كلمة المرور":"إظهار كلمة المرور");
});
if(new URLSearchParams(window.location.search).get("setup")==="complete"){
 showMessage("تم إنشاء حساب المدير. سجّل الدخول باستخدام البريد وكلمة المرور اللذين اخترتهما.");
 message.classList.add("auth-success");
}
form.addEventListener("submit",async event=>{
 event.preventDefault();
 showMessage("");
 button.disabled=true;
 const label=button.textContent;
 button.textContent="جارٍ التحقق...";
 try{
   const data=new FormData(form);
   const res=await fetch("/api/auth/login",{
     method:"POST",credentials:"same-origin",cache:"no-store",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({email:String(data.get("email")),password:String(data.get("password"))})
   });
   if(!res.ok){
     showMessage(res.status===401?"البريد الإلكتروني أو كلمة المرور غير صحيحة.":"تعذر تسجيل الدخول. تحقق من اتصال النظام وحاول مرة أخرى.");
     return;
   }
   passwordInput.value="";
   window.location.replace("/dashboard");
 }catch{
   showMessage("تعذر الاتصال بالخادم. تأكد من الإنترنت وأعد المحاولة.");
 }finally{
   button.disabled=false;
   button.textContent=label;
 }
});
