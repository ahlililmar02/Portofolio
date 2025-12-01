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