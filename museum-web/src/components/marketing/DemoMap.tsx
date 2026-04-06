'use client';

import { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const museums: [number, number][] = [
  [2.3376, 48.8606], // Louvre
  [2.3265, 48.86], // Orsay
  [2.3522, 48.8607], // Pompidou
  [2.3157, 48.8554], // Rodin
  [2.3225, 48.8639], // Orangerie
  [2.3594, 48.8662], // Arts et Metiers
  [2.3321, 48.848], // Cluny
  [2.2945, 48.8583], // Quai Branly
  [2.3435, 48.861], // Carnavalet
  [2.3127, 48.8738], // Monceau
  [2.3269, 48.8738], // Jacquemart-Andre
  [2.318, 48.8614], // Palais de Tokyo
  [2.3101, 48.8649], // Galliera
  [2.2965, 48.8622], // Marmottan
  [2.344, 48.853], // Institut du Monde Arabe
  [2.36, 48.853], // Muséum Histoire Naturelle
  [2.35, 48.844], // Manufacture des Gobelins
  [2.337, 48.877], // Musée de la Vie Romantique
  [2.3475, 48.8835], // Montmartre
  [2.287, 48.858], // Palais de Chaillot
];

export default function DemoMap() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [2.3376, 48.862],
      zoom: 12.5,
      scrollZoom: false,
      attributionControl: false,
    });

    map.on('load', () => {
      for (const [lng, lat] of museums) {
        const el = document.createElement('div');
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#2563eb';
        el.style.boxShadow = '0 0 0 4px rgba(37, 99, 235, 0.3)';
        el.style.animation = 'pulse-marker 2s ease-in-out infinite';

        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      }
    });

    return () => {
      map.remove();
    };
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
