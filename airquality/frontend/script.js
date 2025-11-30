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

function aqiColor(value) {
    if (value <= 50) return "#00e400";
    else if (value <= 100) return "#ffff00";
    else if (value <= 150) return "#ff7e00";
    else if (value <= 200) return "#ff0000";
    else if (value <= 300) return "#99004c";
    else return "#7e0023";
}

function initMap() {
    const mapElement = document.getElementById("heatmap");
    if (!mapElement) {
        console.error("Map element with ID 'heatmap' not found.");
        return;
    }

    map = L.map("heatmap", { 
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
    } catch (error) {
        console.error("Error loading TIF files:", error);
        document.getElementById('model-select').innerHTML = '<option disabled>Error loading data</option>';
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

function initialize() {
    initMap();

    loadTifList();
    
    const allDatesCheckbox = document.getElementById('all-dates-checkbox');
    if (allDatesCheckbox) {
        allDatesCheckbox.addEventListener('change', handleAllDatesChange);
        handleAllDatesChange({ target: allDatesCheckbox });
    } else {
        console.error("Checkbox with ID 'all-dates-checkbox' not found.");
    }

    const updateBtn = document.querySelector('.update-btn');
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            console.log("Update Prediction button clicked.");
        });
    }

    console.log("Dashboard initialization complete.");
}

window.onload = initialize;