const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const BACKEND_BASE_URL = window.API_URL || '';

  const cities = [
    {
        name: "Mangga Besar",
        coords: [-6.14536,106.81471],
        image:
            "https://www.rukita.co/stories/wp-content/uploads/2022/05/the-jakarta-possst.jpg",
        description:
            "Mangga Besar is a densely populated residential area and urban activities with limited green spaces. The high population density and lack of vegetation contribute to elevated temperatures and poor air quality, making green space development crucial for community health.",
    },
    {
        name: "Kemayoran",
        coords: [-6.16668,106.85188],
        image:
            "https://cdn.antaranews.com/cache/1200x800/2023/06/18/IMG-20230618-WA0000_4.jpg",
        description:
            "As a former airport area now filled with apartments, offices, and event venues, Kemayoran experiences high human mobility that adds to emissions throughout the day. Green spaces would help improve air quality for residents.",
    },
    {
        name: "Tomang",
        coords: [-6.17213,106.79294],
        image:
            "https://asset.tribunnews.com/588xrFLs3HDqiVj4yumB_dgvFNA=/1200x675/filters:upscale():quality(30):format(webp):focal(0.5x0.5:0.5x0.5)/tribunnews/foto/bank/originals/penutupan-tol-dalam-kota-ke-arah-cikampek_20220507_172234.jpg",
        description:
            "Tomang is heavily affected by its position next to one of West Jakarta’s busiest major roads, where constant traffic from private vehicles, buses, and trucks creates persistent congestion and high emission levels.",
    },
    {
        name: "Tanjung Priok/Koja",
        coords: [-6.113,106.90],
        image:
            "https://static.republika.co.id/uploads/images/inpicture_slide/sejumlah-truk-kontainer-terjebak-kemacetan-di-sekitar-pelabuahan-peti-_130725201525-357.jpg",
        description:
            "Home to Jakarta's main port, Tanjung Priok faces severe air pollution from industrial activities and shipping operations. Green buffers are essential to filter pollutants and protect residential areas from industrial emissions.",
    },
    {
        name: "Pulo Gadung/Cakung",
        coords: [-6.19118,106.91395],
        image:
            "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiztPBJbAU76EAMMWWvx6yOaP243Fw-D9rZpjX028zdi7mdJ3gBatvOQPVa4kvgRsWFL9D-wfzg4SAuA5BoXWtpGJjAvqZg00vj8Loul8qBIA6Zbgvdyt_PGPnWhmHMoNUr2iiYB6_Hvyxq/w1200-h630-p-k-no-nu/Daftar+Nama+Telepon+Perusahaan+di+Kawasan+Industri+Pulogadung+%2528JIEP%2529.jpg",
        description:
            "An industrial zone with factories and warehouses, Pulo Gadung requires extensive green space planning to reduce industrial pollution impacts. Urban forests would help absorb emissions and create healthier conditions for workers.",
    },
    {
        name: "Jatinegara",
        coords: [-6.225,106.86881],
        image:
            "https://asset.kompas.com/crops/rpg13PWmQP5sjIaFm4kwvu8mtBE=/0x0:1000x667/1200x800/data/photo/2023/07/13/64afddd634c6b.jpg",
        description:
            "A mixed residential and commercial area near railway lines, Jatinegara needs green corridors to reduce noise pollution and improve air quality. Parks would provide much-needed recreation spaces for the growing population.",
    },
  ];

  // DOM refs
  const overviewCard = document.getElementById('overview-card');
  const overviewImage = document.getElementById('overview-image');
  const overviewName = document.getElementById('overview-name');
  const overviewDesc = document.getElementById('overview-desc');
  const overviewChartCanvas = document.getElementById('overview-chart');

  const cityCard = document.getElementById('info-card');
  const cityCloseBtn = document.getElementById('close-button');
  const cityImage = document.getElementById('city-image');
  const cityName = document.getElementById('city-name');
  const cityDesc = document.getElementById('city-description');
  const cityChartCanvas = document.getElementById('city-chart');

  const mapEl = document.getElementById('map');

  // Chart labels mapping as requested
  const indicatorLabels = [
    { key: 'pm25', label: 'PM2.5' },
    { key: 'local_emis', label: 'Emission Source' },
    { key: 'ndvi', label: 'Vegetation' },
    { key: 'ntl', label: 'Population' },
    { key: 'poi_densit', label: 'Sensitive Area' },
    { key: 'GA_norm', label: 'Green Access' },
  ];

  // Helper: draw a simple horizontal bar chart on a canvas
    function drawBarChart(canvas, labels, values) {
    const dpr = devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    const barHeight = 18;
    const spacing = 10;
    const maxValue = Math.max(...values);

    ctx.font = "13px system-ui";
    ctx.textAlign = "left";

    let y = 0;

	labels.forEach((label, i) => {
    const v = values[i];          // raw 0–1 value
    const pct = v * 100;

    // find which indicator this bar belongs to
    const l = indicatorLabels[i];

    // invert NDVI + GA_norm ONLY for color scale
    let adjustedValue = v;
    if (l.key === "ndvi" || l.key === "GA_norm") {
        adjustedValue = 1 - v;
    }

    const color = getColor(adjustedValue);

    // Bar drawing
    const barX = 120;
    const barMaxWidth = width - barX - 20;
    const barWidth = Math.max(v * barMaxWidth, 5);

    // Label
    ctx.fillStyle = "#4b5563";
    ctx.fillText(label, 10, y + barHeight - 4);

    // Background bar
    ctx.fillStyle = "#e5e7eb";
    roundRect(ctx, barX, y, barMaxWidth, barHeight, 9, true);

    // Filled bar (with adjusted inverted color)
    ctx.fillStyle = color;
    roundRect(ctx, barX, y, barWidth, barHeight, 9, true);

    // Value text
    ctx.fillStyle = (v > 0.4 ? "#fff" : "#000");
    ctx.textAlign = "center";
    ctx.fillText(Math.round(pct), barX + barWidth / 2, y + barHeight - 4);

    ctx.textAlign = "left";

    y += barHeight + spacing;
});

	}


    function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    if (fill) ctx.fill();
    }

  // Utility to compute average overview metrics from geojson features
  function computeOverviewFromFeatures(features) {
    const keys = indicatorLabels.map(d => d.key);
    const sums = {};
    keys.forEach(k => sums[k] = 0);
    let count = 0;
    features.forEach(f => {
      if (f.properties) {
        keys.forEach(k => {
          const val = Number(f.properties[k]);
          if (!isNaN(val)) sums[k] += val;
        });
        count++;
      }
    });
    const avg = {};
    keys.forEach(k => avg[k] = count ? sums[k] / count : 0);
    return avg;
  }

  if (!mapEl) {
	console.error('Map container missing');
	} else {

	const map = L.map('map', {
		zoomControl: false,
		scrollWheelZoom: false,
		doubleClickZoom: false,
		touchZoom: false,
		boxZoom: false,
		keyboard: false,
		dragging: true,
	}).setView([-6.25, 106.95], 11);

	L.tileLayer(
		"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
		{
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		subdomains: "abcd",
		maxZoom: 19,
		}
	).addTo(map);

	function getColor(d) {
		return d > 0.75 ? '#fc3a3a' :
			d > 0.60 ? '#fd844c' :
			d > 0.50 ? '#f9b95f' :
			d > 0.40 ? '#f1f651ff' :
			d > 0.25 ? '#5ae72f' :
			d > 0.00 ? '#4b9948' :
						'#4b9948';
	}

	// ------------------------------------------------------
	// GLOBAL HOLDER: latest loaded greenspace (after filter)
	// ------------------------------------------------------
	let lastGreenspace = null;
	let greensLayer = null;

	function loadGreenspace(selectedCluster = "all") {
		return fetch(`${BACKEND_BASE_URL}/greenspace`)
		.then(res => {
			if (!res.ok)
			throw new Error("Failed to load greenspace data. Status: " + res.status);
			return res.json();
		})
		.then(geojsonData => {

			if (selectedCluster !== "all") {
				geojsonData.features = geojsonData.features.filter(f =>
					f.properties &&
					Number.isFinite(f.properties.cluster) &&
					f.properties.cluster === Number(selectedCluster)
				);
			}

			// store filtered version
			lastGreenspace = geojsonData;

			// remove old layer
			if (greensLayer) map.removeLayer(greensLayer);

			// draw polygons
			greensLayer = L.geoJSON(geojsonData, {
			style: feature => {
				const score = feature.properties?.pca_compos || 0;
				return {
				color: "#666",
				weight: 0.1,
				fillColor: getColor(score),
				fillOpacity: 0.8
				};
			}
			}).addTo(map);

			// overview metrics
			const overviewMetricsVals = computeOverviewFromFeatures(
			geojsonData.features || []
			);

			// update overview card visuals
			overviewImage.src = 'https://images.unsplash.com/photo-1680244116826-467f252cf503?...';
			// === UPDATE OVERVIEW TITLE & DESCRIPTION BASED ON CLUSTER ===
			if (selectedCluster === "2") {
				overviewName.textContent = "Low Priority Area";
				overviewDesc.textContent =
					"These areas are considered not urgent for additional greenspace because they already have good vegetation coverage, strong green accessibility, and lower environmental pressure.";
			}

			else if (selectedCluster === "1") {
				overviewName.textContent = "Sensitive Area";
				overviewDesc.textContent =
					"These areas should be prioritized for greenspace improvement due to the high density of sensitive locations such as schools, kindergartens, hospitals, and other vulnerable public facilities.";

			}

			else if (selectedCluster === "0") {
				overviewName.textContent = "Emission Source Area";
				overviewDesc.textContent =
					"These zones are considered urgent for greenspace development because they contain high industrial activity, dense commercial zones, or major transportation corridors that contribute significantly to air pollution.";

			}

			else {
				// "all" fallback
				overviewName.textContent = "Jakarta Overview";
				overviewDesc.textContent =
					"Jakarta faces significant environmental challenges with high air pollution, dense population, limited green spaces, heavy traffic congestion, and heat island effects. Strategic green space development across districts is essential.";
			}


			const overviewValues = indicatorLabels.map(
			l => overviewMetricsVals[l.key] || 0
			);
			drawBarChart(
			overviewChartCanvas,
			indicatorLabels.map(l => l.label),
			overviewValues
			);

			return geojsonData; // pass forward
		});
	}


	loadGreenspace("all")
    .then(() => {
        // After greenspace is loaded → add city markers
        const markerLayers = [];

        cities.forEach(city => {
            const divIcon = L.divIcon({
                className: "custom-marker",
                html: `
                    <div style="
                        width: 14px;
                        height: 14px;
                        background: #9ca3af;
                        border: 2px solid #6b7280;
                        border-radius: 50%;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                    "></div>
                `,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            const marker = L.marker(city.coords, { icon: divIcon }).addTo(map);

            marker.on("click", () => {
                overviewCard.classList.add("hidden");
                cityCard.classList.remove("hidden");

                const gData = lastGreenspace;
                if (!gData) return populateCityCard(city, null);

                const pt = turf.point([city.coords[1], city.coords[0]]);
                let matched = null;

                (gData.features || []).some(f => {
                    try {
                        if (turf.booleanPointInPolygon(pt, f)) {
                            matched = f;
                            return true;
                        }
                    } catch (_) {}
                    return false;
                });

                populateCityCard(city, matched?.properties || null);
            });

            markerLayers.push(marker);
        });
    })
    .catch(err => console.error('Map load error:', err));


	const priorityButtons = document.querySelectorAll(".priority-btn");

	priorityButtons.forEach(btn => {
		btn.addEventListener("click", () => {
			const selectedPriority = btn.dataset.priority;

			priorityButtons.forEach(b => b.classList.remove("priority-active"));
			btn.classList.add("priority-active");

			let clusterValue = "all";
			if (selectedPriority === "low") clusterValue = "2";
			if (selectedPriority === "medium") clusterValue = "1";
			if (selectedPriority === "high") clusterValue = "0";

			map.eachLayer(layer => {
				if (layer !== boundaryLayer && layer instanceof L.GeoJSON) {
					map.removeLayer(layer);
				}
			});

			loadGreenspace(clusterValue);
		});
	});

	let boundaryLayer = null;

		fetch('./jakarta_boundary.geojson')
			.then(res => {
				if (!res.ok) throw new Error('Failed to load jakarta_boundary.geojson');
				return res.json();
			})
			.then(boundaryData => {
				boundaryLayer = L.geoJSON(boundaryData, {
					style: () => ({
						color: "#555454ff",
						weight: 0.9,
						opacity: 0.9,
					})
				}).addTo(map);
			})
			.catch(err => console.error("Boundary error:", err));



	// ------------------------------------------------------
	// CITY CARD POPULATION
	// ------------------------------------------------------
	function populateCityCard(city, props) {
		cityImage.src = city.image || "";
		cityName.textContent = city.name;
		cityDesc.textContent = city.description || "";

		const getVal = (key) => {
		if (!props) return 0;
		const v = props[key];
		return typeof v === "number" ? v : Number(v || 0);
		};

		const values = indicatorLabels.map(l => getVal(l.key));
		drawBarChart(
		cityChartCanvas,
		indicatorLabels.map(l => l.label),
		values
		);

		cityCard.classList.remove("hidden");
	}

	cityCloseBtn.addEventListener("click", () => {
		cityCard.classList.add("hidden");
		overviewCard.classList.remove("hidden");
	});
	}
