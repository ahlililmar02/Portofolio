const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const BACKEND_BASE_URL = window.API_URL || '';

  const cities = [
    {
        name: "Mangga Besar",
        coords: [-6.14536,106.81471],
        image:
            "https://images.unsplash.com/photo-1711078291919-c603b878eb39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYWthcnRhJTIwdXJiYW4lMjBwb2xsdXRpb258ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Mangga Besar is a densely populated residential area and urban activities with limited green spaces. The high population density and lack of vegetation contribute to elevated temperatures and poor air quality, making green space development crucial for community health.",
    },
    {
        name: "Kemayoran",
        coords: [-6.16668,106.85188],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "As a former airport area now filled with apartments, offices, and event venues, Kemayoran experiences high human mobility that adds to emissions throughout the day. Green spaces would help improve air quality for residents.",
    },
    {
        name: "Tomang",
        coords: [-6.17213,106.79294],
        image:
            "https://images.unsplash.com/photo-1670737565773-0a40f68256f5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcm93ZGVkJTIwY2l0eSUyMHN0cmVldHN8ZW58MXx8fHwxNzY0NjY5NzUxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Tomang is heavily affected by its position next to one of West Jakarta’s busiest major roads, where constant traffic from private vehicles, buses, and trucks creates persistent congestion and high emission levels.",
    },
    {
        name: "Tanjung Priok/Koja",
        coords: [-6.115,106.90],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "Home to Jakarta's main port, Tanjung Priok faces severe air pollution from industrial activities and shipping operations. Green buffers are essential to filter pollutants and protect residential areas from industrial emissions.",
    },
    {
        name: "Pulo Gadung",
        coords: [-6.19118,106.91395],
        image:
            "https://images.unsplash.com/photo-1604840500198-792eefd7d08f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmR1c3RyaWFsJTIwYXJlYSUyMHBvbGx1dGlvbnxlbnwxfHx8fDE3NjQ2Njk3NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
        description:
            "An industrial zone with factories and warehouses, Pulo Gadung requires extensive green space planning to reduce industrial pollution impacts. Urban forests would help absorb emissions and create healthier conditions for workers.",
    },
    {
        name: "Jatinegara",
        coords: [-6.22995,106.86881],
        image:
            "https://images.unsplash.com/photo-1644380344134-c8986ef44b59?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx1cmJhbiUyMGdyZWVuJTIwc3BhY2UlMjBwYXJrfGVufDF8fHx8MTc2NDY2OTc1Mnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
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
		const v = values[i];          // 0–1 value
		const pct = v * 100;          // just for display
		const color = getColor(v);    // color scale works with 0–1

		const barX = 120;
		const barMaxWidth = width - barX - 20;
		const barWidth = Math.max(v * barMaxWidth, 5);  // scale bar using 0–1 value

		// Label
		ctx.fillStyle = "#4b5563";
		ctx.fillText(label, 10, y + barHeight - 4);

		// Background bar
		ctx.fillStyle = "#e5e7eb";
		roundRect(ctx, barX, y, barMaxWidth, barHeight, 9, true);

		// Filled bar
		ctx.fillStyle = color;
		roundRect(ctx, barX, y, barWidth, barHeight, 9, true);

		// Value text
		ctx.fillStyle = (v > 0.4 ? "#fff" : "#000");
		ctx.textAlign = "center";
		ctx.fillText(
			Math.round(pct),
			barX + barWidth / 2,
			y + barHeight - 4
		);

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

  // Map init
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
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      },
    ).addTo(map);

    function getColor(d) {
		return  d > 0.75  ? '#fc3a3aff' :   // strong red-orange
				d > 0.625 ? '#fd844cff' :   // orange
				d > 0.50  ? '#f9b95fff' :   // light orange
				d > 0.375 ? '#f9d267ff' :   // yellow
				d > 0.25  ? '#C4DF7A' :   // lime-green
				d > 0.125 ? '#A6D96A' :   // green
							'#66BD63';    // deep green
		}



    // Fetch greenspace -> add layer, then boundary -> markers
    fetch(`${BACKEND_BASE_URL}/greenspace`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load greenspace data. Status: ' + res.status);
        return res.json();
      })
      .then(geojsonData => {
        // add greenspace first
        const greens = L.geoJSON(geojsonData, {
          style: feature => {
            const score = feature.properties && feature.properties.pca_compos ? feature.properties.pca_compos : 0;
            return {
              color: "#666",
              weight: 0.5,
              fillColor: getColor(score),
              fillOpacity: 0.8
            };
          }
        }).addTo(map);

        // compute overview averages
        const overviewMetricsVals = computeOverviewFromFeatures(geojsonData.features || []);

        // populate overview info card
        overviewImage.src = 'https://images.unsplash.com/photo-1680244116826-467f252cf503?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxqYWthcnRhJTIwY2l0eSUyMHNreWxpbmV8ZW58MXx8fHwxNzY0NzMwMjU3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral';
        overviewDesc.textContent = 'Jakarta faces significant environmental challenges with high air pollution, dense population, limited green spaces, heavy traffic congestion, and heat island effects. Strategic green space development across districts is essential.';


        // draw overview chart (use values scaled for visualization)
        const overviewValues = indicatorLabels.map(l => (overviewMetricsVals[l.key] || 0));
        drawBarChart(overviewChartCanvas, indicatorLabels.map(l => l.label), overviewValues);

        // After greenspace loaded, fetch boundary
        return fetch('./jakarta_boundary.geojson');
      })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load jakarta_boundary.geojson');
        return res.json();
      })
      .then(boundaryData => {
        // add boundary
        L.geoJSON(boundaryData, {
          style: () => ({
            color: "#000000ff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0
          })
        }).addTo(map);

        // Now add markers last
        const markerLayers = [];
        cities.forEach(city => {
          const divIcon = L.divIcon({
			className: "custom-marker",
			html: `
				<div style="
				width: 14px;
				height: 14px;
				background: #9ca3af;          /* grey-400 */
				border: 2px solid #6b7280;    /* grey-500 border */
				border-radius: 50%;
				box-shadow: 0 2px 4px rgba(0,0,0,0.25); /* depth */
				"></div>
			`,
			iconSize: [14, 14],
			iconAnchor: [7, 7]
			});

          const marker = L.marker(city.coords, { icon: divIcon }).addTo(map);
          marker.on('click', () => {
            // hide overview card
            overviewCard.classList.add('hidden');
            cityCard.classList.remove('hidden');

            // find the polygon that contains this city coords from the greenspace data
            // we need the last-loaded greenspace geojson; fetch it again (could be cached earlier)
            fetch(`${BACKEND_BASE_URL}/greenspace`)
              .then(r => r.json())
              .then(gData => {
                const pt = turf.point([city.coords[1], city.coords[0]]); // turf expects [lng, lat]
                let matched = null;
                (gData.features || []).some(feat => {
                  try {
                    if (feat.geometry && feat.properties) {
                      const bool = turf.booleanPointInPolygon(pt, feat);
                      if (bool) { matched = feat; return true; }
                    }
                  } catch (e) { /* ignore invalid geometry */ }
                  return false;
                });

                // Fill city infocard with either matched polygon properties or fallback
                const props = (matched && matched.properties) ? matched.properties : null;
                populateCityCard(city, props);
              })
              .catch(error => {
                console.error('Error fetching greenspace for city lookup', error);
                populateCityCard(city, null);
              });
          });

          markerLayers.push(marker);
        });

      })
      .catch(err => {
        console.error('Error in map loading sequence:', err);
      });

    // close button — go back to overview
    cityCloseBtn.addEventListener('click', () => {
      cityCard.classList.add('hidden');
      overviewCard.classList.remove('hidden');
    });

    // populate city card with city object and polygon properties (props may be null)
    function populateCityCard(city, props) {
      cityImage.src = city.image || '';
      cityImage.alt = city.name;
      cityName.textContent = city.name;
      cityDesc.textContent = city.description || '';


      // if props exist, use requested keys; else fallback to placeholders
      const getVal = (k) => {
        if (!props) return 0;
        const v = props[k];
        return (typeof v === 'number') ? v : (v ? Number(v) : 0);
      };

      const values = indicatorLabels.map(l => getVal(l.key));
      indicatorLabels.forEach((l, idx) => {
        const percent = Math.round(values[idx] * 100);
        const color = (l.key === 'ndvi' || l.key === 'GA_norm') ? 'green' : 'amber';
      });

      // draw city chart
      drawBarChart(cityChartCanvas, indicatorLabels.map(l => l.label), values);

      // show city card
      cityCard.classList.remove('hidden');
    }}