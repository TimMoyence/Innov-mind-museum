/* eslint-disable @typescript-eslint/restrict-template-expressions -- HTML template with numeric design tokens injected as px values */
import {
  semantic,
  space,
  radius,
  primaryScale,
  textColors,
  darkTextColors,
  surfaceColors,
  darkSurfaceColors,
} from '@/shared/ui/tokens';

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

  const popupTextColor = isDark ? darkTextColors.primary : textColors.primary;
  const popupBg = isDark ? darkSurfaceColors.elevated : surfaceColors.default;

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
    body { background: ${isDark ? darkSurfaceColors.default : primaryScale['50']}; }

    /* Museum markers by category */
    .museum-marker { width: ${space['3.5']}px; height: ${space['3.5']}px; border-radius: 50%; border: 2.5px solid ${semantic.mapMarker.markerBorder}; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
    .museum-marker-art         { background: ${semantic.mapMarker.museum}; } /* violet */
    .museum-marker-history     { background: ${semantic.mapMarker.restaurant}; } /* red */
    .museum-marker-science     { background: ${semantic.mapMarker.cafe}; } /* cyan */
    .museum-marker-specialized { background: ${semantic.mapMarker.shop}; } /* orange */
    .museum-marker-general     { background: ${semantic.mapMarker.default}; } /* blue */

    /* User position marker (green + pulse) */
    .user-marker {
      width: ${semantic.card.paddingLarge}px; height: ${semantic.card.paddingLarge}px;
      border-radius: 50%;
      background: ${semantic.mapMarker.user};
      border: 3px solid ${semantic.mapMarker.userBorder};
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
      border-radius: ${radius.DEFAULT}px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    .leaflet-popup-content {
      margin: ${semantic.card.gapSmall}px ${semantic.card.gap}px;
      color: ${popupTextColor};
      font: 600 ${semantic.form.labelSize}px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-popup-tip { background: ${popupBg}; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function () {
      /**
       * Initial viewport: low-zoom world view (~4 tiny tiles) instead of a
       * hardcoded city. Avoids loading 16 useless tiles for a place the user
       * is not — those in-flight requests interfere with the next setView,
       * leaving blank tiles until manual zoom forces a redraw. RN sends a
       * fitBounds() as soon as user/museum data arrives.
       */
      var map = L.map('map', {
        zoomControl: false,
        attributionControl: true
      }).setView([20, 0], 2);

      var tileLayer = L.tileLayer('${tileUrl}', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
      }).addTo(map);

      var typeIcons = {};
      ['art', 'history', 'science', 'specialized', 'general'].forEach(function (t) {
        typeIcons[t] = L.divIcon({
          className: '',
          html: '<div class="museum-marker museum-marker-' + t + '"></div>',
          iconSize: [${space['3.5']}, ${space['3.5']}],
          iconAnchor: [${space['3.5'] / 2}, ${space['3.5'] / 2}],
          popupAnchor: [0, -${space['2.5']}]
        });
      });

      var userIcon = L.divIcon({
        className: '',
        html: '<div class="user-marker"></div>',
        iconSize: [${semantic.card.paddingLarge}, ${semantic.card.paddingLarge}],
        iconAnchor: [${semantic.card.paddingLarge / 2}, ${semantic.card.paddingLarge / 2}]
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
          /**
           * Fix tile race: when fitBounds happens just after mapReady (the
           * common case — RN flushes its message queue then immediately
           * sends bounds), Leaflet sometimes computes the new tile grid
           * before the WebView has settled its layout, leaving holes.
           * invalidateSize forces a recompute against the real container
           * size; tileLayer.redraw() re-fetches any missing tile.
           */
          requestAnimationFrame(function () {
            map.invalidateSize();
            map.fitBounds(data.bounds, { padding: [${space['10']}, ${space['10']}], maxZoom: 15 });
            tileLayer.redraw();
          });
        }
      }

      /* Notify React Native when user drags the map to a new area. */
      var dragDebounce = null;
      map.on('dragend', function () {
        clearTimeout(dragDebounce);
        dragDebounce = setTimeout(function () {
          var center = map.getCenter();
          var bounds = map.getBounds();
          postMessage({
            type: 'mapMoved',
            lat: center.lat,
            lng: center.lng,
            bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
          });
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
