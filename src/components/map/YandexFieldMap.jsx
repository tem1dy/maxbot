import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Layers3, MapPinned, MousePointer2, Minus, Plus } from "lucide-react";
import { calculatePolygonAreaHa } from "../../lib/geo.js";

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

function toGeoJson(coordinates) {
  const ring = coordinates?.[0] || [];
  return ring.length >= 3 ? { type: "Polygon", coordinates: [ring] } : null;
}

export function YandexFieldMap({ onChange, onAreaChange, onRegionChange }) {
  const node = useRef(null);
  const map = useRef(null);
  const polygon = useRef(null);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [areaHa, setAreaHa] = useState(0);
  const [actionError, setActionError] = useState("");
  const onChangeRef = useRef(onChange);
  const onAreaChangeRef = useRef(onAreaChange);
  const onRegionChangeRef = useRef(onRegionChange);
  const regionTimer = useRef(null);

  useEffect(() => { onChangeRef.current = onChange; onAreaChangeRef.current = onAreaChange; onRegionChangeRef.current = onRegionChange; }, [onChange, onAreaChange, onRegionChange]);

  useEffect(() => {
    let disposed = false;
    loadYandex().then((ymaps) => {
      if (disposed || !node.current) return;
      map.current = new ymaps.Map(node.current, { center: [51.53, 46.03], zoom: 10, type: "yandex#satellite", controls: [] }, { suppressMapOpenBlock: true });

      map.current.events.add("click", (event) => {
        if (polygon.current) return;
        const coords = event.get("coords");
        polygon.current = new ymaps.Polygon([[coords]], {}, {
          editorDrawingCursor: "crosshair",
          fillColor: "6b75ff55",
          strokeColor: "6b75ff",
          strokeWidth: 3,
          draggable: true,
          fillOpacity: 0.32,
        });
        map.current.geoObjects.add(polygon.current);
        setDrawing(true);
        setActionError("");
        polygon.current.editor.startDrawing();
        polygon.current.geometry.events.add("change", updateCurrentGeometry);
        polygon.current.editor.events.add("statechange", updateCurrentGeometry);
      });
    }).catch((loadError) => setError(loadError.message));

    return () => {
      disposed = true;
      map.current?.destroy();
      map.current = null;
      polygon.current = null;
    };
  }, []);

  async function resolveRegion(geometry, ymaps) {
    try {
      const ring = geometry?.coordinates?.[0] || [];
      if (ring.length < 3) return;
      const center = ring.reduce((acc, p) => [acc[0] + Number(p[0]), acc[1] + Number(p[1])], [0, 0]).map((v) => v / ring.length);
      const result = await ymaps.geocode(center, { results: 1 });
      const first = result.geoObjects.get(0);
      const details = first?.properties?.get("metaDataProperty.GeocoderMetaData.AddressDetails");
      const country = details?.Country;
      const area = country?.AdministrativeArea;
      const locality = area?.Locality;
      const name = area?.AdministrativeAreaName || locality?.LocalityName || "";
      const countryName = country?.CountryName || "";
      onRegionChangeRef.current?.([name, countryName].filter(Boolean).join(", "));
    } catch {
      onRegionChangeRef.current?.("");
    }
  }

  function updateCurrentGeometry() {
    const coordinates = polygon.current?.geometry?.getCoordinates();
    const geometry = toGeoJson(coordinates);
    const nextArea = calculatePolygonAreaHa(geometry);
    setPointCount(coordinates?.[0]?.length || 0);
    setAreaHa(nextArea);
    onAreaChangeRef.current?.(nextArea);
    onChangeRef.current?.(geometry);
    if (geometry && window.ymaps) {
      clearTimeout(regionTimer.current);
      regionTimer.current = setTimeout(() => resolveRegion(geometry, window.ymaps), 500);
    }
    return geometry;
  }

  function finish() {
    if (!polygon.current || pointCount < 3) {
      setActionError("Добавьте минимум 3 точки, чтобы завершить контур.");
      return;
    }
    polygon.current.editor.stopDrawing();
    setDrawing(false);
    setActionError("");
    updateCurrentGeometry();
  }

  function reset() {
    if (polygon.current && map.current) map.current.geoObjects.remove(polygon.current);
    polygon.current = null;
    setDrawing(false);
    setPointCount(0);
    setAreaHa(0);
    onAreaChangeRef.current?.(0);
    onRegionChangeRef.current?.("");
    onChangeRef.current?.(null);
    setActionError("");
    clearTimeout(regionTimer.current);
  }

  function zoom(delta) {
    const current = map.current?.getZoom?.();
    if (Number.isFinite(current)) map.current.setZoom(Math.max(3, Math.min(19, current + delta)));
  }

  return <div className="yandex-map-shell">
    <div className="map-topbar">
      <div className="map-info-card">
        <strong><MapPinned size={16} /> Граница поля</strong>
        <span>{pointCount >= 3 ? `${pointCount} точек · ${areaHa ? `${areaHa.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га` : "считаем площадь"}` : drawing ? "Отмечайте точки по контуру участка" : "Нажмите на карту, чтобы начать"}</span>
      </div>
      <div className="map-mode"><Layers3 size={14} /> Спутник</div>
    </div>
    <div ref={node} className="yandex-map" />
    {error ? <div className="map-error">{error}. Проверьте ключ Яндекс.Карт.</div> : <>
      <div className="map-zoom-controls"><button type="button" onClick={() => zoom(1)} aria-label="Приблизить"><Plus size={17} /></button><button type="button" onClick={() => zoom(-1)} aria-label="Отдалить"><Minus size={17} /></button></div>
      <div className="map-center-note"><MousePointer2 size={14} /><span>{drawing ? (pointCount >= 3 ? "Контур готов. Проверьте границу и нажмите «Готово»." : "Добавьте ещё точки по границе участка.") : "Нажмите по карте, чтобы поставить первую точку."}</span></div>
      <div className="map-area-chip">Площадь <strong>{areaHa ? `${areaHa.toFixed(2)} га` : "рассчитается автоматически"}</strong></div>{actionError && <div className="map-action-error" role="alert">{actionError}</div>}
      <div className="map-actions"><button type="button" className="map-action-secondary" onClick={reset}><Eraser size={15} /> Очистить</button><button type="button" className="map-action-primary" onClick={finish}><Check size={15} /> Готово</button></div>
    </>}
  </div>;
}
