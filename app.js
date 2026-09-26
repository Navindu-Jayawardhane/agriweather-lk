const API = "https://api.open-meteo.com/v1/forecast";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
let chart;

const $ = id => document.getElementById(id);
const cropNames = {general:"General",paddy:"Paddy",vegetables:"Vegetables",tea:"Tea",coconut:"Coconut",chilli:"Chilli"};

function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3000)}
function weatherIcon(code){
  if(code===0) return "☀️";
  if([1,2].includes(code)) return "🌤️";
  if(code===3) return "☁️";
  if([45,48].includes(code)) return "🌫️";
  if([51,53,55,56,57].includes(code)) return "🌦️";
  if([61,63,65,66,67,80,81,82].includes(code)) return "🌧️";
  if([71,73,75,77,85,86].includes(code)) return "🌨️";
  if([95,96,99].includes(code)) return "⛈️";
  return "🌤️";
}
function fmtDay(date){return new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});}
function setText(id,v){$(id).textContent=v ?? "—";}

async function geocode(query){
  const url=`${GEO}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const r=await fetch(url); if(!r.ok) throw new Error("Location search failed");
  const d=await r.json(); if(!d.results?.length) throw new Error("Location not found");
  return d.results[0];
}

async function fetchWeather(lat,lon){
  const params = new URLSearchParams({
    latitude:lat, longitude:lon, timezone:"auto", forecast_days:"7",
    current:"temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    hourly:"temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,soil_moisture_0_to_1cm",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration"
  });
  const r=await fetch(`${API}?${params}`); if(!r.ok) throw new Error("Weather API error");
  return r.json();
}

function todayHourly(data){
  const now = new Date();
  let idx = data.hourly.time.findIndex(t => new Date(t) >= now);
  if(idx<0) idx=0;
  const end=Math.min(idx+24,data.hourly.time.length);
  return {idx,end};
}

function buildInsights(data){
  const h=todayHourly(data), H=data.hourly, D=data.daily;
  const rainToday = D.precipitation_sum[0] || 0;
  const rainProb = D.precipitation_probability_max[0] || 0;
  const humidity = data.current.relative_humidity_2m;
  const wind = data.current.wind_speed_10m;
  const soil = H.soil_moisture_0_to_1cm[h.idx] ?? null;
  const eto = D.et0_fao_evapotranspiration[0] || 0;
  const crop=$("crop").value;

  let irrigation, spray, disease, heat;
  if(rainToday >= 8 || rainProb >= 70) irrigation=["LOW / DELAY","Significant rainfall is forecast today.","good"];
  else if(eto >= 5 && soil !== null && soil < 0.25) irrigation=["HIGHER DEMAND","Low near-surface soil moisture with elevated atmospheric water demand.","warn"];
  else irrigation=["MONITOR","Check crop stage and field moisture before irrigating.","warn"];

  if(rainProb >= 60 || wind >= 25) spray=["NOT IDEAL","Rain probability or wind may reduce application effectiveness.","bad"];
  else if(humidity >= 85) spray=["CAUTION","High humidity can affect drying conditions.","warn"];
  else spray=["POTENTIALLY SUITABLE","Weather conditions are relatively calm and dry.","good"];

  if(humidity >= 85 && rainToday >= 3) disease=["ELEVATED","Warm/wet conditions can increase risk for some crops.","bad"];
  else if(humidity >= 75 || rainToday >= 3) disease=["MODERATE","Monitor crop-specific disease conditions.","warn"];
  else disease=["LOWER","Current weather indicators are less favorable for many moisture-related risks.","good"];

  const maxT=D.temperature_2m_max[0];
  if(maxT>=34) heat=["HIGH HEAT","High daytime temperature may increase crop water demand.","bad"];
  else if(maxT>=31) heat=["WATCH","Warm conditions may increase water demand.","warn"];
  else heat=["NORMAL","No strong heat indicator from today's forecast.","good"];

  const prefix = crop !== "general" ? `${cropNames[crop]}: ` : "";
  return [
    ["💧","Irrigation",prefix+irrigation[0],irrigation[1],irrigation[2]],
    ["🧪","Spraying",prefix+spray[0],spray[1],spray[2]],
    ["🦠","Disease risk",prefix+disease[0],disease[1],disease[2]],
    ["🌡️","Heat stress",heat[0],heat[1],heat[2]]
  ];
}

function renderInsights(data){
  $("insights").innerHTML=buildInsights(data).map(x=>`
    <article class="insight">
      <div class="icon">${x[0]}</div><h3>${x[1]}</h3>
      <strong>${x[2]}</strong><p>${x[3]}</p>
      <span class="badge ${x[4]}">${x[2]}</span>
    </article>`).join("");
}

function renderForecast(data){
  const D=data.daily;
  $("forecastCards").innerHTML=D.time.map((d,i)=>`
    <div class="day"><div class="name">${fmtDay(d)}</div>
      <div class="weather">${weatherIcon(D.weather_code[i])}</div>
      <div class="temp">${Math.round(D.temperature_2m_max[i])}° / ${Math.round(D.temperature_2m_min[i])}°</div>
      <div class="rain">🌧 ${D.precipitation_probability_max[i] ?? 0}%</div>
    </div>`).join("");

  const labels=D.time.map(fmtDay);
  if(chart) chart.destroy();
  chart=new Chart($("weatherChart"),{
    type:"line",
    data:{labels,datasets:[
      {label:"Max temperature °C",data:D.temperature_2m_max,borderWidth:2,tension:.35,yAxisID:"y"},
      {label:"Rain probability %",data:D.precipitation_probability_max,borderWidth:2,tension:.35,yAxisID:"y1"}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
      scales:{y:{position:"left",grid:{color:"rgba(255,255,255,.06)"}},y1:{position:"right",min:0,max:100,grid:{drawOnChartArea:false}}},
      plugins:{legend:{labels:{color:"#94a99b",font:{size:10}}}}}
  });
}

async function analyze(place){
  $("status").textContent="● Loading open weather data";
  try{
    const loc=await geocode(place);
    const data=await fetchWeather(loc.latitude,loc.longitude);
    $("placeName").textContent=loc.name;
    $("coords").textContent=`${loc.admin1 ? loc.admin1+", " : ""}${loc.country}`;
    $("updated").textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
    setText("temp",`${Math.round(data.current.temperature_2m)} °C`);
    setText("humidity",`${data.current.relative_humidity_2m}%`);
    setText("rainProb",`${data.daily.precipitation_probability_max[0] ?? 0}%`);
    setText("wind",`${Math.round(data.current.wind_speed_10m)} km/h`);
    setText("eto",`${(data.daily.et0_fao_evapotranspiration[0] ?? 0).toFixed(1)} mm`);
    const h=todayHourly(data), soil=data.hourly.soil_moisture_0_to_1cm[h.idx];
    setText("soil",soil==null?"—":`${(soil*100).toFixed(0)}%`);
    renderInsights(data); renderForecast(data);
    $("status").textContent="● Live open-data connection";
    window.currentWeather=data;
  }catch(e){
    $("status").textContent="● Data connection error";
    showToast(e.message);
  }
}

$("searchBtn").addEventListener("click",()=>analyze($("locationInput").value.trim()));
$("locationInput").addEventListener("keydown",e=>{if(e.key==="Enter") analyze($("locationInput").value.trim())});
document.querySelectorAll(".quick button").forEach(b=>b.addEventListener("click",()=>{$("locationInput").value=b.dataset.place;analyze(b.dataset.place)}));
$("crop").addEventListener("change",()=>window.currentWeather && renderInsights(window.currentWeather));
analyze("Colombo, Sri Lanka");
