import {randomUUID} from "node:crypto";
import {TelegramClient,Api} from "teleproto";
import {StringSession} from "teleproto/sessions";

export interface TelegramChannelResult {
 readonly peerId:string;
 readonly title:string;
 readonly username:string|null;
}
export interface TelegramGateway {
 sendCode(phone:string):Promise<{isCodeViaApp:boolean}>;
 signInCode(phone:string,code:string):Promise<"AUTHORIZED"|"PASSWORD_REQUIRED">;
 signInPassword(password:string):Promise<void>;
 inspectChannel(reference:string):Promise<TelegramChannelResult>;
 sessionString():string;
 close():Promise<void>;
}
export type TelegramGatewayFactory=(apiId:number,apiHash:string)=>Promise<TelegramGateway>;

function telegramError(error:unknown):string{
 const obj=error as {errorMessage?:string;message?:string};
 return String(obj?.errorMessage??obj?.message??"");
}
function safeChannelReference(value:string):string{
 const raw=value.trim();
 if(/^-100[1-9][0-9]{4,18}$/.test(raw))return raw;
 if(/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(raw))return raw;
 if(/^https?:\/\/(?:www\.)?t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}\/?$/i.test(raw)){
   return "@"+new URL(raw).pathname.slice(1).replace(/\/$/,"");
 }
 throw new TelegramOnboardingError("CHANNEL_REFERENCE_INVALID",400);
}

/** Real MTProto adapter; does not join channels or create Telegram accounts. */
export const createTelegramGateway:TelegramGatewayFactory=async(apiId,apiHash)=>{
 const session=new StringSession("");
 const client=new TelegramClient(session,apiId,apiHash,{connectionRetries:2});
 await client.connect();
 let phoneCodeHash="";
 return {
   async sendCode(phone){
     const sent=await client.sendCode({apiId,apiHash},phone);
     phoneCodeHash=sent.phoneCodeHash;
     return {isCodeViaApp:sent.isCodeViaApp};
   },
   async signInCode(phone,code){
     try{
       const signed=await client.invoke(new Api.auth.SignIn({
         phoneNumber:phone,phoneCodeHash,phoneCode:code
       }));
       if(signed.className==="auth.AuthorizationSignUpRequired"){
         throw new TelegramOnboardingError("ACCOUNT_NOT_REGISTERED",400);
       }
       if(!await client.checkAuthorization()){
         throw new TelegramOnboardingError("TELEGRAM_NOT_AUTHORIZED",400);
       }
       return "AUTHORIZED";
     }catch(error){
       if(telegramError(error).includes("SESSION_PASSWORD_NEEDED"))return "PASSWORD_REQUIRED";
       throw error;
     }
   },
   async signInPassword(password){
     await client.signInWithPassword({apiId,apiHash},{
       password:async()=>password,
       onError:async()=>true
     });
     if(!await client.checkAuthorization()){
       throw new TelegramOnboardingError("TELEGRAM_NOT_AUTHORIZED",400);
     }
   },
   async inspectChannel(reference){
     const ref=safeChannelReference(reference);
     // Never join, subscribe to, or import invite links automatically.
     const entity=await client.getEntity(ref);
     if(entity.className!=="Channel" || !("broadcast" in entity) || !entity.broadcast){
       throw new TelegramOnboardingError("NOT_A_CHANNEL",400);
     }
     // Force a real read using this authorized account, without importing history.
     for await(const _message of client.iterMessages(ref,{limit:1})){break;}
     return {
       peerId:"-100"+entity.id.toString(),
       title:entity.title,
       username:entity.username??null
     };
   },
   sessionString:()=>session.save(),
   close:async()=>{await client.disconnect();}
 };
};

export class TelegramOnboardingError extends Error {
 constructor(readonly code:string,readonly httpStatus=400){super(code);}
}
export type TelegramLoginStage="CODE"|"PASSWORD"|"CHANNEL";
interface Attempt{
 id:string;ownerId:string;stage:TelegramLoginStage;gateway:TelegramGateway;
 apiId:number;apiHash:string;phone:string;createdAt:number;tries:number;
}
/**
 * Pending MTProto keys are never put in browser storage/DB/logs. One bounded
 * challenge per admin. Restart invalidates pending code, not verified sessions.
 */
export class TelegramConnectionWizard {
 private readonly pending=new Map<string,Attempt>();
 private readonly recentlyStarted=new Map<string,number>();
 constructor(private readonly factory:TelegramGatewayFactory=createTelegramGateway,
             private readonly now:()=>number=Date.now){}
 private async forget(ownerId:string){
   const entry=this.pending.get(ownerId);
   this.pending.delete(ownerId);
   if(entry)await entry.gateway.close().catch(()=>{});
 }
 private async current(ownerId:string,attemptId:string,stage:TelegramLoginStage|TelegramLoginStage[]):Promise<Attempt>{
   const existing=this.pending.get(ownerId);
   if(!existing||existing.id!==attemptId)
     throw new TelegramOnboardingError("CHALLENGE_EXPIRED",409);
   if(this.now()-existing.createdAt>10*60_000){
     await this.forget(ownerId);
     throw new TelegramOnboardingError("CHALLENGE_EXPIRED",409);
   }
   if(![stage].flat().includes(existing.stage))
     throw new TelegramOnboardingError("INVALID_CHALLENGE_STEP",409);
   return existing;
 }
 async start(ownerId:string,apiId:number,apiHash:string,phone:string){
   if(!Number.isInteger(apiId)||apiId<1||apiId>2147483647 ||
     !/^[a-zA-Z0-9]{15,128}$/.test(apiHash) ||
     !/^\+[1-9][0-9]{7,14}$/.test(phone)){
     throw new TelegramOnboardingError("INVALID_TELEGRAM_INPUT",400);
   }
   const time=this.now();
   if(time-(this.recentlyStarted.get(ownerId)??0)<60_000)
     throw new TelegramOnboardingError("LOGIN_COOLDOWN",429);
   if(this.pending.size>=20&&!this.pending.has(ownerId))
     throw new TelegramOnboardingError("LOGIN_BUSY",429);
   this.recentlyStarted.set(ownerId,time);
   await this.forget(ownerId);
   let gateway:TelegramGateway|null=null;
   try{
     gateway=await this.factory(apiId,apiHash);
     const code=await gateway.sendCode(phone);
     const id=randomUUID();
     this.pending.set(ownerId,{id,ownerId,stage:"CODE",gateway,apiId,apiHash,phone,createdAt:time,tries:0});
     return {attemptId:id,step:"CODE" as const,delivery:code.isCodeViaApp?"TELEGRAM_APP" as const:"SMS_OR_OTHER" as const,expiresInSeconds:600};
   }catch(error){
     if(gateway)await gateway.close().catch(()=>{});
     if(error instanceof TelegramOnboardingError)throw error;
     const reason=telegramError(error);
     if(/FLOOD|PHONE_NUMBER_FLOOD/.test(reason))throw new TelegramOnboardingError("TELEGRAM_RATE_LIMIT",429);
     if(/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/.test(reason))throw new TelegramOnboardingError("BAD_API_CREDENTIALS",400);
     if(/PHONE_NUMBER_INVALID/.test(reason))throw new TelegramOnboardingError("INVALID_TELEGRAM_INPUT",400);
     throw new TelegramOnboardingError("TELEGRAM_CONNECT_FAILED",502);
   }
 }
 async code(ownerId:string,attemptId:string,code:string){
   const entry=await this.current(ownerId,attemptId,"CODE");
   if(!/^[0-9]{4,8}$/.test(code))throw new TelegramOnboardingError("CODE_INVALID",400);
   entry.tries++;
   if(entry.tries>5){await this.forget(ownerId);throw new TelegramOnboardingError("LOGIN_TOO_MANY_ATTEMPTS",429);}
   try{
     const stage=await entry.gateway.signInCode(entry.phone,code);
     entry.stage=stage==="AUTHORIZED"?"CHANNEL":"PASSWORD";
     entry.tries=0;
     return {step:entry.stage};
   }catch(error){
     const reason=telegramError(error);
     if(/PHONE_CODE_EXPIRED/.test(reason)){await this.forget(ownerId);throw new TelegramOnboardingError("CODE_EXPIRED",409);}
     if(/PHONE_CODE_INVALID|PHONE_CODE_EMPTY/.test(reason))throw new TelegramOnboardingError("CODE_INVALID",400);
     if(error instanceof TelegramOnboardingError)throw error;
     throw new TelegramOnboardingError("TELEGRAM_VERIFY_FAILED",502);
   }
 }
 async password(ownerId:string,attemptId:string,password:string){
   const entry=await this.current(ownerId,attemptId,"PASSWORD");
   if(!password||password.length>256)throw new TelegramOnboardingError("TWO_FACTOR_INVALID",400);
   entry.tries++;
   if(entry.tries>3){await this.forget(ownerId);throw new TelegramOnboardingError("LOGIN_TOO_MANY_ATTEMPTS",429);}
   try{
     await entry.gateway.signInPassword(password);
     entry.stage="CHANNEL";entry.tries=0;
     return {step:"CHANNEL" as const};
   }catch(error){
     if(/PASSWORD_HASH_INVALID/.test(telegramError(error)))throw new TelegramOnboardingError("TWO_FACTOR_INVALID",400);
     throw new TelegramOnboardingError("TWO_FACTOR_FAILED",502);
   }
 }
 async verifyChannel(ownerId:string,attemptId:string,reference:string){
   const entry=await this.current(ownerId,attemptId,"CHANNEL");
   const channelReference=safeChannelReference(reference);
   try{
     const channel=await entry.gateway.inspectChannel(channelReference);
     if(!/^-100[1-9][0-9]{4,18}$/.test(channel.peerId))
       throw new TelegramOnboardingError("CHANNEL_REFERENCE_INVALID",400);
     const sessionString=entry.gateway.sessionString();
     if(!sessionString||sessionString.length>16000)
       throw new TelegramOnboardingError("TELEGRAM_NOT_AUTHORIZED",400);
     return {channel,sessionString,apiId:entry.apiId,apiHash:entry.apiHash};
   }catch(error){
     if(error instanceof TelegramOnboardingError)throw error;
     throw new TelegramOnboardingError("CHANNEL_NOT_ACCESSIBLE",400);
   }
 }
 async finish(ownerId:string,attemptId:string){
   await this.current(ownerId,attemptId,"CHANNEL");
   await this.forget(ownerId);
 }
 async cancel(ownerId:string){await this.forget(ownerId);return {cancelled:true};}
}
