const API = "http://35.208.207.194:8000";

let map = L.map("map", {
    zoomControl: false
}).setView([-6.2, 107], 10);
let markers = [];      

document.querySelectorAll(".filter-box input").forEach(cb => {
  cb.addEventListener("change", loadStations);
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.carto.com/">CARTO</a> &copy; OpenStreetMap contributors',
    subdomains: 'abcd',
    maxZoom: 18
}).addTo(map);


function aqiColor(aqi) {
  if (aqi <= 50) return "#5db13bff";
  if (aqi <= 100) return "#FFC107";
  if (aqi <= 150) return "#FF9800";
  if (aqi <= 200) return "#F44336";
  if (aqi <= 300) return "#9C27B0";
  return "#7E0023";
}

function getCategoryIcon(aqi) {
    if (aqi <= 50) return "😄";
    if (aqi <= 100) return "😊";
    if (aqi <= 150) return "🤧";
    if (aqi <= 200) return "😷";
    if (aqi <= 300) return "🤒";
    return "☠️";
}

function aqiCategory(aqi) {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive Group";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
}

function updateAnalysisBox(aqi, boxId, iconId, textId) {
    const box = document.getElementById(boxId);
    const icon = document.getElementById(iconId);
    const text = document.getElementById(textId);

    // Reset classes
    box.classList.remove("analysis-low", "analysis-medium", "analysis-high");

    if (aqi >= 0 && aqi <= 100) {
        text.textContent = "Low AQI detected, safe to go outside";
        icon.textContent = "mood";
        box.classList.add("analysis-low");
    }
    else if (aqi > 100 && aqi <= 200) {
        text.textContent = "High AQI detected, please wear masks";
        icon.textContent = "medical_mask";
        box.classList.add("analysis-medium");
    }
    else {
        text.textContent = "Very high AQI detected, do not go outside";
        icon.textContent = "dangerous";
        box.classList.add("analysis-high");
    }

    box.classList.remove("hidden");
}



function showAQICard(station, latest) {
    
    const overlay = document.getElementById("aqiOverlay");

    const aqi = latest.aqi;
    const icon = getCategoryIcon(aqi);

    const category = aqiCategory(aqi);

    
    const timeHHMM = latest.time.substring(11, 16);

    overlay.innerHTML = `
        <div class="aqi-row">
            <div>
                <div class="aqi-value">${aqi}</div>
                <div class="aqi-sub">AQI at <b>${station.station}</b></div>
            </div>
            <div class="aqi-icon">${icon}</div>
        </div>
        <div class="aqi-category">${category}</div>

        <div class="aqi-footer">
            <div>${timeHHMM}</div>
            <div>${latest["pm2.5"]} µg/m³</div>
        </div>
    `;

    overlay.style.background = aqiColor(aqi);
    overlay.classList.remove("hidden");

    updateAnalysisBox(latest.aqi, "detailAnalysisBox", "detailAnalysisIcon", "detailAnalysisText");

}


async function loadGlobalAQIBox() {
    const resStations = await fetch(`${API}/stations`);
    const stations = await resStations.json();

    // get all latest data
    const allLatest = await Promise.all(stations.map(async (s) => {
        const res = await fetch(`${API}/stations/${encodeURIComponent(s.station)}/latest`);
        return res.ok ? await res.json() : null;
    }));

    const valid = allLatest.filter(x => x !== null);

    // compute stats
    const avgAQI = Math.round(valid.reduce((sum, s) => sum + s.aqi, 0) / valid.length);
    const avgPM25 = Math.round(valid.reduce((sum, s) => sum + s["pm2.5"], 0) / valid.length);

    // pick latest timestamp across stations
    const latestTime = valid
        .map(s => s.time)
        .sort()
        .reverse()[0];
    const timeHHMM = latestTime.substring(11, 16);

    // render
    const box = document.getElementById("globalAQIBox");
    box.innerHTML = `
        <div class="aqi-row">
            <div>
                <div class="aqi-value">${avgAQI}</div>
                <div class="aqi-sub">Average AQI in Jakarta</div>
                <div class="aqi-category">${aqiCategory(avgAQI)}</div>
            </div>
            <div class="aqi-icon">${getCategoryIcon(avgAQI)}</div>
        </div>

        <div class="aqi-footer">
            <div>${timeHHMM}</div>
            <div>${avgPM25} µg/m³</div>
        </div>
    `;

    box.style.background = aqiColor(avgAQI);
    updateAnalysisBox(avgAQI, "globalAnalysisBox", "globalAnalysisIcon", "globalAnalysisText");

}

loadGlobalAQIBox();

async function loadStations() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const selected = [...document.querySelectorAll(".filter-box input:checked")]
                        .map(cb => cb.value);

    const res = await fetch(`${API}/stations`);
    const stations = await res.json();

    console.log("Selected sources:", selected);
    console.log("Stations from API:", stations);

    // filter stations by sourceid
    const filtered = stations.filter(s => selected.includes(s.sourceid));

    console.log("Filtered stations:", filtered);

    // now continue to add markers as usual
    for (const s of filtered) {
        let latest = null;
        try {
            const res = await fetch(`${API}/stations/${encodeURIComponent(s.station)}/latest`);
            if (!res.ok) {
                console.warn(`No latest data for station: ${s.station}`);
                continue; // skip this station
            }
            latest = await res.json();
        } catch (err) {
            console.error(`Error fetching latest for ${s.station}:`, err);
            continue;
        }

        const color = aqiColor(latest.aqi);
        const timeHHMM = latest.time.substring(11,16);

        const marker = L.marker([s.latitude, s.longitude], {
            icon: L.divIcon({
                className: "aqi-marker",
                html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;display:flex;justify-content:center;align-items:center;color:white;font-size:10px;font-weight:light;font-family: 'Open Sans', sans-serif;box-shadow: 0 2px 6px ${color};">${latest.aqi}</div>`,
                iconSize: [32,32],
                iconAnchor: [16,16],
            })
        }).addTo(map);

        marker.bindPopup(`
            <b>${s.station}</b><br>
            AQI: ${latest.aqi}<br>
            PM2.5: ${latest["pm2.5"]}<br>
            Source: ${s.sourceid}<br>
            Time: ${timeHHMM}
        `);

        marker.on("click", () => {
            document.querySelector(".global-wrapper").classList.add("hidden");
            document.querySelector(".detail-wrapper").classList.remove("hidden");

            showAQICard(s, latest);
            loadChart(s.station);
        });


        markers.push(marker);
    }

}

document.getElementById("closeDetail").addEventListener("click", () => {
    document.querySelector(".detail-wrapper").classList.add("hidden");
    document.querySelector(".global-wrapper").classList.remove("hidden");
});


let lineChart = null;
let barChart = null;
let currentStation = null;

async function loadChart(station) {
    currentStation = station;

    const variable = "aqi";   

    const dailyRes = await fetch(`${API}/stations/${station}/daily`);
    const daily = await dailyRes.json();

    const dailyLabels = daily.map(d => d.date);
    const dailyValues = daily.map(d => d[variable]);


    const todayRes = await fetch(`${API}/stations/${station}/today`);
    const today = await todayRes.json();

    const todayLabels = today.map(d => {
        const date = new Date(d.time);
        return date.getHours().toString().padStart(2, "0") + ":00";
    });
    const todayValues = today.map(d => d[variable]);


    if (lineChart) lineChart.destroy();
    if (barChart) barChart.destroy();

    const ctxLine = document.getElementById("lineChart").getContext("2d");
    lineChart = new Chart(ctxLine, {
    type: "line",
    data: {
        labels: dailyLabels,
        datasets: [{
        label: `${variable.toUpperCase()} (Daily Avg) - ${station}`,
        data: dailyValues,
        borderWidth: 2,
        tension: 0.3,
        borderColor: dailyValues.map(v => aqiColor(v)),
        pointBackgroundColor: dailyValues.map(v => aqiColor(v)),
        pointBorderColor: "#fff",
        pointRadius: 4
        }]
    },
    options: {
        responsive: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                ticks: { 
                    display: false 
                },
                grid: {
                    display: false 
                }
            },
            y: {
                grid: {
                    display: false 
                }
            }
        }
    }
    });

    const ctxBar = document.getElementById("barChart").getContext("2d");
    barChart = new Chart(ctxBar, {
    type: "bar",
    data: {
        labels: todayLabels,
        datasets: [{
            label: `${variable.toUpperCase()} (Today Hourly) - ${station}`,
            data: todayValues,
            backgroundColor: todayValues.map(v => aqiColor(v)),
            borderColor: todayValues.map(v => aqiColor(v)),
            borderRadius: 3,
            borderWidth: 1
            }]
        },
    options: {
        responsive: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                ticks: { 
                    display: false 
                },
                grid: {
                    display: false 
                },
            },
            y: {
                grid: {
                    display: false 
                }
            }
        }}
    });
}


loadStations();


async function loadTop5AQIToday() {
    try {
        const resStations = await fetch(`${API}/stations`);
        const stations = await resStations.json();

        const allLatest = await Promise.all(stations.map(async (s) => {
            const resToday = await fetch(`${API}/stations/${encodeURIComponent(s.station)}/today`);
            if (!resToday.ok) return null;
            const todayData = await resToday.json();
            if (!todayData || todayData.length === 0) return null;
            const latest = todayData[todayData.length - 1];
            return { station: s.station, aqi: latest.aqi};
        }));

        const validData = allLatest.filter(d => d !== null);

        const top5Highest = [...validData].sort((a, b) => b.aqi - a.aqi).slice(0, 5);

        const top5Lowest = [...validData].sort((a, b) => a.aqi - b.aqi).slice(0, 5);

        const containerHigh = document.getElementById("top5Table");
        containerHigh.innerHTML = `
            <div><b>#</b></div>
            <div><b>Station</b></div>
            <div><b>AQI</b></div>
        `;
        top5Highest.forEach((d, i) => {
            containerHigh.innerHTML += `
                <div>${i + 1}</div>
                <div>${d.station}</div>
                <div><span class="aqi-box" style="background:${aqiColor(d.aqi)};color:white;padding:2px 6px;border-radius:4px">${d.aqi}</span></div>
            `;
        });

        const containerLow = document.getElementById("top5LowestTable");
        containerLow.innerHTML = `
            <div><b>#</b></div>
            <div><b>Station</b></div>
            <div><b>AQI</b></div>
        `;
        top5Lowest.forEach((d, i) => {
            containerLow.innerHTML += `
                <div>${i + 1}</div>
                <div>${d.station}</div>
                <div><span class="aqi-box" style="background:${aqiColor(d.aqi)};color:white;padding:2px 6px;border-radius:4px">${d.aqi}</span></div>
            `;
        });

    } catch (err) {
        console.error("Error loading AQI today:", err);
    }
}

loadTop5AQIToday();


document.querySelector(".side-panel-toggle").addEventListener("click", () => {
    document.querySelector(".download-wrapper").classList.toggle("open");
});

// Flatpickr datepickers
flatpickr("#startDateFilter", {
    dateFormat: "Y-m-d",
});

flatpickr("#endDateFilter", {
    dateFormat: "Y-m-d",
});

// Download CSV button
document.getElementById("downloadBtn").addEventListener("click", () => {
    const start = document.getElementById("startDateFilter").value;
    const end = document.getElementById("endDateFilter").value;

    if (!start || !end) {
        alert("Please select both start and end dates.");
        return;
    }

    const url = `${API}/download?start=${start}&end=${end}`;

    fetch(url)
    .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
    })
    .then(blob => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "data.csv";
        link.click();
    })
    .catch(err => console.error(err));

});

function setupSwitcher(cardA, cardB, prevBtn, nextBtn) {

    const A = document.getElementById(cardA);
    const B = document.getElementById(cardB);
    const prev = document.getElementById(prevBtn);
    const next = document.getElementById(nextBtn);

    next.addEventListener("click", () => {
        A.classList.add("hidden");
        B.classList.remove("hidden");
        next.classList.add("hidden");
        prev.classList.remove("hidden");
    });

    prev.addEventListener("click", () => {
        B.classList.add("hidden");
        A.classList.remove("hidden");
        prev.classList.add("hidden");
        next.classList.remove("hidden");
    });
}

// First switcher (Top 5)
setupSwitcher("card1a", "card1b", "prevBtn1", "nextBtn1");

// Second switcher (Charts)
setupSwitcher("card2a", "card2b", "prevBtn2", "nextBtn2");
