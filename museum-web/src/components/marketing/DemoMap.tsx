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
      // Allow drag/pan for tactile feel, but lock zoom & rotate to avoid scroll hijack
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      dragRotate: false,
      keyboard: false,
      dragPan: true,
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
        el.style.cursor = 'pointer';
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
        @keyframes pulse-location {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div
          ref={mapRef}
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        />

        {/* Search bar overlay (under iOS status bar at top: 44px) */}
        <div
          className="pointer-events-none absolute z-10"
          style={{ top: 44, left: 8, right: 8 }}
          aria-hidden="true"
        >
          <div
            style={{
              borderRadius: 14,
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(20px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
              padding: '9px 12px',
              fontSize: 12,
              color: '#475569',
              border: '1px solid rgba(148,163,184,0.25)',
              boxShadow: '0 2px 10px rgba(15,23,42,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
            <span>Rechercher un musée…</span>
          </div>
        </div>

        {/* "My location" pulsing dot — center */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10"
          style={{ transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        >
          <div style={{ position: 'relative', width: 14, height: 14 }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: '#3b82f6',
                animation: 'pulse-location 2.2s ease-out infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 3,
                borderRadius: '50%',
                background: '#1d4ed8',
                border: '1.5px solid #ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        </div>

        {/* Bottom sheet — decorative */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-10"
          aria-hidden="true"
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(24px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: '8px 14px 14px',
              borderTop: '1px solid rgba(148,163,184,0.25)',
              boxShadow: '0 -4px 14px rgba(15,23,42,0.08)',
            }}
          >
            {/* Drag handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: 'rgba(148,163,184,0.55)',
                margin: '0 auto 8px',
              }}
            />
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
              }}
            >
              20 musées à proximité
            </div>
            <div
              style={{
                fontSize: 10,
                color: '#64748b',
                marginTop: 2,
              }}
            >
              Triés par distance
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
