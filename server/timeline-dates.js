'use strict';
const {calendarDate}=require('./account-store');
const formatters=new Map();
function zone(value='Asia/Taipei') {
 if(typeof value!=='string'||value.length>100)throw Error('Invalid time zone');
 return new Intl.DateTimeFormat('en-CA',{timeZone:value}).resolvedOptions().timeZone;
}
function localDay(milliseconds,timeZone) {
 const date=new Date(milliseconds);if(!Number.isFinite(date.getTime()))return null;
 let formatter=formatters.get(timeZone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});formatters.set(timeZone,formatter);while(formatters.size>16)formatters.delete(formatters.keys().next().value);}
 const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 const value=`${parts.year}-${parts.month}-${parts.day}`;return calendarDate(value)?value:null;
}
function photoDay(row,timeZone) {
 const taken=row.datetaken??row.date;
 if(typeof taken==='string') {
  const m=/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(taken);
  if(m&&calendarDate(m[1])&&Number(m[2]||0)<24&&Number(m[3]||0)<60&&Number(m[4]||0)<60) {
   if(!m[5])return m[1];const parsed=Date.parse(taken.replace(' ','T'));if(Number.isFinite(parsed))return localDay(parsed,timeZone);
  }
 }
 const upload=row.dateupload;
 if((typeof upload==='number'||typeof upload==='string'&&/^\d+(?:\.\d+)?$/.test(upload))&&Number.isFinite(Number(upload))&&Number(upload)>=0)return localDay(Number(upload)*1000,timeZone);
 if(Number.isSafeInteger(row.createdAt)&&row.createdAt>=0)return localDay(row.createdAt,timeZone);
 return null;
}
function ageRange(birthDate,age) {
 if(!calendarDate(birthDate)||!Number.isSafeInteger(age)||age<0||age>200)throw Error('Invalid age');
 const [year,month,day]=birthDate.split('-').map(Number);
 const anniversary=offset=>{const d=new Date(0);d.setUTCFullYear(year+offset,month-1,day);return d.toISOString().slice(0,10);};
 const from=anniversary(age),before=anniversary(age+1);if(!calendarDate(from)||!calendarDate(before))throw Error('Invalid age range');
 return {from,before};
}
function yearsAt(birthDate,day) {
 let years=Number(day.slice(0,4))-Number(birthDate.slice(0,4));
 if(day.slice(5)<birthDate.slice(5))years--;return years;
}
module.exports={zone,photoDay,ageRange,yearsAt};
