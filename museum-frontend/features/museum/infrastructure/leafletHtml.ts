/**
 * Generates a self-contained HTML string for a Leaflet map rendered inside a WebView.
 *
 * Communication protocol (React Native → WebView):
 *   - `setMarkers`      : replace all markers
 *   - `setUserPosition` : show / move user blue dot
 *   - `fitBounds`       : adjust viewport
 *
 * Communication protocol (WebView → React Native):
 *   - `mapReady`     : map is initialized
 *   - `markerClick`  : user tapped a museum marker (carries `id`)
 */

interface LeafletHtmlOptions {
  /** When true, map tiles use a dark palette and UI elements follow suit. */
  isDark: boolean;
}

export const buildLeafletHtml = ({ isDark }: LeafletHtmlOptions): string => {
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const popupTextColor = isDark ? '#F8FAFC' : '#0F172A';
  const popupBg = isDark ? '#1E293B' : '#FFFFFF';

  return /* html */ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    body { background: ${isDark ? '#0F172A' : '#EAF2FF'}; }

    /* Museum marker */
    .museum-marker {
      width: 14px; height: 14px;
      border-radius: 50%;
      background: #1D4ED8;
      border: 2.5px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }

    /* User position marker */
    .user-marker {
      width: 16px; height: 16px;
      border-radius: 50%;
      background: #3B82F6;
      border: 3px solid #fff;
      box-shadow: 0 0 0 4px rgba(59,130,246,0.25), 0 1px 4px rgba(0,0,0,0.3);
    }

    /* Popup styling */
    .leaflet-popup-content-wrapper {
      background: ${popupBg};
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .leaflet-popup-content {
      margin: 8px 12px;
      color: ${popupTextColor};
      font: 600 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-popup-tip { background: ${popupBg}; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function () {
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: true
      }).setView([48.8566, 2.3522], 12);

      L.tileLayer('${tileUrl}', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      var museumIcon = L.divIcon({
        className: '',
        html: '<div class="museum-marker"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -10]
      });

      var userIcon = L.divIcon({
        className: '',
        html: '<div class="user-marker"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      var markerLayer = L.layerGroup().addTo(map);
      var userMarker = null;

      function postMessage(data) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(data));
        }
      }

      function handleMessage(event) {
        var data;
        try {
          data = JSON.parse(typeof event.data === 'string' ? event.data : '');
        } catch (_) { return; }

        if (data.type === 'setMarkers') {
          markerLayer.clearLayers();
          (data.markers || []).forEach(function (m) {
            var marker = L.marker([m.lat, m.lng], { icon: museumIcon })
              .bindPopup(m.name);
            marker.on('click', function () {
              postMessage({ type: 'markerClick', id: m.id });
            });
            markerLayer.addLayer(marker);
          });
        }

        if (data.type === 'setUserPosition') {
          if (userMarker) {
            userMarker.setLatLng([data.lat, data.lng]);
          } else {
            userMarker = L.marker([data.lat, data.lng], { icon: userIcon }).addTo(map);
          }
        }

        if (data.type === 'fitBounds') {
          map.fitBounds(data.bounds, { padding: [40, 40], maxZoom: 15 });
        }
      }

      /* React Native sends messages via both window.postMessage and document event */
      document.addEventListener('message', handleMessage);
      window.addEventListener('message', handleMessage);

      postMessage({ type: 'mapReady' });
    })();
  </script>
</body>
</html>
`;
};
