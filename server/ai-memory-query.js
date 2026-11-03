'use strict';
const {photoDay}=require('./timeline-dates');
const GROUPS=[
 ['狗','狗狗','小狗','柴犬','犬','dog'],['貓','貓咪','小貓','cat'],
 ['沙發','sofa','couch'],['睡覺','睡','睡眠','休息','sleeping','sleep'],
 ['海邊','海灘','沙灘','海岸','beach'],['玩沙','堆沙堡','沙堡'],
 ['生日','慶生','生日蛋糕','birthday'],['蠟燭','吹蠟燭','candles'],
 ['小朋友','孩子','兒童','小孩','child','children'],['寶寶','嬰兒','baby'],
 ['旅遊','旅行','出遊','travel'],['客廳','家裡','室內','居家','indoor_home'],
 ['公園','park'],['吃飯','用餐','聚餐','美食','meal'],['全家','家人','家庭','親子'],
];
const STOP=new Set(['找','找出','搜尋','搜索','請','幫','幫我','我','我們','想','要','的','照片','相片','圖片','在','上','裡','裏','中','和','與','有','那','一','些','張','拍','拍攝','了','是','於']);
function localDay(now,timeZone='Asia/Taipei'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 const get=k=>parts.find(p=>p.type===k).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function parseQuery(value,now=Date.now(),timeZone='Asia/Taipei'){
 if(typeof value!=='string'||value.length>200)throw Error('搜尋文字須少於200個字');
 let text=value.normalize('NFKC').toLowerCase().trim(),from=null,before=null;
 const today=localDay(now,timeZone),year=Number(today.slice(0,4));
 const month=text.match(/(?:(\d{4})年)?(\d{1,2})月/),explicit=text.match(/(\d{4})年/);
 const selected=text.includes('前年')?year-2:text.includes('去年')?year-1:text.includes('今年')?year:explicit?Number(explicit[1]):null;
 if(month){const y=month[1]?Number(month[1]):selected??year,m=Number(month[2]);if(m<1||m>12)throw Error('月份無效');from=`${y}-${String(m).padStart(2,'0')}-01`;before=m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,'0')}-01`;}
 else if(selected!==null){from=`${selected}-01-01`;before=`${selected+1}-01-01`;}
 text=text.replace(/前年|去年|今年|\d{4}年|\d{1,2}月/g,'');
 const groups=[];
 for(const group of GROUPS)if(group.some(term=>text.includes(term))){groups.push(group);for(const term of [...group].sort((a,b)=>b.length-a.length))text=text.split(term).join(' ');}
 const terms=[...new Intl.Segmenter('zh-Hant',{granularity:'word'}).segment(text)].filter(s=>s.isWordLike).map(s=>s.segment).filter(s=>!STOP.has(s));
 return {from,before,groups,terms:[...new Set(terms)],empty:!value.trim()};
}
function matchPhoto(query,row,result,timeZone){
 const day=photoDay(row,timeZone);if((query.from||query.before)&&(!day||day<query.from||day>=query.before))return null;
 // Search the editable account text. Hidden raw model fields must not keep an
 // incorrect tag searchable after a person has corrected the description.
 const haystack=[row.title,row.tags,row.description,result?.description,...(result?.tags||[])].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
 if(query.groups.some(group=>!group.some(term=>haystack.includes(term)))||query.terms.some(term=>!haystack.includes(term)))return null;
 return query.groups.length*10+query.terms.length*5+(result?1:0);
}
function cleanResult(raw){
 const text=(v,n)=>{if(typeof v!=='string'||!v.trim()||v.length>n||/[\u0000-\u001f\u007f]/.test(v))throw Error('分析結果格式無效');return v.trim();};
 const list=(v,n=24)=>{if(!Array.isArray(v)||v.length>n)throw Error('分析結果格式無效');return [...new Set(v.map(x=>text(x,60)))];};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!['good','fair','poor'].includes(raw.quality))throw Error('分析結果格式無效');
 const tags=list(raw.tags);if(!tags.length)throw Error('分析標籤不能為空');
 return {description:text(raw.description,1200),tags,scene:text(raw.scene,80),objects:list(raw.objects||[]),activities:list(raw.activities||[]),quality:raw.quality};
}
module.exports={parseQuery,matchPhoto,localDay,cleanResult};
