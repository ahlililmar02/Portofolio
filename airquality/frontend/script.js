const BACKEND = window.API_URL;



const modelMap = {
    "Random Forest": "rf",
    "XGBoost": "xgb",
    "LightGBM": "lgbm",
};

let tifFiles = [];
let csvData = [];
let map; 

function aqiColor(value) {
    if (value <= 50) return "#00e400";       
    else if (value <= 100) return "#ffff00"; 
    else if (value <= 150) return "#ff7e00"; 
    else if (value <= 200) return "#ff0000"; 
    else if (value <= 300) return "#99004c"; 
    else return "#7e0023";                   
}


function initMap() {
    map = L.map("map", { zoomControl: false }).setView([-6.15, 107], 10);

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
            attribution:
                '&copy; <a href="https://www.carto.com/">CARTO</a> &copy; OpenStreetMap contributors',
            subdomains: "abcd",
            maxZoom: 18,
        }
    ).addTo(map);
}


async function loadBoundary() {
    const shpUrl = `${BACKEND}/tif/Jabodetabek.shp`;
    try {
        const geojson = await shp(shpUrl);

        if (map.boundaryLayer) map.removeLayer(map.boundaryLayer);

        map.boundaryLayer = L.geoJSON(geojson, {
            style: { color: "#222", weight: 2, fillOpacity: 0 }
        }).addTo(map);
    } catch (err) {
        console.error("Failed to load boundary SHP:", err);
    }
}


async function loadTifList() {
    tifFiles = await fetch(`${BACKEND}/list-files`).then(r => r.json());
    console.log("Loaded files:", tifFiles);
    populateModelDropdown();
}


function populateModelDropdown() {
    const selector = document.querySelector(".selector select");

    selector.innerHTML = `
        <option>Random Forest</option>
        <option>XGBoost</option>
        <option>LightGBM</option>
    `;

    const model = selector.value;
    populateDatePicker(modelMap[model]);
}


function getDatesForModel(modelShort) {
    return [
        ...new Set(
            tifFiles
                .filter((f) => f.includes(`_${modelShort}_`))
                .map((f) => f.split("_")[2].replace(".tif", ""))
        ),
    ].sort();
}



function populateDatePicker(modelShort) {
    const dateInput = document.getElementById("SelectDate");
    const dates = getDatesForModel(modelShort);

    let html = "";
    dates.forEach((d) => (html += `<option value="${d}">`));

    let datalist = document.getElementById("dateOptions");
    if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "dateOptions";
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = html;
    dateInput.setAttribute("list", "dateOptions");
    dateInput.value = ""; // reset
}



async function loadTiff(modelShort, dateStr) {
    const fileName = `pm25_${modelShort}_${dateStr}.tif`;
    const url = `${BACKEND}/tif/${fileName}`;

    const tiff = await GeoTIFF.fromUrl(url);
    const image = await tiff.getImage();

    const [originX, originY] = image.getOrigin();
    const [resX, resY] = image.getResolution();
    const width = image.getWidth();
    const height = image.getHeight();

    const minX = originX;
    const maxY = originY;
    const maxX = minX + width * resX;
    const minY = maxY + height * Math.abs(resY);

    const bounds = [[minY, minX], [maxY, maxX]];

    const raster = await image.readRasters({ interleave: true });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < width * height; i++) {
        const val = raster[i];
        const col = aqiColor(val);
        const bigint = parseInt(col.slice(1), 16);
        data[i*4 + 0] = (bigint >> 16) & 255;
        data[i*4 + 1] = (bigint >> 8) & 255;
        data[i*4 + 2] = bigint & 255;
        data[i*4 + 3] = 150;
    }
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = canvas.toDataURL();

    if (map.tiffOverlay) map.removeLayer(map.tiffOverlay);

    map.tiffOverlay = L.imageOverlay(dataUrl, bounds).addTo(map);
    return map.tiffOverlay;
}

async function loadCSV() {
    if (csvData.length > 0) return csvData;

    const res = await fetch("daily_complete.csv");
    const text = await res.text();

    csvData = text
        .split("\n")
        .slice(1)
        .map(line => {
            const [station,date,pm25,latitude,longitude,pm25_xgb,pm25_rf,pm25_lgbm] = line.split(",");
            return {
                station,
                date,
                pm25: parseFloat(pm25),
                lat: parseFloat(latitude),
                lon: parseFloat(longitude),
                pred_xgb: parseFloat(pm25_xgb),
                pred_rf: parseFloat(pm25_rf),
                pred_lgbm: parseFloat(pm25_lgbm),
            };
        });
    return csvData;
}

function addStationMarkers(dateStr) {
    if (map.markerGroup) map.removeLayer(map.markerGroup);

    const filtered = csvData.filter(r => r.date === dateStr);

    map.markerGroup = L.layerGroup(
        filtered.map(r => {
            const color = aqiColor(r.pm25);
            const marker = L.circleMarker([r.lat, r.lon], {
                radius: 6,
                fillColor: color,
                color: "#000",
                weight: 1,
                fillOpacity: 0.9
            });
            marker.bindPopup(`Station: ${r.name}<br>PM2.5: ${r.pm25}`);
            return marker;
        })
    ).addTo(map);
}

function drawScatter(actual, predicted, modelName) {
    document.querySelector(".linear-wrapper").innerHTML =
        `<canvas id="scatter"></canvas>`;

    new Chart(document.getElementById("scatter"), {
        type: "scatter",
        data: {
            datasets: [{
                label: `${modelName} Regression`,
                data: actual.map((v, i) => ({ x: actual[i], y: predicted[i] })),
                pointRadius: 4,
                backgroundColor: actual.map(aqiColor)
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: "PM2.5" } },
                y: { title: { display: true, text: "Estimated PM2.5" } },
            },
        },
    });
}

async function updateAll() {
    const modelFull = document.querySelector(".selector select").value;
    const modelShort = modelMap[modelFull];
    const dateStr = document.getElementById("SelectDate").value;
    if (!dateStr) return;

    await loadTiff(modelShort, dateStr);
    await loadBoundary();
    addStationMarkers(dateStr);

    const filtered = csvData.filter(r => r.date === dateStr);
    const actual = filtered.map(r => r.pm25);
    const predicted = filtered.map(r => r[`pred_${modelShort}`]);

    drawScatter(actual, predicted, modelFull);
}


document.addEventListener("change", (e) => {
    if (e.target.closest(".selector")) {
        const model = document.querySelector(".selector select").value;
        populateDatePicker(modelMap[model]);
    }
});

document.getElementById("SelectDate").addEventListener("change", updateAll);

initMap();
loadBoundary();
loadTifList();
loadCSV();
