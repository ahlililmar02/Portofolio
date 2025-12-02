// Data from the original component
const cities = [
    {
        name: "Tambora",
        coords: [-6.1452257360168034, 106.80055453345109],
        image:
            "https://images.unsplash.com/photo-1711078291919-c603b878eb39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYWthcnRhJTIwdXJiYW4lMjBwb2xsdXRpb258ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Tambora is a densely populated residential area with limited green spaces. The high population density and lack of vegetation contribute to elevated temperatures and poor air quality, making green space development crucial for community health.",
    },
    {
        name: "Sawah Besar",
        coords: [-6.155453752530772, 106.83249101204726],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Located in central Jakarta, Sawah Besar experiences heavy traffic congestion and urban heat island effects. Green spaces would help reduce surface temperatures, improve air quality, and provide recreational areas for residents.",
    },
    {
        name: "Tanah Abang",
        coords: [-6.195006957533741, 106.81175576988079],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "As a major commercial hub, Tanah Abang suffers from concrete dominance and lack of vegetation. The area needs green infrastructure to mitigate pollution from the busy textile market and improve the wellbeing of workers and shoppers.",
    },
    {
        name: "Tanjung Priok",
        coords: [-6.134149242112454, 106.87392495815662],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Home to Jakarta's main port, Tanjung Priok faces severe air pollution from industrial activities and shipping operations. Green buffers are essential to filter pollutants and protect residential areas from industrial emissions.",
    },
    {
        name: "Pulo Gadung",
        coords: [-6.193038155182227, 106.8900472438781],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "An industrial zone with factories and warehouses, Pulo Gadung requires extensive green space planning to reduce industrial pollution impacts. Urban forests would help absorb emissions and create healthier conditions for workers.",
    },
    {
        name: "Jatinegara",
        coords: [-6.231151721068033, 106.87904964825229],
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


    // 3. Load Greenspace Layer (Updated Styling)
    fetch('./greenspace.geojson')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load greenspace.geojson');
            return response.json();
        })
        .then(data => {
            L.geoJSON(data, {
                // *** UPDATED STYLE FUNCTION ***
                style: function (feature) {
                    const score = feature.properties.pca_compos; // Get the PCA score (0-1)
                    return {
                        color: "#666",      // Stroke color (dark gray border)
                        weight: 0.5,
                        fillColor: getColor(score), // Use the custom color function
                        fillOpacity: 0.8      // Opaque fill
                    };
                },
                // Optional: Add interactivity like a popup on click
                onEachFeature: function (feature, layer) {
                    if (feature.properties) {
                        const { name, pca_compos } = feature.properties;
                        const popupContent = `
                            <strong>${name || 'Greenspace Area'}</strong><br>
                            PCA Composite Score: <strong>${pca_compos.toFixed(4)}</strong>
                        `;
                        layer.bindPopup(popupContent);
                    }
                }
            }).addTo(map);
        })
        .catch(error => console.error("Error loading Greenspace Data:", error));

    fetch('./jakarta_boundary.geojson')
        // ... (boundary loading code)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load jakarta_boundary.geojson');
            return response.json();
        })
        .then(data => {
            L.geoJSON(data, {
                style: function (feature) {
                    return {
                        color: "#000000ff",
                        weight: 2,
                        opacity: 0.5,
                        fillColor: "#000000ff",
                        fillOpacity: 0.05
                    };
                }
            }).addTo(map);
        })
        .catch(error => console.error("Error loading Jakarta Boundary:", error));



    // 3. Add city markers (placed on top of all GeoJSON layers)
    cities.forEach((city) => {
        const divIcon = L.divIcon({
            className: "custom-marker",
            html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #f59e0b; font-size: 12px; font-weight: 500; color: #92400e; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2); cursor: pointer;">${city.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });

        const marker = L.marker(city.coords, {
            icon: divIcon,
        }).addTo(map);

        marker.on("click", () => {
            showCityInfo(city);
        });
    });
    
} else {
    console.error('Leaflet or map container not found.');
}