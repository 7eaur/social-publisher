import type {Pool} from "pg";
import {getDueSlot,type ScheduleRule,type IsoWeekday} from "../../core/src/schedule.ts";
import {withinTransaction} from "./pool.ts";
import {createDeliveryIntent} from "./outbox.ts";

interface RouteRow {id:string;}
interface RuleRow {route_id:string;time_zone:string;iso_weekdays:number[];slots:string[];daily_limit:number;enabled:boolean;}

export interface EnqueueSummary {readonly claimed:number;readonly destinationJobs:number;}

/**
 * Atomic due-slot reservation and creation of per-destination delivery intents.
 * Fail closed when ANY intended destination is disconnected or no source item exists.
 * No external network call occurs inside this DB transaction.
 */
export async function scheduleDueRoutes(pool:Pool,now=new Date()):Promise<EnqueueSummary>{
 const routes=await pool.query<RouteRow>("SELECT id FROM routes WHERE enabled=true ORDER BY id");
 let claimed=0,destinationJobs=0;
 for(const entry of routes.rows){
   const result=await withinTransaction(pool,async client=>{
     const locked=await client.query<RouteRow>(
       "SELECT id FROM routes WHERE id=$1 AND enabled=true FOR UPDATE",[entry.id]
     );
     if(!locked.rows[0])return 0;
     const schedules=await client.query<RuleRow>(
       "SELECT route_id,time_zone,iso_weekdays,slots,daily_limit,enabled FROM schedule_rules WHERE route_id=$1",
       [entry.id]
     );
     const row=schedules.rows[0];if(!row||!row.enabled)return 0;
     const rule:ScheduleRule={routeId:entry.id,enabled:true,timeZone:row.time_zone,
       isoWeekdays:row.iso_weekdays as IsoWeekday[],slots:row.slots,dailyLimit:row.daily_limit};
     const accounts=await client.query<{id:string;enabled:boolean;configured:boolean}>(
       `SELECT d.id,d.enabled,(d.credentials_ciphertext IS NOT NULL) AS configured
        FROM route_destinations rd JOIN destinations d ON d.id=rd.destination_id
        WHERE rd.route_id=$1 ORDER BY d.id`,[entry.id]
     );
     if(accounts.rows.length===0||accounts.rows.some(a=>!a.enabled||!a.configured))return 0;
     // The route lock serializes quota checking and slot creation.
     const localDateFormat=new Intl.DateTimeFormat("en-CA",{
       timeZone:rule.timeZone,year:"numeric",month:"2-digit",day:"2-digit"
     });
     const components=Object.fromEntries(localDateFormat.formatToParts(now).map(p=>[p.type,p.value]));
     const localDate=[components.year,components.month,components.day].join("-");
     const reserved=await client.query<{slot:string}>(
       "SELECT slot FROM schedule_claims WHERE route_id=$1 AND local_date=$2::date",
       [entry.id,localDate]
     );
     const due=getDueSlot(rule,now,reserved.rows.length,new Set(reserved.rows.map(r=>r.slot)));
     if(!due)return 0;
     const eligible=await client.query<{id:string}>(
       `SELECT si.id FROM source_items si
        WHERE si.route_id=$1
          AND NOT EXISTS(SELECT 1 FROM schedule_claims sc
            WHERE sc.route_id=si.route_id AND sc.source_item_id=si.id)
          AND NOT EXISTS(SELECT 1 FROM source_message_parts sp
            WHERE sp.source_item_id=si.id AND sp.indexed_at>now()-interval '10 minutes')
        ORDER BY si.source_created_at,si.canonical_message_id
        LIMIT 1`,[entry.id]
     );
     const itemId=eligible.rows[0]?.id;if(!itemId)return 0;
     const inserted=await client.query<{id:string}>(
       `INSERT INTO schedule_claims(route_id,source_item_id,local_date,slot)
        VALUES($1,$2,$3::date,$4) ON CONFLICT DO NOTHING RETURNING id`,
       [entry.id,itemId,due.localDate,due.slot]
     );
     if(!inserted.rows[0])return 0;
     for(const account of accounts.rows){
       const delivery=await createDeliveryIntent(client,itemId,account.id);
       if(!delivery)throw new Error("Delivery intent collision after schedule claim");
     }
     return accounts.rows.length;
   });
   if(result>0){claimed++;destinationJobs+=result;}
 }
 return {claimed,destinationJobs};
}
