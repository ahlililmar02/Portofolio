const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const BACKEND_BASE_URL = window.API_URL || ''; 

const modelMap = {
    "Random Forest": "rf",
    "XGBoost": "xgb",
    "LightGBM": "lgbm",
};

let tifFiles = [];
let map;
let currentModelShort = 'rf';
let tifLayer = null;


function turboColormap(value, min = 0, max = 80) {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

    const r = 34.61 +
        t * (1172.33 -
        t * (10793.56 -
        t * (33300.12 -
        t * (38394.49 -
        t * 14825.05))));

    const g = 23.31 +
        t * (557.33 +
        t * (1225.33 -
        t * (3574.96 -
        t * (1073.77 +
        t * 707.56))));

    const b = 27.2 +
        t * (3211.1 -
        t * (15327.97 -
        t * (27814 -
        t * (22569.18 -
        t * 6838.66))));

    return rgbToHex(
        clampColor(r),
        clampColor(g),
        clampColor(b)
    );
}

function clampColor(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex(r, g, b) {
    return (
        "#" +
        r.toString(16).padStart(2, "0") +
        g.toString(16).padStart(2, "0") +
        b.toString(16).padStart(2, "0")
    );
}


function initMap() {
    const mapElement = document.getElementById("heatmap");
    if (!mapElement) {
        console.error("Map element not found. Check if the ID is 'map' or 'heatmap'.");
        return;
    }

    map = L.map(mapElement.id, { 
        zoomControl: true,
        minZoom: 9, 
        maxZoom: 14 
    }).setView([-6.2, 106.8], 11);

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
            attribution:
                '&copy; <a href="https://www.carto.com/">CARTO</a> &copy; OpenStreetMap contributors',
            subdomains: "abcd",
            maxZoom: 18,
            minZoom: 3
        }
    ).addTo(map);

    console.log("Leaflet map initialized with base layer.");
}

async function loadTifList() {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/list-files`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        tifFiles = await response.json();
        console.log("Loaded TIF files:", tifFiles);
        
        populateModelDropdown();
        handleUpdate(true); 
    } catch (error) {
        console.error("Error loading TIF files:", error);
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
             modelSelect.innerHTML = '<option disabled>Error loading data</option>';
        }
    }
}

function getDatesForModel(modelShort) {
    const dates = new Set();
    tifFiles
        .filter((f) => f.includes(`pm25_${modelShort}_`))
        .forEach((f) => {
            const parts = f.split("_");
            if (parts.length >= 3) {
                const datePart = parts[2].replace(".tif", "");
                dates.add(datePart);
            }
        });

    return Array.from(dates).sort();
}

function populateModelDropdown() {
    const modelSelect = document.getElementById("model-select");
    
    modelSelect.innerHTML = Object.keys(modelMap).map(modelName => {
        const short = modelMap[modelName];
        return `<option value="${short}">${modelName} (${short.toUpperCase()})</option>`;
    }).join('');

    currentModelShort = modelSelect.value || 'rf'; 
    
    modelSelect.addEventListener('change', handleModelChange);

    populateDatePicker(currentModelShort);
}

function populateDatePicker(modelShort) {
    const dateInput = document.getElementById("date-input");
    const dates = getDatesForModel(modelShort);

    if (dates.length === 0) {
        dateInput.value = '';
        dateInput.min = '';
        dateInput.max = '';
        dateInput.setAttribute('list', '');
        console.warn(`No dates found for model: ${modelShort}`);
        return;
    }
    
    const datalistId = 'dateOptions';
    let datalist = document.getElementById(datalistId);
    if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = datalistId;
        document.body.appendChild(datalist);
    }
    
    datalist.innerHTML = dates.map(d => `<option value="${d}">`).join('');

    dateInput.min = dates[0];
    dateInput.max = dates[dates.length - 1];
    dateInput.value = dates[dates.length - 1];
    
    dateInput.setAttribute("list", datalistId);

    console.log(`Date selector populated for ${modelShort}. Range: ${dates[0]} to ${dates[dates.length - 1]}.`);
}

function handleModelChange(event) {
    const selectedModelShort = event.target.value;
    currentModelShort = selectedModelShort;
    populateDatePicker(selectedModelShort);
}

function handleAllDatesChange(event) {
    const dateInput = document.getElementById("date-input");
    const isChecked = event.target.checked;
    
    if (isChecked) {
        dateInput.disabled = true;
        dateInput.classList.add('date-input-disabled');
        dateInput.value = '';
        dateInput.title = 'Date selection disabled when "All Date" is checked.';
    } else {
        dateInput.disabled = false;
        dateInput.classList.remove('date-input-disabled');
        dateInput.title = '';
        populateDatePicker(currentModelShort); 
    }
}

async function fetchAndVisualizeJson(modelShort, selectedDate, displayName) {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/extract-tif?model=${modelShort}&date=${selectedDate}`);
        if (!response.ok) {
            throw new Error("Failed to fetch raster data");
        }

        const data = await response.json();

        console.log("Raster data received:", data);

        visualizeRaster(data, displayName);

    } catch (error) {
        console.error("Error fetching raster:", error);
    }
}

function visualizeRaster(data, label) {
    if (tifLayer) {
        map.removeLayer(tifLayer);
    }

    const imageBounds = [
        [data.bounds.bottom, data.bounds.left],
        [data.bounds.top, data.bounds.right]
    ];

    tifLayer = L.imageOverlay(
        `data:image/png;base64,${data.image}`,
        imageBounds,
        { opacity: 0.9 }
    );

    tifLayer.addTo(map);

    console.log(`Raster layer updated: ${label}`);
}

async function loadDailyCSV() {
    return fetch("daily_complete.csv")
        .then(response => response.text())
        .then(text => {
            return Papa.parse(text, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true
            }).data;
        })
        .catch(err => {
            console.error("Failed to load CSV:", err);
            return [];
        });
}

let dailyCSVCache = null;

async function getPm25DataByDate(dateSelected) {
    if (!dailyCSVCache) {
        dailyCSVCache = await loadDailyCSV();
    }

    let rows = dailyCSVCache;

    if (dateSelected !== "All Dates") {
        return rows
            .filter(d => d.date === dateSelected)
            .map(d => ({
                station: d.station,
                lat: d.latitude,
                lon: d.longitude,
                pm25: d.pm25
            }));
    }

    const aggregated = {};

    rows.forEach(d => {
        if (!aggregated[d.station]) {
            aggregated[d.station] = {
                station: d.station,
                lat: d.latitude,
                lon: d.longitude,
                pm25sum: 0,
                count: 0
            };
        }
        aggregated[d.station].pm25sum += d.pm25;
        aggregated[d.station].count += 1;
    });

    return Object.values(aggregated).map(d => ({
        station: d.station,
        lat: d.lat,
        lon: d.lon,
        pm25: d.pm25sum / d.count
    }));
}


let csvMarkerLayer = null;

function addMarkersToMap(stationData) {
    if (csvMarkerLayer) {
        map.removeLayer(csvMarkerLayer);
    }

    csvMarkerLayer = L.layerGroup();

    stationData.forEach(item => {
        if (!item.lat || !item.lon) return;

        const marker = L.circleMarker([item.lat, item.lon], {
            radius: 6,
            weight: 1,
            fillOpacity: 0.8,
            fillColor: turboColormap(item.pm25)
        }).bindPopup(`
            <b>${item.station}</b><br>
            PM2.5: ${item.pm25.toFixed(2)}
        `);

        csvMarkerLayer.addLayer(marker);
    });

    csvMarkerLayer.addTo(map);
}


async function updateMapFromCSV() {
    const dateInput = document.getElementById("date-input");
    const allDatesChecked = document.getElementById("all-dates-checkbox").checked;

    let selectedDate = "All Dates";
    if (!allDatesChecked) {
        selectedDate = dateInput.value;
        if (!selectedDate) {
            console.error("No date selected");
            return;
        }
    }

    const data = await getPm25DataByDate(selectedDate);
    addMarkersToMap(data);
}

async function getScatterData(selectedModel, selectedDate) {
    const data = await loadDailyCSV();
    const modelCol = "pm25_" + modelMap[selectedModel];

    console.log("👉 Selected model:", selectedModel);
    console.log("👉 Using column:", modelCol);
    console.log("👉 Selected date:", selectedDate);

    let rows = data;

    if (selectedDate !== "All Dates") {
        rows = rows.filter(d => d.date === selectedDate);
        console.log("📌 Filtered rows for date:", selectedDate, rows);
    } else {
        console.log("📌 Using all dates:", rows.length, "rows");
    }

    const mapped = rows.map(d => ({
        date: d.date,
        pm25_obs: d.pm25,
        pm25_pred: d[modelCol],
    }));

    console.log("📌 Mapped raw scatter rows:", mapped);

    const cleaned = mapped.filter(d =>
        d.pm25_obs !== undefined &&
        d.pm25_pred !== undefined &&
        !isNaN(d.pm25_obs) &&
        !isNaN(d.pm25_pred)
    );

    console.log("✅ Cleaned scatter data:", cleaned);

    return cleaned;
}


// ------------------------
// METRICS
// ------------------------
function computeMetrics(points) {
    const obs = points.map(d => d.pm25_obs);
    const pred = points.map(d => d.pm25_pred);

    const n = obs.length;
    if (n === 0) return { mae: 0, r2: 0, bias: 0 };

    let sumAbs = 0;
    let sumBias = 0;

    for (let i = 0; i < n; i++) {
        sumAbs += Math.abs(pred[i] - obs[i]);
        sumBias += (pred[i] - obs[i]);
    }

    const mae = sumAbs / n;
    const bias = sumBias / n;

    // R²
    const meanObs = obs.reduce((a,b)=>a+b,0) / n;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
        ssRes += Math.pow(pred[i] - obs[i], 2);
        ssTot += Math.pow(obs[i] - meanObs, 2);
    }
    const r2 = 1 - (ssRes / ssTot);

    return { mae, r2, bias };
}


function computeDensityColors(points) {
    return points.map((p, i) => {
        let count = 0;
        for (let j = 0; j < points.length; j++) {
            if (Math.abs(points[j].pm25_obs - p.pm25_obs) < 3 &&
                Math.abs(points[j].pm25_pred - p.pm25_pred) < 3) {
                count++;
            }
        }
        const t = Math.min(count / 20, 1);
        return turboColormap(t * 80); // using your Turbo function
    });
}


let scatterChart = null;

async function updateScatterChart() {
    const selectedModel = document.getElementById("model-select").value;
    const allDates = document.getElementById("all-dates-checkbox").checked;
    const selectedDate = allDates ? "All Dates" : document.getElementById("date-input").value;

    if (!selectedDate && !allDates) return;

    const points = await getScatterData(selectedModel, selectedDate);

    const chartData = points.map(d => ({ x: d.pm25_obs, y: d.pm25_pred }));
    const densityColors = computeDensityColors(points);

    // Compute metrics
    const { mae, r2, bias } = computeMetrics(points);
    document.querySelector(".metric-card:nth-child(1) .metric-value").textContent = `${mae.toFixed(2)} µg/m³`;
    document.querySelector(".metric-card:nth-child(2) .metric-value").textContent = r2.toFixed(3);
    document.querySelector(".metric-card:nth-child(3) .metric-value").textContent = `${bias.toFixed(2)} µg/m³`;

    // Destroy previous chart
    if (scatterChart) scatterChart.destroy();

    // Create new chart
    const ctx = document.getElementById("scatterChart").getContext("2d");
    scatterChart = new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: selectedModel,
                    data: chartData,
                    pointBackgroundColor: densityColors,
                    pointRadius: 6,
                    trendlineLinear: {
                        color: "white",
                        width: 2,
                        lineStyle: "solid",
                    }
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: "Observed PM2.5" } },
                y: { title: { display: true, text: "Predicted PM2.5" } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function handleUpdate(initialLoad = false) {
    const model = document.getElementById('model-select').value;
    const dateInput = document.getElementById('date-input');
    const allDates = document.getElementById('all-dates-checkbox').checked;

    let selectedDateParam = 'All Dates'; 
    let displayName = `All Dates Averaged (${model.toUpperCase()})`;

    if (!allDates) {
        selectedDateParam = dateInput.value;
        if (!selectedDateParam) {
            if (!initialLoad) console.error("Please select a date.");
            clearPreviousLayers();
            return;
        }
        displayName = `Single Date (${selectedDateParam})`;
    }

    fetchAndVisualizeJson(model, selectedDateParam, displayName);
    updateMapFromCSV();
    updateScatterChart();

}

function initialize() {
    initMap();

    loadTifList();
    
    const allDatesCheckbox = document.getElementById('all-dates-checkbox');
    if (allDatesCheckbox) {
        allDatesCheckbox.addEventListener('change', handleAllDatesChange);
        handleAllDatesChange({ target: allDatesCheckbox });
    }

    const updateBtn = document.querySelector('.update-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', handleUpdate);
    }
    
    console.log("Dashboard initialization complete.");
}

window.onload = initialize;