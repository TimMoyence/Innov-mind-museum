import { buildLeafletHtml } from '@/features/museum/infrastructure/leafletHtml';

describe('buildLeafletHtml', () => {
  it('returns an HTML string containing Leaflet script', () => {
    const html = buildLeafletHtml({ isDark: false });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('leaflet@1.9.4/dist/leaflet.js');
    expect(html).toContain('leaflet@1.9.4/dist/leaflet.css');
  });

  it('uses light tile URL in light mode', () => {
    const html = buildLeafletHtml({ isDark: false });

    expect(html).toContain('light_all');
    expect(html).not.toContain('dark_all');
  });

  it('uses dark tile URL in dark mode', () => {
    const html = buildLeafletHtml({ isDark: true });

    expect(html).toContain('dark_all');
    expect(html).not.toContain('light_all');
  });

  it('applies dark background color in dark mode', () => {
    const html = buildLeafletHtml({ isDark: true });

    expect(html).toContain('#0F172A');
  });

  it('applies light background color in light mode', () => {
    const html = buildLeafletHtml({ isDark: false });

    expect(html).toContain('#EAF2FF');
  });

  it('contains the map container div', () => {
    const html = buildLeafletHtml({ isDark: false });

    expect(html).toContain('id="map"');
  });
});
