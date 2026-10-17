import type {Pool} from "pg";
import {withinTransaction} from "../../../packages/database/src/pool.ts";

export async function createDraftSource(
 pool:Pool,actorId:string,slug:string,label:string,peerId:string
):Promise<{sourceId:string;routeId:string}>{
 return withinTransaction(pool,async client=>{
   const s=await client.query<{id:string}>(
     "INSERT INTO content_sources(kind,external_peer_id,label,enabled) VALUES('TELEGRAM',$1,$2,false) RETURNING id",
     [peerId,label]
   );
   const sourceId=s.rows[0]!.id;
   const r=await client.query<{id:string}>(
     "INSERT INTO routes(slug,source_id,enabled) VALUES($1,$2,false) RETURNING id",
     [slug,sourceId]
   );
   const routeId=r.rows[0]!.id;
   await client.query(
     "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'SOURCE_DRAFT_CREATE','ROUTE',$2)",
     [actorId,routeId]
   );
   return {sourceId,routeId};
 });
}

export async function createDraftDestination(
 pool:Pool,actorId:string,platform:"FACEBOOK"|"INSTAGRAM",externalAccountId:string,displayName:string
):Promise<string>{
 return withinTransaction(pool,async client=>{
   const r=await client.query<{id:string}>(
     `INSERT INTO destinations(platform,external_account_id,display_name,enabled)
      VALUES($1,$2,$3,false) RETURNING id`,
     [platform,externalAccountId,displayName]
   );
   const id=r.rows[0]!.id;
   await client.query(
     "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'DESTINATION_DRAFT_CREATE','DESTINATION',$2)",
     [actorId,id]
   );
   return id;
 });
}

export async function attachDraftDestination(
 pool:Pool,actorId:string,routeId:string,destinationId:string
):Promise<boolean>{
 return withinTransaction(pool,async client=>{
   const route=await client.query(
     "SELECT id FROM routes WHERE id=$1 FOR UPDATE",[routeId]
   );
   if(!route.rows[0])return false;
   const check=await client.query(
     "SELECT id FROM destinations WHERE id=$1 AND enabled=false",[destinationId]
   );
   if(!check.rows[0])return false;
   await client.query(
     "INSERT INTO route_destinations(route_id,destination_id) VALUES($1,$2)",
     [routeId,destinationId]
   );
   await client.query(
     "INSERT INTO audit_events(actor_user_id,action,entity_type,entity_id) VALUES($1,'ROUTE_ATTACH_DESTINATION','ROUTE',$2)",
     [actorId,routeId]
   );
   return true;
 });
}
