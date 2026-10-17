import type {Pool} from "pg";
export async function dashboardSnapshot(pool:Pool){
 const [routes,sources,destinations,queue,publications]=await Promise.all([
   pool.query<{id:string;slug:string;enabled:boolean;source_label:string;last_indexed_message_id:string|null}>(
     `SELECT r.id,r.slug,r.enabled,s.label AS source_label,
        s.last_indexed_message_id::text
       FROM routes r JOIN content_sources s ON s.id=r.source_id ORDER BY r.slug`
   ),
   pool.query<{total:number;connected:number}>(
     "SELECT count(*)::int AS total,count(*) FILTER (WHERE enabled=true)::int AS connected FROM content_sources"
   ),
   pool.query<{total:number;active:number}>(
     `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE enabled=true AND credentials_ciphertext IS NOT NULL)::int AS active
       FROM destinations`
   ),
   pool.query<{state:string;count:number}>(
     "SELECT state,count(*)::int AS count FROM outbox_jobs GROUP BY state ORDER BY state"
   ),
   pool.query<{state:string;count:number}>(
     "SELECT state,count(*)::int AS count FROM publication_records GROUP BY state ORDER BY state"
   )
 ]);
 return {
   routes:routes.rows,
   sources:sources.rows[0]??{total:0,connected:0},
   destinations:destinations.rows[0]??{total:0,active:0},
   queue:Object.fromEntries(queue.rows.map(r=>[r.state,r.count])),
   publications:Object.fromEntries(publications.rows.map(r=>[r.state,r.count])),
   configured:destinations.rows.some(d=>d.active>0)
 };
}
export async function queuePreview(pool:Pool,limit=50){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new RangeError("Invalid queue limit");
 const items=await pool.query(
   `SELECT si.id,si.kind,left(coalesce(si.caption,''),180) AS caption,
     si.source_created_at,r.slug,
     count(pr.id)::int AS destinations,
     count(pr.id) FILTER(WHERE pr.state='CONFIRMED')::int AS published
    FROM source_items si
    JOIN routes r ON r.id=si.route_id
    LEFT JOIN publication_records pr ON pr.source_item_id=si.id
    GROUP BY si.id,r.slug
    ORDER BY si.source_created_at,si.id LIMIT $1`,[limit]
 );
 return items.rows;
}
export async function schedulesPreview(pool:Pool){
 const schedules=await pool.query(
   `SELECT sr.route_id,r.slug,sr.time_zone,sr.iso_weekdays,sr.slots,
     sr.daily_limit,sr.enabled
     FROM schedule_rules sr JOIN routes r ON r.id=sr.route_id ORDER BY r.slug`
 );
 return schedules.rows;
}
