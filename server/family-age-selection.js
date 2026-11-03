'use strict';
// A display projection of an already complete, authority-checked inventory.
// This module performs no provider reads, caches, writes or media admission.
const {calendarDate}=require('./account-store');
const {zone,photoDay,ageRange,yearsAt}=require('./timeline-dates');
function familyAgeSelection(snapshot,{owner,album,birthDate,age,timeZone}) {
 if(typeof owner!=='string'||!owner||owner.length>128||typeof album!=='string'||!/^\d{1,32}$/.test(album)||!calendarDate(birthDate)||!Number.isSafeInteger(age)||age<0||age>150||typeof timeZone!=='string'||!timeZone)throw Error('Invalid age selection scope');
 const canonicalZone=zone(timeZone),range=ageRange(birthDate,age);
 if(!snapshot||!Array.isArray(snapshot.rows)||!Number.isSafeInteger(snapshot.total)||snapshot.total<0||snapshot.total>50000||snapshot.rows.length!==snapshot.total||typeof snapshot.version!=='string'||!/^[a-f0-9]{64}$/.test(snapshot.version))throw Error('Incomplete age selection inventory');
 const selected=[],seen=new Set(),counts=new Map();
 for(const row of snapshot.rows){
  if(!row||typeof row.id!=='string'||!/^\d{1,32}$/.test(row.id)||seen.has(row.id))throw Error('Invalid age selection inventory');
  seen.add(row.id);
  // Match the shipped client's calendar convention. Do not turn a missing
  // provider date normalized to epoch zero into proof that an age is absent.
  let day=photoDay({datetaken:row.datetaken},canonicalZone);
  if(!day&&((typeof row.dateupload==='number')||(typeof row.dateupload==='string'&&/^\d+(?:\.\d+)?$/.test(row.dateupload)))&&Number.isFinite(Number(row.dateupload))&&Number(row.dateupload)>0)day=photoDay({dateupload:row.dateupload},canonicalZone);
  if(!day)return {supported:false,reason:'calendar_unverifiable'};
  const years=yearsAt(birthDate,day);
  if(!Number.isSafeInteger(years))return {supported:false,reason:'calendar_unverifiable'};
  counts.set(years,(counts.get(years)||0)+1);
  if(years===age)selected.push(row);
 }
 const ageCounts=Object.fromEntries([...counts.entries()].sort((a,b)=>a[0]-b[0]).map(([years,count])=>[String(years),count]));
 return {supported:true,rows:selected,proof:{protocol:'complete-age-v1',complete:true,user_id:owner,album_id:album,birth_date:birthDate,age,time_zone:timeZone,canonical_time_zone:canonicalZone,calendar_method:'timeline-dates-v1',from:range.from,before:range.before,source_total:snapshot.total,selected_total:selected.length,inventory_revision:snapshot.version,age_counts:ageCounts}};
}
module.exports={familyAgeSelection};
