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
        console.error("Map element with ID 'heatmap' not throw found.");
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
        handleUpdate(true); 
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

function clearPreviousLayers() {
    if (tifLayer) {
        map.removeLayer(tifLayer);
        tifLayer = null;
    }
}

async function fetchAndVisualize(fileName, modelShort, allDates) {
    clearPreviousLayers();

    if (allDates) {
        console.error("Averaging data across all dates requires complex backend processing. Displaying the latest prediction instead.");
    }

    try {
        const tiff = await GeoTIFF.fromUrl(`${BACKEND_BASE_URL}/tif/${fileName}`);
        const image = await tiff.getImage();
        const rasters = await image.readRasters({ interleave: true });
        
        const width = image.getWidth();
        const height = image.getHeight();
        const tiePoint = image.getTiePoints()[0];
        
        const assumedResolution = 0.01;

        const pixelScale = [assumedResolution, assumedResolution, 0];
        
        const geoTransform = [
            tiePoint.ModelTiepoint[3] - pixelScale[0] / 2, 
            pixelScale[0], 
            0,
            tiePoint.ModelTiepoint[4] + pixelScale[1] / 2, 
            0,
            -pixelScale[1] 
        ];

        visualizeRaster(rasters, width, height, geoTransform, fileName);
    } catch (error) {
        console.error("Error fetching or visualizing TIF data:", error);
    }
}

function visualizeRaster(rasters, width, height, geoTransform, fileName) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;
    const pm25Data = rasters;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x);
            const value = pm25Data[i];
            const color = aqiColor(value);

            const r = parseInt(color.substring(1, 3), 16);
            const g = parseInt(color.substring(3, 5), 16);
            const b = parseInt(color.substring(5, 7), 16);

            const alpha = 128; 

            data[i * 4 + 0] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
            data[i * 4 + 3] = alpha; 
        }
    }
    
    ctx.putImageData(imageData, 0, 0);

    const minLon = geoTransform[0];
    const maxLat = geoTransform[3];
    const pixelSizeLon = geoTransform[1];
    const pixelSizeLat = geoTransform[5];

    const bounds = L.latLngBounds(
        [maxLat + height * pixelSizeLat, minLon],
        [maxLat, minLon + width * pixelSizeLon]
    );

    tifLayer = L.imageOverlay(canvas.toDataURL(), bounds, { 
        opacity: 0.8,
        attribution: `Prediction from ${fileName}` 
    }).addTo(map);

    map.fitBounds(bounds);
    
    console.log(`Raster overlay complete. Bounds: ${bounds.toBBoxString()}`);
}

function handleUpdate(initialLoad = false) {
    const model = document.getElementById('model-select').value;
    const dateInput = document.getElementById('date-input');
    const allDates = document.getElementById('all-dates-checkbox').checked;

    let selectedDate = null;
    let fileName = null;

    if (allDates) {
        const latestDate = getDatesForModel(model).pop();
        if (latestDate) {
            fileName = `pm25_${model}_${latestDate}.tif`;
            console.log("All Dates selected. Using latest available file:", fileName);
        }
    } else {
        selectedDate = dateInput.value;
        if (!selectedDate) {
            console.error("Please select a date.");
            return;
        }
        fileName = `pm25_${model}_${selectedDate}.tif`;
    }

    if (fileName) {
        fetchAndVisualize(fileName, model, allDates);
    } else {
        clearPreviousLayers();
        if (!initialLoad) {
             console.warn("No file found matching criteria.");
        }
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
        updateBtn.addEventListener('click', handleUpdate);
    }

    console.log("Dashboard initialization complete.");
}

window.onload = initialize;