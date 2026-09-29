import { useEffect, useRef, useState } from "react";
import { calculatePolygonAreaHa, getRing } from "../../lib/geo.js";

let yandexPromise;
function loadYandex() {
  if (window.ymaps) return Promise.resolve(window.ymaps);
  if (!yandexPromise) yandexPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const key = import.meta.env.VITE_YANDEX_MAPS_API_KEY;
    script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU${key ? `&apikey=${encodeURIComponent(key)}` : ""}`;
    script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс.Карты"));
    document.head.appendChild(script);
  });
  return yandexPromise;
}

export function YandexFieldPreview({ geometry }) {
  const node = useRef(null);
  const map = useRef(null);
  const [error, setError] = useState("");
  const ring = getRing(geometry);
  const area = calculatePolygonAreaHa(geometry);

  useEffect(() => {
    if (ring.length < 3) return undefined;
    let disposed = false;
    loadYandex().then((ymaps) => {
      if (disposed || !node.current) return;
      const center = ring.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]).map((value) => value / ring.length);
      map.current = new ymaps.Map(node.current, { center, zoom: 13, type: "yandex#satellite", controls: [] }, { suppressMapOpenBlock: true });
      const polygon = new ymaps.Polygon([ring], {}, { fillColor: "6f7cff55", strokeColor: "92a0ff", strokeWidth: 3 });
      map.current.geoObjects.add(polygon);
      try { map.current.setBounds(polygon.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 26 }); } catch {  }
    }).catch((loadError) => setError(loadError.message));
    return () => { disposed = true; map.current?.destroy(); map.current = null; };
  }, [geometry, ring.length]);

  if (ring.length < 3) return <div className="detail-map-placeholder"><span>Граница участка ещё не задана.</span></div>;
  if (error) return <div className="detail-map-placeholder"><span>{error}</span></div>;
  return <div className="field-preview-shell"><div className="field-preview-map" ref={node} aria-label="Граница поля на спутниковой Яндекс.Карте" /><span className="field-preview-area">{area ? `${area.toFixed(2)} га` : "Площадь не рассчитана"}</span></div>;
}
