/** Narrow typed Graph API transport. No tokens in URLs or loggable errors. */
export class UnknownRemoteOutcome extends Error {
 constructor(){super("Remote write outcome is unknown; reconcile before retry");this.name="UnknownRemoteOutcome";}
}
export class DefinitiveRemoteRejection extends Error {
 readonly status:number;
 constructor(status:number){super("Meta rejected the request (HTTP "+status+")");this.name="DefinitiveRemoteRejection";this.status=status;}
}
export class InvalidRemoteResponse extends Error {
 constructor(){super("Unexpected Meta response; remote outcome is unknown");this.name="InvalidRemoteResponse";}
}
export interface GraphConfig {
 readonly version:string;
 readonly apiHost?:string;
 readonly fetcher?:typeof fetch;
}
export class MetaGraphClient {
 private readonly version:string;
 private readonly host:string;
 private readonly fetcher:typeof fetch;
 constructor(config:GraphConfig){
   if(!/^v\d+\.\d+$/.test(config.version))throw new RangeError("Invalid Graph API version");
   this.version=config.version;
   this.host=config.apiHost??"https://graph.facebook.com";
   if(this.host!=="https://graph.facebook.com" && this.host!=="https://graph-video.facebook.com"){
     throw new Error("Unapproved Graph API host");
   }
   this.fetcher=config.fetcher??fetch;
 }
 private async call(method:"GET"|"POST",path:string,token:string,values?:Record<string,string>):
   Promise<Record<string,unknown>>{
   if(!/^\d{1,30}(\/(feed|photos|videos|media|media_publish))?$/.test(path)){
     throw new RangeError("Invalid Graph API resource");
   }
   if(!token||token.length>10000)throw new Error("Meta credential is not configured");
   const url=new URL("/"+this.version+"/"+path,this.host);
   if(method==="GET" && values){
     for(const [k,v] of Object.entries(values))url.searchParams.set(k,v);
   }
   const headers:Record<string,string>={authorization:"Bearer "+token,accept:"application/json"};
   if(method==="POST")headers["content-type"]="application/x-www-form-urlencoded";
   let response:Response;
   try{
     response=await this.fetcher(url,{method,headers,
       ...(method==="POST"?{body:new URLSearchParams(values??{}).toString()}:{}) ,
       signal:AbortSignal.timeout(25000)});
   }catch{throw new UnknownRemoteOutcome();}
   // A remote 5xx or malformed success on a write can still have committed.
   if(response.status>=500)throw new UnknownRemoteOutcome();
   if(!response.ok)throw new DefinitiveRemoteRejection(response.status);
   try{
     const object:unknown=await response.json();
     if(!object||typeof object!=="object"||Array.isArray(object))throw new Error("bad format");
     return object as Record<string,unknown>;
   }catch{throw new InvalidRemoteResponse();}
 }
 async post(path:string,token:string,values:Record<string,string>):Promise<Record<string,unknown>>{
   return this.call("POST",path,token,values);
 }
 async get(path:string,token:string,values?:Record<string,string>):Promise<Record<string,unknown>>{
   return this.call("GET",path,token,values);
 }
}
export function graphId(result:Record<string,unknown>):string {
 if(typeof result.id!=="string"||!/^\d+$/.test(result.id))throw new InvalidRemoteResponse();
 return result.id;
}
export function assertStagedMediaUrl(raw:string,allowedHost:string):void{
 const url=new URL(raw);
 if(url.protocol!=="https:"||url.hostname!==allowedHost||!!url.username||!!url.password||url.port){
   throw new Error("Media URL must be HTTPS on the configured staging host");
 }
}
