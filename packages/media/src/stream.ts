export type SupportedMime="image/jpeg"|"image/png"|"video/mp4";
export interface MediaLimit {readonly mime:SupportedMime;readonly maxBytes:number;}
export function validateMediaLimit(limit:MediaLimit):void{
 if(!["image/jpeg","image/png","video/mp4"].includes(limit.mime) ||
    !Number.isSafeInteger(limit.maxBytes) || limit.maxBytes<1 || limit.maxBytes>1024*1024*1024){
   throw new RangeError("Unsupported MIME or media budget");
 }
}
/** No buffering of an entire Telegram file; abort oversized uploads immediately. */
export async function* boundedMediaStream(
 input:AsyncIterable<Uint8Array>, limit:MediaLimit
):AsyncIterable<Uint8Array>{
 validateMediaLimit(limit);
 let total=0;
 for await(const piece of input){
   if(!(piece instanceof Uint8Array))throw new TypeError("Non-binary media chunk");
   total+=piece.byteLength;
   if(total>limit.maxBytes)throw new RangeError("Media exceeds configured size cap");
   yield piece;
 }
 if(total===0)throw new RangeError("Empty media payload");
}
