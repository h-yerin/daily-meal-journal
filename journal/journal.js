
"use strict";
const MEALS=[["breakfast","아침","☀"],["lunch","점심","♨"],["dinner","저녁","☾"]];
const $=id=>document.getElementById(id),todayKey=()=>key(new Date()),key=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"),parse=s=>new Date(...s.split("-").map((n,i)=>Number(n)-(i===1?1:0))),dateText=s=>{const d=parse(s);return d.getFullYear()+". "+String(d.getMonth()+1).padStart(2,"0")+". "+String(d.getDate()).padStart(2,"0")+" ("+"일월화수목금토"[d.getDay()]+")"},emptyMeal=()=>({status:"none",items:"",photo:"",memo:"",snack:{items:"",photo:"",memo:""}}),blank=s=>({date:s,meals:{breakfast:emptyMeal(),lunch:emptyMeal(),dinner:emptyMeal()},memo:""});
let selected=todayKey(),month=parse(todayKey()),data=blank(selected),db,known=new Set(),t=null,renderId=0,dirty=false,saving=Promise.resolve(),busy=false,photoPending=false,pendingWrites=0;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalize=(x,s)=>{const d=blank(s);if(!x)return d;d.memo=String(x.memo||"");for(const [id] of MEALS){const m=x.meals?.[id]||{};d.meals[id]={...m,memo:String(m.memo||""),status:["logged","skipped","none"].includes(m.status)?m.status:"none",items:String(m.items||""),photo:String(m.photo||""),snack:{...m.snack,memo:String(m.snack?.memo||""),items:String(m.snack?.items||""),photo:String(m.snack?.photo||"")}}}return d};
const has=d=>!!d.memo?.trim()||MEALS.some(([id])=>{const m=d.meals[id];return m.status!=="none"||!!m.items.trim()||!!m.photo||!!m.snack.items.trim()||!!m.snack.photo||!!m.memo?.trim()||!!m.snack.memo?.trim()});
function openDb(name="meal-journal-v2"){return new Promise((ok,no)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("days"))r.result.createObjectStore("days",{keyPath:"date"})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
function dbAll(database){return new Promise((ok,no)=>{const r=database.transaction("days","readonly").objectStore("days").getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
function put(database,entry){return new Promise((ok,no)=>{const tx=database.transaction("days","readwrite");if(has(entry))tx.objectStore("days").put(entry);else tx.objectStore("days").delete(entry.date);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)})}
function get(s){return new Promise((ok,no)=>{const r=db.transaction("days").objectStore("days").get(s);r.onsuccess=()=>ok(normalize(r.result,s));r.onerror=()=>no(r.error)})}
function setBusy(value){busy=value;document.querySelector("main").inert=value}
function status(s){$("status").textContent=s}
async function save(){
 clearTimeout(t);
 if(!db)return false;
 if(!dirty){await saving;return !dirty}
 const snapshot=structuredClone(data);dirty=false;pendingWrites++;
 saving=saving.then(()=>put(db,snapshot)).then(()=>{
  if(has(snapshot))known.add(snapshot.date);else known.delete(snapshot.date);
  status("✓ "+dateText(snapshot.date)+" 기록 저장 완료");calendar();return true;
 }).catch(e=>{console.error(e);dirty=true;status("저장 실패. 입력은 유지됩니다. 백업하거나 다시 저장해 주세요.");return false}).finally(()=>{pendingWrites--});
 return saving;
}
function later(){dirty=true;clearTimeout(t);status("기록 저장 중…");t=setTimeout(save,700);renderPoster()}
async function change(s){if(s===selected||busy||photoPending)return;setBusy(true);try{if(!await save())return;const next=await get(s);selected=s;month=parse(s);data=next;render();status("")}catch(e){status("기록을 불러오지 못했어요. 현재 입력은 유지됩니다.")}finally{setBusy(false)}}
window.addEventListener("beforeunload",e=>{if(dirty||photoPending||pendingWrites){e.preventDefault();e.returnValue=""}});
function calendar(){let year=month.getFullYear(),m=month.getMonth(),first=new Date(year,m,1).getDay(),length=new Date(year,m+1,0).getDate();$("month").textContent=year+"년 "+(m+1)+"월";let h="";for(let i=0;i<first;i++)h+="<span></span>";for(let day=1;day<=length;day++){const s=key(new Date(year,m,day));h+='<button type="button" class="'+(s===selected?"selected ":"")+(s===todayKey()?"today":"")+'" data-date="'+s+'" aria-pressed="'+(s===selected)+'"><span>'+day+'</span>'+(known.has(s)?'<span class="dot"></span>':"<span style='height:5px'></span>")+"</button>"}$("dates").innerHTML=h}
function uploader(id,kind,photo){const lab=kind==="snack"?"간식":"식사";return '<div><label class="upload">'+(photo?'<img src="'+esc(photo)+'" alt="식단 사진">':"")+'<span>'+(photo?"사진 변경":"＋ 사진 추가")+'</span><input type="file" accept="image/*" data-file="'+id+'" data-kind="'+kind+'" aria-label="'+lab+' 사진"></label>'+(photo?'<button type="button" class="small" data-remove="'+id+'" data-kind="'+kind+'">사진 삭제</button>':"")+"</div>"}
function htmlMeal(id,label,ico){const m=data.meals[id],sn=!!(m.snack.items.trim()||m.snack.photo||m.snack.memo?.trim()),active=m.status==="logged";return '<article class="meal"><div class="mealhead"><strong>'+ico+" "+label+'</strong><div class="modes">'+[["logged","식사 기록"],["skipped","건너뜀"],["none","미기록"]].map(([v,n])=>'<button type="button" class="mode '+(v===m.status?"on ":"")+(v==="skipped"?"skip":"")+'" data-state="'+v+'" data-id="'+id+'">'+n+"</button>").join("")+'</div></div><div class="mealbody">'+(active?'<div class="fields"><div><label class="fieldlabel">먹은 음식</label><textarea data-items="'+id+'" placeholder="예: 삶은 달걀 2개&#10;두유 한 잔">'+esc(m.items)+'</textarea></div>'+uploader(id,"main",m.photo)+"</div>"+'<label>식사 메모<textarea data-meal-memo="'+id+'">'+esc(m.memo)+'</textarea></label>':'<p class="sub">'+(m.status==="skipped"?"이 끼니는 건너뛰었어요.":"먹은 음식이 있으면 식사 기록을 눌러주세요.")+"</p>")+'<div class="snackline"><strong>'+label+' 이후 간식 / 후식 <small style="color:#a59b8f">(선택)</small></strong><button type="button" data-snack-toggle="'+id+'">'+(sn?"간식 지우기":"간식 입력")+"</button></div>"+'<div class="fields sfields '+(sn?"show":"")+'" id="s-'+id+'"><div><label class="fieldlabel">간식 / 후식</label><textarea data-snack="'+id+'" placeholder="예: 그릭요거트&#10;블루베리">'+esc(m.snack.items)+'</textarea></div>'+uploader(id,"snack",m.snack.photo)+'</div><label class="sfields '+(sn?"show":"")+'">간식 메모<textarea data-snack-memo="'+id+'">'+esc(m.snack.memo)+'</textarea></label></div></article>'}
function render(){calendar();$("heading").textContent=dateText(selected)+" 식단";$("forms").innerHTML=MEALS.map(([a,b,c])=>htmlMeal(a,b,c)).join("");$("memo").value=data.memo;renderPoster()}
function compress(file){return new Promise((ok,no)=>{if(file.size>20*1024*1024){no(new Error("20MB 이하 사진을 선택해 주세요."));return}const u=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const scale=Math.min(1,1400/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL("image/jpeg",.84))}catch(e){no(e)}};img.onerror=()=>{URL.revokeObjectURL(u);no(new Error("사진을 불러오지 못했어요."))};img.src=u})}
const canvas=$("poster"),c=canvas.getContext("2d");
function rect(x,y,w,h,r,fill,stroke="#d9cbb6",sw=2){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=sw;c.stroke()}}
function tx(s,x,y,size=26,color="#49372d",weight="600",align="left"){c.font=weight+" "+size+'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';c.fillStyle=color;c.textAlign=align;c.textBaseline="top";c.fillText(s,x,y)}
function ln(x,y,xx,yy,col="#c9bdab",width=2,dash=[]){c.beginPath();c.save();c.setLineDash(dash);c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=col;c.lineWidth=width;c.stroke();c.restore()}
function roundLabel(s,x,y,w,fill="#fff1d3",size=22){rect(x,y,w,36,18,fill,"#e6d9bc",1);tx(s,x+w/2,y+5,size,"#4f3e32","700","center")}
function lines(s,width,size=23,max=10){const out=[];c.font="600 "+size+'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';for(const raw of String(s||"").split("\n")){if(!raw.trim())continue;let chunk="";for(const ch of raw){if(c.measureText(chunk+ch).width>width&&chunk){out.push(chunk);chunk=ch}else chunk+=ch}if(chunk)out.push(chunk)}if(out.length>max){out.length=max;out[max-1]=out[max-1].replace(/.$/,"…")}return out}
function items(raw,x,y,w,h,check=true){
 if(h<18)return;
 const list=String(raw||"").split("\n").map(x=>x.trim()).filter(Boolean);if(!list.length)return;
 let size=26,stack=[];
 for(;size>=14;size--){stack=list.flatMap(s=>lines(s,w-(check?30:0),size,100));if(stack.length*(size+6)<=h)break}
 size=Math.max(14,size);const limit=Math.max(1,Math.floor(h/(size+6)));
 if(stack.length>limit){stack=stack.slice(0,limit);stack[limit-1]=stack[limit-1].slice(0,-1)+"…"}
 let yy=y+Math.max(0,(h-stack.length*(size+6))/2);
 c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
 for(const s of stack){if(check){rect(x,yy+4,17,17,3,null,"#739b72",2);tx("✓",x+1,yy-3,18,"#739b72");tx(s,x+30,yy,size)}else tx(s,x,yy,size);yy+=size+6}c.restore();
}
function photo(img,x,y,w,h){c.save();c.beginPath();c.roundRect(x,y,w,h,16);c.clip();const scale=Math.max(w/img.width,h/img.height),iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore();rect(x,y,w,h,16,null,"#e6dacb",1)}
function load(src){if(!src)return Promise.resolve(null);return new Promise(ok=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>ok(null);im.src=src})}
function cat(x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.lineWidth=4;c.strokeStyle="#514037";c.fillStyle="#fffdf8";c.beginPath();c.moveTo(12,65);c.lineTo(12,20);c.quadraticCurveTo(16,8,31,23);c.lineTo(50,35);c.quadraticCurveTo(89,20,112,35);c.lineTo(134,20);c.quadraticCurveTo(147,8,152,24);c.lineTo(154,69);c.quadraticCurveTo(149,114,88,113);c.quadraticCurveTo(9,112,12,65);c.fill();c.stroke();c.fillStyle="#ffdfd2";for(const x of [45,126]){c.beginPath();c.ellipse(x,83,11,6,0,0,7);c.fill()}c.fillStyle="#49372d";for(const x of [61,111]){c.beginPath();c.ellipse(x,69,4,6,0,0,7);c.fill()}tx("ᴥ",83,78,19,"#49372d","700","center");c.fillStyle="#fffdf8";c.strokeStyle="#514037";for(const x of [46,117]){c.beginPath();c.ellipse(x,112,20,14,0,0,7);c.fill();c.stroke()}c.fillStyle="#ffe38c";c.beginPath();c.ellipse(193,98,29,28,0,0,7);c.fill();c.stroke();c.fillStyle="#49372d";for(const x of [185,201]){c.beginPath();c.arc(x,95,3,0,7);c.fill()}c.restore()}
function heart(x,y){tx("♡",x,y,34,"#e89d97","700")}
function ging(y,h){c.fillStyle="#f1f4e0";c.fillRect(0,y,1080,h);for(let x=0;x<1080;x+=34)for(let yy=y;yy<y+h;yy+=34){c.fillStyle=(Math.round(x/34)+Math.round((yy-y)/34))%2?"#dbe6c0":"#e7efcf";c.fillRect(x,yy,17,17)}}
function paint(d,photos){c.clearRect(0,0,1080,1350);c.fillStyle="#fffcf5";c.fillRect(0,0,1080,1350);ging(0,18);ging(1322,28);
c.save();c.translate(37,46);c.rotate(-.06);rect(0,0,226,91,14,"#fbf0de","#c8b5a1",2);tx("Diet",82,10,25,"#715742","500","center");tx("Meal Journal ♡",114,47,25,"#715742","500","center");c.restore();
rect(270,48,546,122,55,"#fffdf8","#584538",4);tx("오늘의 식단 일기",536,78,52,"#49372d","800","center");heart(792,88);ln(409,166,669,166,"#b0c68d",5);cat(834,43,.83);
rect(320,194,440,68,34,"#edf0d5","#d5dfb2",2);tx("▣  "+dateText(d.date),540,208,32,"#49372d","750","center");ln(40,226,307,226,"#dfebc9",15,[16,10]);ln(773,226,1040,226,"#dfebc9",15,[16,10]);
const memo=String(d.memo||"").trim(),hasMemo=!!memo;const top=294,bottom=hasMemo?1134:1248,gap=17,h=(bottom-top-gap*2)/3;
MEALS.forEach(([id,name,ico],i)=>{const m=d.meals[id],imgs=photos[i],y=top+i*(h+gap),x=25,w=1030;rect(x,y,w,h,28,"#fffefa","#baca99",3);
const sn=!!(m.snack.items.trim()||m.snack.photo),left=sn?740:1030;roundLabel(ico+" "+name,x+18,y+13,122,"#fff1cd",22);
const topIn=y+61,innerH=h-78;
if(sn){ln(x+752,y+58,x+752,y+h-20,"#cdd9b4",2,[5,6]);roundLabel("♡ 간식 / 후식",x+776,y+13,225,"#ecf1da",21)}
if(m.status==="skipped"||(!m.photo&&!m.items.trim()))tx("식사하지 않았어요",x+left/2,topIn+innerH/2-17,28,"#a99080","600","center");
else{const pw=imgs.main?(sn?300:390):0;if(imgs.main)photo(imgs.main,x+18,topIn,pw,innerH);items(m.items,x+23+pw+(pw?20:0),topIn,(sn?720:990)-pw-(pw?25:0),innerH,true)}
if(sn){const sx=x+780,sw=247;if(imgs.snack){const ph=m.snack.items.trim()?Math.min(125,innerH*.55):innerH;photo(imgs.snack,sx,topIn,sw,ph);if(m.snack.items.trim())items(m.snack.items,sx,topIn+ph+8,sw,innerH-ph-8,false)}else items(m.snack.items,sx,topIn+9,sw,innerH-18,false)}
});
if(hasMemo){rect(25,1161,1030,134,28,"#fffefa","#cbbda6",2);roundLabel("✎ 하루 메모 ♡",45,1146,225,"#e8efd7",23);lines(memo,940,25,3).forEach((str,i)=>tx(str,60,1197+i*29,25));heart(1006,1170)}
}
async function renderPoster(){const id=++renderId,d=structuredClone(data);await document.fonts.ready;const p=await Promise.all(MEALS.map(async ([k])=>({main:await load(d.meals[k].photo),snack:await load(d.meals[k].snack.photo)})));if(id===renderId)paint(d,p)}
$("dates").onclick=e=>{const b=e.target.closest("[data-date]");if(b)change(b.dataset.date)};$("prev").onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);calendar()};$("next").onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);calendar()};$("today").onclick=()=>change(todayKey());
$("forms").onclick=e=>{const b=e.target.closest("button");if(!b||busy||photoPending)return;if(b.dataset.state){const m=data.meals[b.dataset.id];if(b.dataset.state==="none"&&(m.items||m.photo||m.memo)&&!confirm("식사 기록을 지울까요? 간식 기록은 유지됩니다."))return;m.status=b.dataset.state;if(m.status==="none"){m.items="";m.photo="";m.memo=""}render();later()}else if(b.dataset.snackToggle){const id=b.dataset.snackToggle,m=data.meals[id];if(m.snack.items.trim()||m.snack.photo||m.snack.memo?.trim()){if(!confirm("이 끼니의 간식·후식 기록을 삭제할까요?"))return;m.snack={items:"",photo:"",memo:""};render();later()}else{$("s-"+id).classList.add("show");$("s-"+id).nextElementSibling.classList.add("show");$("s-"+id).querySelector("textarea").focus()}}else if(b.dataset.remove){const m=data.meals[b.dataset.remove];if(b.dataset.kind==="snack")m.snack.photo="";else m.photo="";render();later()}};
$("forms").oninput=e=>{if(e.target.dataset.items)data.meals[e.target.dataset.items].items=e.target.value;else if(e.target.dataset.snack)data.meals[e.target.dataset.snack].snack.items=e.target.value;else if(e.target.dataset.mealMemo)data.meals[e.target.dataset.mealMemo].memo=e.target.value;else if(e.target.dataset.snackMemo)data.meals[e.target.dataset.snackMemo].snack.memo=e.target.value;else return;later()};
$("forms").onchange=async e=>{const b=e.target;if(!b.dataset.file||!b.files?.[0]||photoPending)return;photoPending=true;const target=data.meals[b.dataset.file];try{const photo=await compress(b.files[0]);if(b.dataset.kind==="snack")target.snack.photo=photo;else{target.photo=photo;target.status="logged"}render();later()}catch(err){alert(err.message)}finally{photoPending=false}};
$("memo").oninput=e=>{data.memo=e.target.value;later()};$("save").onclick=save;$("clear").onclick=async()=>{if(busy||photoPending||!confirm("이 날짜의 기록을 정말 지울까요?"))return;const previous=data;data=blank(selected);dirty=true;if(!await save()){data=previous;dirty=true}render()};
$("download").onclick=async()=>{if(photoPending){status("사진 처리 후 다시 저장해 주세요.");return}await renderPoster();canvas.toBlob(b=>{if(!b){alert("이미지 저장 실패");return}const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="식단일기_"+selected+".png";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)},"image/png")};
function downloadJSON(content,name){const url=URL.createObjectURL(new Blob([JSON.stringify(content)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000)}
// Both databases keep their original names and version. Imports never replace a date.
function validateBackup(src){
 const legacy=src?.version===1;
 if((!legacy&&src?.app!=="meal-journal-v2")||!Array.isArray(src.days)||src.days.length>20000)throw Error("지원하지 않는 백업 형식이에요.");
 const seen=new Set();
 const text=(v,max=20000)=>{if(typeof v!=="string"||v.length>max)throw Error("잘못된 텍스트 데이터예요.");return v};
 const photo=v=>{if(v===null||v===""||v===undefined)return "";if(typeof v!=="string"||v.length>22000000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v))throw Error("잘못된 사진 데이터예요.");return v};
 return src.days.map(a=>{
  if(!a||typeof a.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||key(parse(a.date))!==a.date||seen.has(a.date)||!a.meals||typeof a.meals!=="object"||Array.isArray(a.meals))throw Error("잘못되거나 중복된 날짜예요.");
  seen.add(a.date);const d=blank(a.date);d.memo=text(legacy?a.note:a.memo);
  const allowed=legacy?["breakfast","lunch","dinner","morningSnack","afternoonSnack"]:MEALS.map(([id])=>id);
  if(Object.keys(a.meals).some(id=>!allowed.includes(id)))throw Error("알 수 없는 식사 항목이에요.");
  for(const id of allowed){const m=a.meals[id];if(!m){if(!legacy)throw Error("식사 항목이 빠져 있어요.");continue}
   if(typeof m!=="object"||Array.isArray(m))throw Error("잘못된 식사 데이터예요.");
   if(legacy){const entry={items:text(m.menu),memo:text(m.memo),photo:photo(m.photo)};if(id==="morningSnack")d.meals.breakfast.snack=entry;else if(id==="afternoonSnack")d.meals.lunch.snack=entry;else Object.assign(d.meals[id],entry,{status:"logged"})}
   else{if(!["logged","skipped","none"].includes(m.status)||!m.snack)throw Error("잘못된 식사 상태예요.");d.meals[id]={status:m.status,items:text(m.items),memo:text(m.memo??""),photo:photo(m.photo),snack:{items:text(m.snack.items),memo:text(m.snack.memo??""),photo:photo(m.snack.photo)}}}
  }return d;
 });
}
function importMissing(entries){return new Promise((resolve,reject)=>{
 const tx=db.transaction("days","readwrite"),store=tx.objectStore("days");let added=0,skipped=0;
 for(const entry of entries){const r=store.getKey(entry.date);r.onsuccess=()=>{if(r.result!==undefined){skipped++;return}if(has(entry)){store.add(entry);added++}}}
 tx.oncomplete=()=>resolve({added,skipped});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("복원 취소"));
})}
async function restoreDays(entries){
 if(!confirm(entries.length+"일치 기록을 가져올까요? 이미 기록이 있는 날짜는 건너뛰고 그대로 보존합니다."))return;
 const result=await importMissing(entries);known=new Set((await dbAll(db)).filter(has).map(x=>x.date));data=await get(selected);render();status(result.added+"일 추가 · 기존 "+result.skipped+"일 보존");
}
$("backup").onclick=async()=>{if(busy||photoPending)return;try{await save();const days=await dbAll(db);if(dirty){const i=days.findIndex(d=>d.date===selected);if(i>=0)days[i]=structuredClone(data);else days.push(structuredClone(data))}downloadJSON({app:"meal-journal-v2",days},"식단일기_백업_"+todayKey()+".json")}catch(e){status("백업을 만들지 못했어요. 다시 시도해 주세요.")}};
$("restore").onclick=()=>{if(!busy&&!photoPending)$("restorefile").click()};
$("restorefile").onchange=async e=>{const f=e.target.files?.[0];e.target.value="";if(!f||busy||photoPending)return;setBusy(true);try{if(f.size>150*1024*1024)throw Error("백업 파일이 너무 커요.");const clean=validateBackup(JSON.parse(await f.text()));if(!await save())throw Error("현재 기록을 먼저 저장해 주세요.");await restoreDays(clean)}catch(err){alert("백업 가져오기 실패: "+err.message)}finally{setBusy(false)}};
$("legacy").onclick=async()=>{if(busy||photoPending)return;setBusy(true);let old;try{if(!await save())throw Error("현재 기록을 먼저 저장해 주세요.");old=await openDb("daily-meal-journal");const orig=await dbAll(old);if(!orig.length){alert("같은 브라우저의 기존 일기 기록이 없어요. 기존 일기에서 내보낸 JSON 백업을 불러올 수 있어요.");return}await restoreDays(validateBackup({version:1,days:orig}))}catch(err){alert("기존 기록 복사 실패: "+err.message)}finally{old?.close();setBusy(false)}};
(async()=>{try{db=await openDb();known=new Set((await dbAll(db)).filter(has).map(x=>x.date));data=await get(selected);render()}catch(e){console.error(e);render();document.querySelectorAll("button,input,textarea").forEach(el=>el.disabled=true);status("저장소에 접근할 수 없어요. 브라우저 설정을 확인해 주세요.")}})();
