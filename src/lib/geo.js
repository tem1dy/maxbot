const EARTH_RADIUS_M = 6378137;

export function parseGeometry(geometry) {
  if (!geometry) return null;
  if (typeof geometry === "string") {
    try { return JSON.parse(geometry); } catch { return null; }
  }
  return geometry;
}

export function getRing(geometry) {
  return parseGeometry(geometry)?.coordinates?.[0] || [];
}

export function isValidPolygon(geometry) {
  const ring = getRing(geometry);
  return ring.length >= 3;
}

export function calculatePolygonAreaHa(geometry) {
  const ring = getRing(geometry);
  if (ring.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    const lon1 = Number(current?.[1]) * Math.PI / 180;
    const lat1 = Number(current?.[0]) * Math.PI / 180;
    const lon2 = Number(next?.[1]) * Math.PI / 180;
    const lat2 = Number(next?.[0]) * Math.PI / 180;
    if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return 0;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const squareMeters = Math.abs(area) * EARTH_RADIUS_M * EARTH_RADIUS_M / 2;
  return squareMeters / 10000;
}

export function formatAreaHa(area) {
  const value = Number(area);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га`;
}
