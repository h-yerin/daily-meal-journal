
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
const POSTER_FONT='"JournalHand", "Malgun Gothic", sans-serif';
const INK="#3c5131",PAPER="#fcfaf1",PINK="#ff9d93";
function rect(x,y,w,h,r,fill,stroke=null,sw=2){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=sw;c.stroke()}}
function tx(s,x,y,size=32,color=INK,weight="700",align="left"){c.font=`${weight} ${size}px ${POSTER_FONT}`;c.fillStyle=color;c.textAlign=align;c.textBaseline="top";c.fillText(s,x,y)}
function ln(x,y,xx,yy,col="#98ac7d",width=2,dash=[]){c.save();c.beginPath();c.setLineDash(dash);c.moveTo(x,y);c.lineTo(xx,yy);c.strokeStyle=col;c.lineWidth=width;c.stroke();c.restore()}
function heart(x,y,size=20){c.save();c.translate(x,y);c.scale(size/20,size/20);c.beginPath();c.moveTo(10,20);c.bezierCurveTo(-7,1,7,-6,10,6);c.bezierCurveTo(14,-9,29,1,10,20);c.strokeStyle=PINK;c.lineWidth=3;c.lineJoin="round";c.stroke();c.restore()}
function flower(x,y,s=1,outlined=false){c.save();c.translate(x,y);c.scale(s,s);for(let i=0;i<5;i++){c.save();c.rotate(i*Math.PI*2/5);c.beginPath();c.ellipse(0,-9,6,9,0,0,Math.PI*2);c.fillStyle=outlined?PAPER:"#ffb5aa";c.fill();if(outlined){c.strokeStyle="#7d925e";c.lineWidth=2;c.stroke()}c.restore()}c.beginPath();c.arc(0,0,4,0,Math.PI*2);c.fillStyle=outlined?"#e2cf7c":PAPER;c.fill();c.restore()}
function leaf(x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);ln(0,20,12,-16,"#6b8151",2);for(const [a,b,r] of [[4,5,-.7],[8,-4,.7],[12,-13,.2]]){c.beginPath();c.ellipse(a+(r<0?-4:4),b,3,8,r,0,Math.PI*2);c.strokeStyle="#6b8151";c.lineWidth=2;c.stroke()}c.restore()}
function paw(x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.fillStyle=PINK;c.beginPath();c.ellipse(0,6,9,7,0,0,Math.PI*2);c.fill();for(const [a,b,r] of [[-12,-4,-.4],[-4,-11,-.1],[6,-10,.2],[13,-2,.5]]){c.beginPath();c.ellipse(a,b,4,6,r,0,Math.PI*2);c.fill()}c.restore()}
function tape(x,y,w=60,h=26,angle=.36){c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=.78;c.beginPath();c.rect(-w/2,-h/2,w,h);c.clip();c.fillStyle="#f4f1df";c.fillRect(-w/2,-h/2,w,h);for(let i=-w/2;i<w/2;i+=12){c.fillStyle="#9ba77d";c.fillRect(i,-h/2,6,h)}for(let j=-h/2;j<h/2;j+=12){c.fillStyle="#84936699";c.fillRect(-w/2,j,w,6)}c.restore()}
// Hand-drawn cat sticker, made of vector paths so exports remain sharp.
function cat(x,y,s=1,sleeping=false,paws=false){
 c.save();c.translate(x,y);c.scale(s,s);c.lineCap="round";c.lineJoin="round";
 if(sleeping){c.beginPath();c.ellipse(34,21,45,24,-.1,0,Math.PI*2);c.fillStyle="#fff8e8";c.fill();c.strokeStyle="#70502e";c.lineWidth=3;c.stroke();c.beginPath();c.moveTo(68,24);c.bezierCurveTo(93,49,36,49,29,38);c.stroke()}
 c.beginPath();c.moveTo(-43,5);c.bezierCurveTo(-44,-5,-37,-17,-35,-34);c.quadraticCurveTo(-32,-48,-17,-27);c.quadraticCurveTo(0,-33,14,-27);c.quadraticCurveTo(32,-53,36,-32);c.lineTo(43,-7);c.bezierCurveTo(61,30,20,38,-9,36);c.bezierCurveTo(-45,35,-51,20,-43,5);c.fillStyle="#fffaf0";c.fill();c.strokeStyle="#70502e";c.lineWidth=3;c.stroke();
 c.save();c.beginPath();c.moveTo(-18,-27);c.quadraticCurveTo(-13,-8,-6,-16);c.lineTo(-2,-29);c.closePath();c.fillStyle="#e9d5ae";c.fill();c.beginPath();c.moveTo(3,-29);c.quadraticCurveTo(3,-8,11,-17);c.lineTo(15,-27);c.fill();c.restore();
 for(const a of [-26,28]){c.beginPath();c.ellipse(a,15,8,5,0,0,Math.PI*2);c.fillStyle="#ffc9b4";c.fill()}
 c.strokeStyle="#5c462b";c.lineWidth=2.8;
 for(const a of [-16,17]){c.beginPath();if(sleeping){c.moveTo(a-4,6);c.quadraticCurveTo(a,11,a+4,6);c.stroke()}else{c.ellipse(a,6,2.8,3.5,0,0,Math.PI*2);c.fillStyle="#5c462b";c.fill()}}
 c.beginPath();c.moveTo(-6,14);c.quadraticCurveTo(-3,21,1,14);c.quadraticCurveTo(5,21,8,14);c.stroke();
 if(paws||sleeping){for(const a of [-28,29]){c.beginPath();c.ellipse(a,34,10,7,0,0,Math.PI*2);c.fillStyle="#fff4df";c.fill();c.stroke()}}
 c.restore();
}
function sleepingCat(x,y,s=1){c.save();c.translate(x,y);c.scale(s,s);c.beginPath();c.moveTo(-25,-65);c.bezierCurveTo(-111,-48,-93,39,-36,35);c.quadraticCurveTo(-13,34,-7,14);c.bezierCurveTo(-47,13,-49,-22,-25,-65);c.fillStyle="#faf3cc";c.fill();c.strokeStyle=INK;c.lineWidth=2.6;c.stroke();for(const a of [-66,-49]){c.beginPath();c.moveTo(a-4,-7);c.quadraticCurveTo(a,-1,a+4,-7);c.stroke()}cat(21,14,.9,true);tx("z",-6,-52,26);tx("z",11,-70,29);tx("z",30,-89,32);heart(81,-40,17);c.restore()}
function lines(s,width,size=30,max=10){const out=[];c.font=`700 ${size}px ${POSTER_FONT}`;for(const raw of String(s||"").split("\n")){if(!raw.trim())continue;let chunk="";for(const ch of raw){if(c.measureText(chunk+ch).width>width&&chunk){out.push(chunk);chunk=ch}else chunk+=ch}if(chunk)out.push(chunk)}if(out.length>max){out.length=max;out[max-1]=out[max-1].slice(0,-1)+"…"}return out}
function textBlock(raw,x,y,w,h,size=34){if(!String(raw).trim()||h<20)return;c.save();c.beginPath();c.rect(x,y,w,h);c.clip();let rows=[];for(;size>21;size--){rows=lines(raw,w,size,100);if(rows.length*size*1.22<=h)break}rows=lines(raw,w,size,Math.max(1,Math.floor(h/(size*1.22))));let yy=y+(h-rows.length*size*1.22)/2;for(const row of rows){tx(row,x+w/2,yy,size,INK,"700","center");yy+=size*1.22}c.restore()}
function photo(img,x,y,w,h){c.save();c.beginPath();c.roundRect(x,y,w,h,16);c.clip();const scale=Math.max(w/img.width,h/img.height),iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);c.restore()}
function load(src){if(!src)return Promise.resolve(null);return new Promise(ok=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>ok(null);im.src=src})}
function label(text,x,y,w){const fill=c.createLinearGradient(x,y,x+w,y+36);fill.addColorStop(0,"#617448");fill.addColorStop(.5,"#708154");fill.addColorStop(1,"#617448");rect(x,y,w,38,20,fill);tx(text,x+w/2,y+2,33,"#fffdf2","700","center")}
function paint(d,photos){
 c.clearRect(0,0,1080,1350);c.fillStyle=PAPER;c.fillRect(0,0,1080,1350);
 for(let x=0;x<1080;x+=27)ln(x,0,x,1350,"#eeeadd",1);
 for(let y=0;y<1350;y+=27)ln(0,y,1080,y,"#eeeadd",1);
 tx("M E A L  J O U R N A L",540,30,27,INK,"700","center");
 tx("오늘의 식단 일기",554,65,54,INK,"700","center");
 cat(330,133,.85);flower(260,123,1.1,true);flower(800,124,1.1,true);leaf(764,116,.7);heart(347,60,15);heart(365,76,12);
 rect(406,138,280,54,15,"#dfe6c3");tx(dateText(d.date),546,148,32,INK,"700","center");tape(689,145,57,23,.85);
 ln(389,167,381,164,INK,3);ln(389,182,383,187,INK,3);ln(723,160,731,156,INK,3);ln(724,175,731,178,INK,3);
 const memo=d.memo.trim(),top=220,bottom=memo?1284:1322,gap=23;
 const weights=MEALS.map(([id])=>{const m=d.meals[id];return (m.status==="skipped"||(!m.photo&&!m.items.trim()))&&!m.snack.photo&&!m.snack.items.trim()? .8:1});
 const unit=(bottom-top-gap*2)/weights.reduce((a,b)=>a+b,0);let y=top;
 MEALS.forEach(([id,name],i)=>{
  const m=d.meals[id],imgs=photos[i],h=unit*weights[i],sn=!!(m.snack.items.trim()||m.snack.photo);
  const empty=m.status==="skipped"||(!m.photo&&!m.items.trim());
  rect(36,y,1008,h,19,"rgba(252,250,241,.96)","#97ad75",2);
  label(name,59,y+12,110);flower(193,y+31,.83);tape(1014,y+12,62,25,.35);
  const contentY=y+59,contentH=h-77,mainRight=sn?738:1022,center=(59+mainRight)/2;
  if(sn){ln(740,y+55,740,y+h-15,"#9db185",1.5,[3,5]);label("간식 / 후식",800,y+43,168)}
  if(empty){const stickerScale=Math.min(1,contentH/230);sleepingCat(center,contentY+contentH*.43,stickerScale);tx("식사하지 않았어요",sn?center:540,contentY+contentH*.74,36,INK,"700","center")}
  else if(imgs.main){const pw=sn?460:590;photo(imgs.main,59,contentY,pw,contentH);const textX=59+pw+18,textW=mainRight-textX-12;textBlock(m.items,textX,contentY+contentH*.17,textW,contentH*.55,35);if(m.items.trim())heart(textX+textW/2-8,contentY+contentH*.74,18)}
  else{textBlock(m.items,79,contentY,mainRight-99,contentH-35,39);heart(center-8,contentY+contentH-27,18)}
  if(sn){const sx=764,sw=248,sy=y+92,sh=h-113;if(imgs.snack){const ph=m.snack.items.trim()?Math.max(40,sh-52):sh;photo(imgs.snack,sx,sy,sw,ph);if(m.snack.items.trim())textBlock(m.snack.items,sx,sy+ph+6,sw,46,31)}else textBlock(m.snack.items,sx,sy,sw,sh,35)}
  y+=h+gap;
 });
 if(memo){leaf(347,1324,.65);paw(389,1317,.75);textBlock(memo,418,1296,288,48,29);heart(714,1307,16);paw(759,1317,.75);leaf(798,1324,.65);ln(902,1320,1034,1320,"#70502e",2);cat(969,1291,.82,false,true);heart(1006,1251,13)}
}
const posterFontReady=document.fonts.load('700 36px "JournalHand"');
async function renderPoster(){const id=++renderId,d=structuredClone(data);await posterFontReady;const p=await Promise.all(MEALS.map(async ([k])=>({main:await load(d.meals[k].photo),snack:await load(d.meals[k].snack.photo)})));if(id===renderId)paint(d,p)}
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
