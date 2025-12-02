const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const BACKEND_BASE_URL = window.API_URL || ''; 

const cities = [
    {
        name: "Taman Sari",
        coords: [-6.144, 106.816],
        image:
            "https://images.unsplash.com/photo-1711078291919-c603b878eb39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYWthcnRhJTIwdXJiYW4lMjBwb2xsdXRpb258ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Taman Sari is a densely populated residential area and urban activities with limited green spaces. The high population density and lack of vegetation contribute to elevated temperatures and poor air quality, making green space development crucial for community health.",
    },
    {
        name: "Sawah Besar",
        coords: [-6.155, 106.8325],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Located in central Jakarta, Sawah Besar experiences heavy traffic congestion and urban heat island effects. Green spaces would help reduce surface temperatures, improve air quality, and provide recreational areas for residents.",
    },
    {
        name: "Tanah Abang",
        coords: [-6.195, 106.812],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "As a major commercial hub, Tanah Abang suffers from concrete dominance and lack of vegetation. The area needs green infrastructure to mitigate pollution from the busy textile market and improve the wellbeing of workers and shoppers.",
    },
    {
        name: "Tanjung Priok",
        coords: [-6.108, 106.885],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Home to Jakarta's main port, Tanjung Priok faces severe air pollution from industrial activities and shipping operations. Green buffers are essential to filter pollutants and protect residential areas from industrial emissions.",
    },
    {
        name: "Pulo Gadung",
        coords: [-6.193, 106.89],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "An industrial zone with factories and warehouses, Pulo Gadung requires extensive green space planning to reduce industrial pollution impacts. Urban forests would help absorb emissions and create healthier conditions for workers.",
    },
    {
        name: "Jatinegara",
        coords: [-6.2311, 106.879],
        image:
            "https://images.unsplash.com/photo-1644380344134-c8986ef44b59?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1cmJhbiUyMGdyZWVuJTIwc3BhY2UlMjBwYXJrfGVufDF8fHx8MTc2NDY2OTc1Mnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "A mixed residential and commercial area near railway lines, Jatinegara needs green corridors to reduce noise pollution and improve air quality. Parks would provide much-needed recreation spaces for the growing population.",
    },
];

// DOM elements
const infoCard = document.getElementById('info-card');
const closeButton = document.getElementById('close-button');
const cityNameElement = document.getElementById('city-name');
const cityDescriptionElement = document.getElementById('city-description');
const cityImageElement = document.getElementById('city-image');
const mapElement = document.getElementById('map');

/**
 * Updates the info card with city data and makes it visible.
 * @param {object} cityData - The data for the selected city.
 */
function showCityInfo(cityData) {
    cityNameElement.textContent = cityData.name;
    cityDescriptionElement.textContent = cityData.description;
    cityImageElement.src = cityData.image;
    cityImageElement.alt = cityData.name;
    
    infoCard.classList.remove('info-card-hidden');
    infoCard.classList.add('info-card-visible');
}

/**
 * Hides the info card.
 */
function hideCityInfo() {
    infoCard.classList.remove('info-card-visible');
    infoCard.classList.add('info-card-hidden');
}

// Event listener for the close button
closeButton.addEventListener('click', hideCityInfo);

// Initialize Leaflet map
if (mapElement && typeof L !== 'undefined') {
    const map = L.map('map', {
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        dragging: true,
    }).setView([-6.25, 106.95], 11);

    function getColor(d) {
        // d is the pca_compos value (0 to 1)
        return d > 0.8 ? '#D73027' : // Deep Red
               d > 0.6 ? '#FC8D59' : // Orange-Red
               d > 0.4 ? '#FEE08B' : // Yellow
               d > 0.2 ? '#A6D96A' : // Light Green
                         '#66BD63';  // Dark Green
    }

    // 1. Add Base Tile Layer
    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
        },
    ).addTo(map);


    fetch(`${BACKEND_BASE_URL}/greenspace`)
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load greenspace data. Status: ${response.status}`);
            return response.json();
        })
        .then(geojsonData => {

            // 1. Add Greenspace Layer FIRST
            L.geoJSON(geojsonData, {
                style: feature => {
                    const score = feature.properties.pca_compos || 0;
                    return {
                        color: "#666",
                        weight: 0.5,
                        fillColor: getColor(score),
                        fillOpacity: 0.8
                    };
                }
            }).addTo(map);

            // After greenspace is loaded, continue to load boundary
            return fetch('./jakarta_boundary.geojson');
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to load jakarta_boundary.geojson');
            return response.json();
        })
        .then(boundaryData => {

            // 2. Add Boundary Layer SECOND
            L.geoJSON(boundaryData, {
                style: () => ({
                    color: "#000000ff",
                    weight: 2,
                    opacity: 1,
                    fillColor: "#000000ff",
                    fillOpacity: 1
                })
            }).addTo(map);

            // After boundary is loaded, continue to markers
            return true; // just a signal
        })
        .then(() => {

            // 3. Add Markers LAST
            cities.forEach((city) => {
                const divIcon = L.divIcon({
                    className: "custom-marker",
                    html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #f59e0b; font-size: 12px; font-weight: 500; color: #92400e; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer;">${city.name}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                });

                const marker = L.marker(city.coords, { icon: divIcon }).addTo(map);

                marker.on("click", () => {
                    showCityInfo(city);
                });
            });

        })
        .catch(error => {
            console.error("Error in map loading sequence:", error);
        });
    
} else {
    console.error('Leaflet or map container not found.');
}