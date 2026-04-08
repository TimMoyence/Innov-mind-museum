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

    /* Museum markers by category */
    .museum-marker { width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
    .museum-marker-art         { background: #7C3AED; } /* violet */
    .museum-marker-history     { background: #DC2626; } /* red */
    .museum-marker-science     { background: #0891B2; } /* cyan */
    .museum-marker-specialized { background: #EA580C; } /* orange */
    .museum-marker-general     { background: #2563EB; } /* blue */

    /* User position marker (green + pulse) */
    .user-marker {
      width: 18px; height: 18px;
      border-radius: 50%;
      background: #16A34A;
      border: 3px solid #fff;
      box-shadow: 0 0 0 5px rgba(22,163,74,0.3), 0 1px 4px rgba(0,0,0,0.3);
      animation: pulse 2s ease-out infinite;
    }
    @keyframes pulse {
      0%   { box-shadow: 0 0 0 0 rgba(22,163,74,0.5), 0 1px 4px rgba(0,0,0,0.3); }
      70%  { box-shadow: 0 0 0 12px rgba(22,163,74,0), 0 1px 4px rgba(0,0,0,0.3); }
      100% { box-shadow: 0 0 0 0 rgba(22,163,74,0), 0 1px 4px rgba(0,0,0,0.3); }
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
      }).setView([48.8566, 2.3522], 14);

      L.tileLayer('${tileUrl}', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      var typeIcons = {};
      ['art', 'history', 'science', 'specialized', 'general'].forEach(function (t) {
        typeIcons[t] = L.divIcon({
          className: '',
          html: '<div class="museum-marker museum-marker-' + t + '"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          popupAnchor: [0, -10]
        });
      });

      var userIcon = L.divIcon({
        className: '',
        html: '<div class="user-marker"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
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
            var icon = typeIcons[m.museumType] || typeIcons['general'];
            var marker = L.marker([m.lat, m.lng], { icon: icon })
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

      /* Notify React Native when user drags the map to a new area. */
      var dragDebounce = null;
      map.on('dragend', function () {
        clearTimeout(dragDebounce);
        dragDebounce = setTimeout(function () {
          var center = map.getCenter();
          postMessage({ type: 'mapMoved', lat: center.lat, lng: center.lng });
        }, 300);
      });

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
