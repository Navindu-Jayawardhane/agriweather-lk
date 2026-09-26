import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();

const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WA_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

function uniq(a){ return [...new Set(a)]; }
function nowIso(){ return new Date().toISOString(); }

async function weather(lat,lon){
  const p=new URLSearchParams({
    latitude:lat,longitude:lon,timezone:"auto",forecast_days:"3",
    current:"temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
    daily:"temperature_2m_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max"
  });
  const r=await fetch(`${OPEN_METEO}?${p}`); if(!r.ok) throw Error(`Weather ${r.status}`);
  return r.json();
}

function detect(farm,w){
  const d=w.daily,c=w.current,out=[];
  const rain=d.precipitation_sum[0]||0, rp=d.precipitation_probability_max[0]||0, wind=d.wind_speed_10m_max[0]||0, t=d.temperature_2m_max[0]||0, hum=c.relative_humidity_2m||0;
  if(rain>=25||rp>=85) out.push({type:"rain",severity:"high",title:"Heavy rain risk",message:`${farm.name}: rainfall risk is elevated. Forecast precipitation is ${rain.toFixed(1)} mm with ${rp}% precipitation probability.`});
  else if(rain>=10||rp>=70) out.push({type:"rain",severity:"medium",title:"Rainfall risk",message:`${farm.name}: significant rainfall is possible. Forecast precipitation is ${rain.toFixed(1)} mm with ${rp}% probability.`});
  if(t>=35) out.push({type:"heat",severity:"high",title:"Heat risk",message:`${farm.name}: maximum temperature is forecast around ${Math.round(t)}°C.`});
  else if(t>=32) out.push({type:"heat",severity:"medium",title:"Heat watch",message:`${farm.name}: warm conditions are forecast around ${Math.round(t)}°C.`});
  if(wind>=35) out.push({type:"wind",severity:"high",title:"Strong wind risk",message:`${farm.name}: maximum wind is forecast around ${Math.round(wind)} km/h.`});
  else if(wind>=25) out.push({type:"wind",severity:"medium",title:"Wind watch",message:`${farm.name}: stronger winds are forecast around ${Math.round(wind)} km/h.`});
  if(hum>=88 && rain>=5) out.push({type:"disease",severity:"medium",title:"Wet-condition disease watch",message:`${farm.name}: high humidity and rainfall create conditions that can increase risk for some crop diseases.`});
  return out;
}

async function telegram(chatId,text){
  if(!TELEGRAM_TOKEN||!chatId) return false;
  const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text})});
  return r.ok;
}

async function whatsapp(to,text){
  if(!WA_TOKEN||!WA_PHONE_ID||!to) return false;
  const r=await fetch(`https://graph.facebook.com/${WA_VERSION}/${WA_PHONE_ID}/messages`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${WA_TOKEN}`},body:JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{body:text}})});
  return r.ok;
}

const farmsSnap=await db.collection("farms").get();
let total=0;
for(const doc of farmsSnap.docs){
  const farm={id:doc.id,...doc.data()};
  if(!farm.lat||!farm.lon) continue;
  const u=await db.collection("users").doc(farm.ownerId).get();
  const settings=u.data()?.notificationSettings||{};
  try{
    const w=await weather(farm.lat,farm.lon);
    let alerts=detect(farm,w);
    alerts=alerts.filter(a=>settings[a.type]!==false);
    if(settings.severity==="high") alerts=alerts.filter(a=>a.severity==="high");
    for(const a of alerts){
      const message=`🌾 AgriWeather LK\n${a.title}\n\n${a.message}\n\nCheck the latest forecast before acting.`;
      if(settings.telegramChatId) await telegram(settings.telegramChatId,message);
      if(settings.whatsappNumber) await whatsapp(settings.whatsappNumber,message);
      await db.collection("alerts").add({ownerId:farm.ownerId,farmId:farm.id,type:a.type,severity:a.severity,title:a.title,message:a.message,createdAt:admin.firestore.FieldValue.serverTimestamp(),sentAt:nowIso()});
      total++;
    }
  }catch(e){console.error(`Farm ${farm.id}:`,e.message)}
}
console.log(`Alert worker complete. Created ${total} alert(s).`);
