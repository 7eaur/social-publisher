import {MetaGraphClient,graphId,assertStagedMediaUrl} from "./graph.ts";
export class InstagramPublisher {
 constructor(private readonly graph:MetaGraphClient,private readonly mediaHost:string){}
 /** Step 1: create an IG media container, then persist its ID BEFORE the next request. */
 async createImageContainer(igUserId:string,token:string,imageUrl:string,caption:string):Promise<string>{
   assertStagedMediaUrl(imageUrl,this.mediaHost);
   return graphId(await this.graph.post(igUserId+"/media",token,{image_url:imageUrl,caption}));
 }
 /** Step 1 (reel): platform processing must finish before publishing. */
 async createReelContainer(igUserId:string,token:string,videoUrl:string,caption:string):Promise<string>{
   assertStagedMediaUrl(videoUrl,this.mediaHost);
   return graphId(await this.graph.post(igUserId+"/media",token,{
     media_type:"REELS",video_url:videoUrl,caption
   }));
 }
 async status(containerId:string,token:string):Promise<string>{
   const result=await this.graph.get(containerId,token,{fields:"status_code"});
   if(typeof result.status_code!=="string")throw new Error("Missing media processing status");
   return result.status_code;
 }
 /** Step 2: only submit after media is FINISHED and its ID is saved in DB. */
 async publishPreparedContainer(igUserId:string,token:string,containerId:string):Promise<string>{
   if(await this.status(containerId,token)!=="FINISHED")throw new Error("Media not ready");
   return graphId(await this.graph.post(igUserId+"/media_publish",token,{
     creation_id:containerId
   }));
 }
}
