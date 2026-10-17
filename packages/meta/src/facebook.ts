import {MetaGraphClient,graphId,assertStagedMediaUrl} from "./graph.ts";
/** Authorized Facebook Page publishing adapter. Account linking comes later. */
export class FacebookPagePublisher {
 private readonly graph:MetaGraphClient;
 private readonly mediaHost:string;
 constructor(graph:MetaGraphClient,mediaHost:string){this.graph=graph;this.mediaHost=mediaHost;}
 async publishText(pageId:string,token:string,message:string):Promise<string>{
   if(!message.trim())throw new RangeError("Text post cannot be blank");
   return graphId(await this.graph.post(pageId+"/feed",token,{message}));
 }
 async publishImage(pageId:string,token:string,imageUrl:string,caption:string):Promise<string>{
   assertStagedMediaUrl(imageUrl,this.mediaHost);
   return graphId(await this.graph.post(pageId+"/photos",token,{url:imageUrl,caption}));
 }
 // Video uploads and albums require a separate resumable media workflow.
}
