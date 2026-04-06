'use client';

import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const museums: [number, number][] = [
  [2.3376, 48.8606],  // Louvre
  [2.3265, 48.8600],  // Orsay
  [2.3522, 48.8607],  // Pompidou
  [2.3157, 48.8554],  // Rodin
  [2.3225, 48.8639],  // Orangerie
  [2.3594, 48.8662],  // Arts et Metiers
  [2.3321, 48.8480],  // Cluny
  [2.2945, 48.8583],  // Quai Branly
];

export default function DemoMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [2.3376, 48.8600],
      zoom: 13,
      interactive: false,
      attributionControl: false,
    });

    map.on('load', () => {
      for (const [lng, lat] of museums) {
        const el = document.createElement('div');
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = 'var(--color-primary-500, #2563eb)';
        el.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.3)';
        el.style.animation = 'pulse-marker 2s ease-in-out infinite';

        new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    });

    return () => { map.remove(); };
  }, []);

  return (
    <>
      <style>{`
        @keyframes pulse-marker {
          0%, 100% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.1); }
        }
      `}</style>
      <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
    </>
  );
}
