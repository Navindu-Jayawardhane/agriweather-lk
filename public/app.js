import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const API="https://api.open-meteo.com/v1/forecast", GEO="https://geocoding-api.open-meteo.com/v1/search";
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
let user=null, farms=[], activeFarm=null, weather=null, chart=null, mode="login";

const $=id=>document.getElementById(id), toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const icon=c=>c===0?"☀️":[1,2].includes(c)?"🌤️":c===3?"☁️":[45,48].includes(c)?"🌫️":[51,53,55,56,57].includes(c)?"🌦️":[61,63,65,66,67,80,81,82].includes(c)?"🌧️":[95,96,99].includes(c)?"⛈️":"🌤️";
const day=d=>new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
function setAuthMessage(m){$("authMessage").textContent=m}

async function geo(q){const r=await fetch(`${GEO}?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);const d=await r.json();if(!d.results?.length)throw Error("Location not found");return d.results[0]}
async function getWeather(lat,lon,days=14){
  const p=new URLSearchParams({latitude:lat,longitude:lon,timezone:"auto",forecast_days:String(Math.min(days,16)),
    current:"temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    hourly:"temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,soil_moisture_0_to_1cm",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration"});
  const r=await fetch(`${API}?${p}`);if(!r.ok)throw Error("Weather service error");return r.json()
}
function currentHour(w){let n=new Date(),i=w.hourly.time.findIndex(x=>new Date(x)>=n);return i<0?0:i}
function insights(w){
  const i=currentHour(w),d=w.daily,h=w.hourly,crop=activeFarm?.crop||"General",rain=d.precipitation_sum[0]||0,prob=d.precipitation_probability_max[0]||0,hum=w.current.relative_humidity_2m,wind=w.current.wind_speed_10m,soil=h.soil_moisture_0_to_1cm[i],t=d.temperature_2m_max[0],e=d.et0_fao_evapotranspiration[0]||0;
  return [
    ["💧","Irrigation",rain>=8||prob>=70?"LOW / DELAY":(soil!=null&&soil<.25&&e>=5?"HIGHER DEMAND":"MONITOR"),rain>=8||prob>=70?"Rain is expected; reassess after rainfall.":"Check field moisture and crop stage before irrigating."],
    ["🧪","Spraying",prob>=60||wind>=25?"NOT IDEAL":hum>=85?"CAUTION":"POTENTIALLY SUITABLE",prob>=60||wind>=25?"Rain or wind may reduce application effectiveness.":"Conditions are relatively calm; verify the product label and local guidance."],
    ["🦠","Disease risk",hum>=85&&rain>=3?"ELEVATED":(hum>=75||rain>=3?"MODERATE":"LOWER"),"A weather indicator only; disease depends on crop, variety and pathogen."],
    ["🌡️","Heat stress",t>=34?"HIGH HEAT":(t>=31?"WATCH":"NORMAL"),t>=31?"Warm conditions can increase crop water demand.":"No strong heat indicator in today's forecast."]
  ]
}
function renderInsights(w){$("insights").innerHTML=insights(w).map(x=>`<div class="insight"><div class="insight-row"><b>${x[0]} ${x[1]}</b><span class="badge ${x[2].includes("HIGH")||x[2].includes("ELEVATED")||x[2].includes("NOT")?"bad":x[2].includes("MODERATE")||x[2].includes("WATCH")||x[2].includes("CAUTION")||x[2].includes("MONITOR")?"warn":"good"}">${esc(x[2])}</span></div><p class="muted small">${esc(x[3])}</p></div>`).join("")}
function renderWeather(w){
  const d=w.daily;$("metrics").innerHTML=[
    ["🌡️","Temperature",`${Math.round(w.current.temperature_2m)} °C`],["💧","Humidity",`${w.current.relative_humidity_2m}%`],
    ["🌧️","Rain chance",`${d.precipitation_probability_max[0]??0}%`],["💨","Wind",`${Math.round(w.current.wind_speed_10m)} km/h`],
    ["🌱","ET₀ today",`${(d.et0_fao_evapotranspiration[0]??0).toFixed(1)} mm`],["🌍","Soil moisture",`${Math.round((w.hourly.soil_moisture_0_to_1cm[currentHour(w)]??0)*100)}%`]
  ].map(x=>`<div class="metric"><small>${x[0]} ${x[1]}</small><strong>${x[2]}</strong></div>`).join("");
  $("forecast").innerHTML=d.time.slice(0,7).map((x,i)=>`<div class="day"><small>${day(x)}</small><div class="icon">${icon(d.weather_code[i])}</div><b>${Math.round(d.temperature_2m_max[i])}° / ${Math.round(d.temperature_2m_min[i])}°</b><span>🌧 ${d.precipitation_probability_max[i]??0}%</span></div>`).join("");
  $("weatherUpdated").textContent="Updated "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  renderInsights(w); renderChart(w)
}
function renderChart(w){
  if(!window.Chart)return;const d=w.daily;if(chart)chart.destroy();
  chart=new Chart($("weatherChart"),{type:"line",data:{labels:d.time.slice(0,7).map(day),datasets:[
    {label:"Max °C",data:d.temperature_2m_max.slice(0,7),borderWidth:2,tension:.35,yAxisID:"t"},
    {label:"Rain %",data:d.precipitation_probability_max.slice(0,7),borderWidth:2,tension:.35,yAxisID:"r"}]},
    options:{responsive:true,interaction:{mode:"index",intersect:false},scales:{t:{position:"left",grid:{color:"#ffffff0b"}},r:{position:"right",min:0,max:100,grid:{drawOnChartArea:false}}},plugins:{legend:{labels:{color:"#91a79a",font:{size:10}}}}}})
}
async function loadWeather(){
  if(!activeFarm)return;
  try{
    let lat=Number(activeFarm.lat),lon=Number(activeFarm.lon);
    if(!lat||!lon){const g=await geo(activeFarm.location);lat=g.latitude;lon=g.longitude;await updateDoc(doc(db,"farms",activeFarm.id),{lat,lon})}
    weather=await getWeather(lat,lon,14);renderWeather(weather);
    $("welcomeTitle").textContent=activeFarm.name;$("farmMeta").textContent=`${activeFarm.crop} • ${activeFarm.area} acres • ${activeFarm.location}`;
    $("nextWindow").textContent="Run advisor";$("nextWindowText").textContent="Open Farming Advisor for candidate dates.";
  }catch(e){toast(e.message)}
}
async function loadFarms(){
  const q=query(collection(db,"farms"),where("ownerId","==",user.uid));
  const s=await getDocs(q);farms=s.docs.map(d=>({id:d.id,...d.data()}));
  $("farmSelect").innerHTML=farms.length?farms.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join(""):`<option value="">No farms yet</option>`;
  activeFarm=farms[0]||null;if(activeFarm)await loadWeather();else showPage("farm");
}
async function loadRecords(){
  if(!activeFarm)return;$("records").innerHTML="Loading…";
  const q=query(collection(db,"harvests"),where("ownerId","==",user.uid),where("farmId","==",activeFarm.id),orderBy("harvestDate","desc"),limit(20));
  try{const s=await getDocs(q);const rows=s.docs.map(d=>d.data());$("records").innerHTML=rows.length?rows.map(r=>`<div class="record"><div><b>${esc(r.crop)}</b><div class="muted small">${esc(r.harvestDate)} • ${esc(r.quality||"No grade")}</div></div><div><b>${Number(r.yieldKg).toLocaleString()} kg</b><div class="muted small">${r.price?`Price/kg: ${Number(r.price).toLocaleString()}`:""}</div></div></div>`).join(""):"<p class='muted'>No harvest records yet.</p>";if(rows[0]){$("latestYield").textContent=`${Number(rows[0].yieldKg).toLocaleString()} kg`;$("latestYieldText").textContent=`${rows[0].crop} • ${rows[0].harvestDate}`}}catch(e){$("records").innerHTML="<p class='muted'>Add an index for harvestDate if Firestore requests one.</p>"}}
async function loadAlerts(){
  if(!activeFarm)return;$("alertsList").innerHTML="Loading…";
  const q=query(collection(db,"alerts"),where("ownerId","==",user.uid),where("farmId","==",activeFarm.id),orderBy("createdAt","desc"),limit(30));
  try{const s=await getDocs(q);$("alertsList").innerHTML=s.docs.length?s.docs.map(d=>{const a=d.data();return`<div class="alert"><div class="symbol">${a.severity==="high"?"🚨":"⚠️"}</div><div><h3>${esc(a.title)}</h3><p>${esc(a.message)}</p><div class="muted small">${a.createdAt?.toDate?a.createdAt.toDate().toLocaleString():"Recent"}</div></div></div>`}).join(""):"<p class='muted'>No automated alerts recorded yet.</p>"}catch(e){$("alertsList").innerHTML="<p class='muted'>No alert index available yet.</p>"}}
function showPage(name){document.querySelectorAll(".page").forEach(p=>p.hidden=true);$(name+"Page").hidden=false;document.querySelectorAll(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===name));if(name==="farm")loadRecords();if(name==="alerts")loadAlerts()}
async function saveSettings(){
  const data={rain:$("nRain").checked,heat:$("nHeat").checked,wind:$("nWind").checked,disease:$("nDisease").checked,irrigation:$("nIrrigation").checked,telegramChatId:$("telegramChatId").value.trim(),whatsappNumber:$("whatsappNumber").value.trim(),severity:$("severity").value};
  await setDoc(doc(db,"users",user.uid),{notificationSettings:data},{merge:true});toast("Notification settings saved")
}
async function loadSettings(){const s=await getDoc(doc(db,"users",user.uid));const n=s.data()?.notificationSettings||{};for(const k of ["rain","heat","wind","disease","irrigation"])$("n"+k[0].toUpperCase()+k.slice(1)).checked=n[k]!==false;$("telegramChatId").value=n.telegramChatId||"";$("whatsappNumber").value=n.whatsappNumber||"";$("severity").value=n.severity||"medium"}
function cropRequirements(crop,activity){
  const base={paddy:{rain:4,heat:34},vegetables:{rain:4,heat:32},tea:{rain:3,heat:30},coconut:{rain:3,heat:34},chilli:{rain:3,heat:32}}[crop]||{rain:4,heat:33};
  const rules={plant:{maxRainProb:70,maxWind:25,minRain:base.rain},harvest:{maxRainProb:35,maxWind:20,minRain:0},spray:{maxRainProb:25,maxWind:15,minRain:0},fertilize:{maxRainProb:30,maxWind:25,minRain:0}};
  return rules[activity]
}
function runAdvisor(){
  if(!weather){toast("Load a farm first");return}
  const activity=$("activity").value,crop=$("advisorCrop").value,r=cropRequirements(crop,activity),d=weather.daily,days=[];
  for(let i=0;i<Math.min(14,d.time.length);i++){
    let score=100,why=[];
    const rainP=d.precipitation_probability_max[i]||0,rain=d.precipitation_sum[i]||0,wind=d.wind_speed_10m_max[i]||0,t=d.temperature_2m_max[i]||0;
    if(rainP>r.maxRainProb){score-=35;why.push(`rain chance ${rainP}%`)}
    if(wind>r.maxWind){score-=30;why.push(`wind ${Math.round(wind)} km/h`)}
    if(activity==="plant"&&rain<r.minRain&&rainP<40){score-=15;why.push("limited expected rainfall")}
    if(t>=r.heat){score-=20;why.push(`heat ${Math.round(t)}°C`)}
    if(score>=80)why.unshift("conditions align well with the selected activity");
    else if(score>=60)why.unshift("some caution factors are present");
    else why.unshift("several weather risks are present");
    days.push({date:d.time[i],score,why:why.join("; ")})
  }
  const sorted=[...days].sort((a,b)=>b.score-a.score),tol=$("riskTolerance").value;
  const threshold=tol==="conservative"?80:tol==="flexible"?60:70;
  const candidates=sorted.filter(x=>x.score>=threshold).slice(0,5);
  $("advisorResults").innerHTML=`<section class="panel"><h3>${candidates.length?"Candidate windows":"No strong window in the next 14 days"}</h3><p class="muted small">Scores are rule-based suitability indicators, not guarantees. Re-check the latest forecast before acting.</p></section>`+
    (candidates.length?candidates.map(x=>`<div class="panel candidate"><div><div class="date">${new Date(x.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div><div class="muted small">${day(x.date)}</div></div><div class="reason">${esc(x.why)}</div><div class="score ${x.score>=80?"good":x.score>=70?"warn":"bad"}">${x.score}/100</div></div>`).join(""):sorted.slice(0,5).map(x=>`<div class="panel candidate"><div class="date">${new Date(x.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div><div class="reason">${esc(x.why)}</div><div class="score bad">${x.score}/100</div></div>`).join(""))
}
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$("refreshWeather").onclick=loadWeather;$("runAdvisor").onclick=runAdvisor;
$("farmSelect").onchange=async e=>{activeFarm=farms.find(f=>f.id===e.target.value);await loadWeather();loadRecords();loadAlerts()};
$("settingsForm").onsubmit=async e=>{e.preventDefault();try{await saveSettings()}catch(x){toast(x.message)}};
$("harvestForm").onsubmit=async e=>{e.preventDefault();try{await addDoc(collection(db,"harvests"),{ownerId:user.uid,farmId:activeFarm.id,harvestDate:$("harvestDate").value,crop:$("harvestCrop").value.trim(),yieldKg:Number($("yieldKg").value),price:Number($("price").value)||null,quality:$("quality").value.trim(),notes:$("harvestNotes").value.trim(),createdAt:serverTimestamp()});e.target.reset();toast("Harvest recorded");loadRecords()}catch(x){toast(x.message)}};
$("farmForm").onsubmit=async e=>{e.preventDefault();try{const g=(!Number($("farmLat").value)||!Number($("farmLon").value))?await geo($("farmLocation").value):null;await addDoc(collection(db,"farms"),{ownerId:user.uid,name:$("farmName").value.trim(),crop:$("farmCrop").value.trim(),area:Number($("farmArea").value),location:$("farmLocation").value.trim(),lat:Number($("farmLat").value)||(g?.latitude||null),lon:Number($("farmLon").value)||(g?.longitude||null),createdAt:serverTimestamp()});e.target.reset();toast("Farm created");await loadFarms()}catch(x){toast(x.message)}};
$("logoutBtn").onclick=()=>signOut(auth);
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{mode=b.dataset.auth;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));$("authSubmit").textContent=mode==="login"?"Sign in":"Create account";setAuthMessage("")});
$("authForm").onsubmit=async e=>{e.preventDefault();try{if(mode==="login")await signInWithEmailAndPassword(auth,$("email").value,$("password").value);else await createUserWithEmailAndPassword(auth,$("email").value,$("password").value)}catch(x){setAuthMessage(x.message.replace("Firebase: ",""))}};
onAuthStateChanged(auth,async u=>{user=u;$("authView").hidden=!!u;$("appView").hidden=!u;$("logoutBtn").hidden=!u;if(u){await setDoc(doc(db,"users",u.uid),{email:u.email,updatedAt:serverTimestamp()},{merge:true});await loadSettings();await loadFarms();}});
