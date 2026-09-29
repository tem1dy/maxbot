import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Map, Plus, Ruler, Search, Trash2, X } from "lucide-react";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { YandexFieldMap } from "../../components/map/YandexFieldMap.jsx";
import { YandexFieldPreview } from "../../components/map/YandexFieldPreview.jsx";
import { Button, ConfirmDialog, Input } from "../../components/ui/Controls.jsx";
import { formatAreaHa, isValidPolygon } from "../../lib/geo.js";

const crops = [
  "Пшеница", "Ячмень", "Рожь", "Овёс", "Кукуруза", "Подсолнечник", "Рапс", "Соя", "Горох", "Чечевица", "Нут", "Гречиха", "Просо", "Сорго", "Сахарная свёкла", "Картофель", "Лён", "Горчица", "Люпин", "Тритикале", "Фасоль", "Кормовые травы", "Клевер", "Люцерна", "Вика", "Табак",
  "Рис", "Хлопок", "Помидоры", "Огурцы", "Капуста", "Морковь", "Свёкла", "Лук", "Чеснок", "Перец", "Баклажан", "Тыква", "Кабачок", "Салат", "Шпинат", "Редис", "Редька", "Репа", "Брокколи", "Цветная капуста", "Фасоль стручковая", "Кукуруза сахарная", "Другое",
  "Яблоня", "Груша", "Слива", "Вишня", "Черешня", "Абрикос", "Персик", "Виноград", "Смородина", "Крыжовник", "Малина", "Ежевика", "Клубника", "Облепиха", "Льняное семя", "Семечковые", "Плодовые культуры", "Ягодные культуры", "Овощные культуры", "Садовые культуры"
];

export function FarmerFields() {
  const [fields, setFields] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", crop: "", customCrop: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [geometry, setGeometry] = useState(null);
  const [region, setRegion] = useState("");
  const [area, setArea] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [loading, setLoading] = useState(true);
  const [savedNotice, setSavedNotice] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropQuery, setCropQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const loadSequence = useState({ value: 0 })[0];

  async function load() {
    const requestId = ++loadSequence.value;
    setLoading(true);
    setError("");
    try {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const nextFields = await exchangeApi.fields();
          if (requestId !== loadSequence.value) return;
          setFields(Array.isArray(nextFields) ? nextFields : []);
          return;
        } catch (loadError) {
          lastError = loadError;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
      throw lastError || new Error("Не удалось загрузить поля.");
    } catch (loadError) {
      if (requestId === loadSequence.value) setError(loadError.message || "Не удалось загрузить поля.");
    } finally {
      if (requestId === loadSequence.value) setLoading(false);
    }
  }
  useEffect(() => { load(); const refresh = () => load(); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, []);

  async function submit(event) {
    event.preventDefault();
    const cropValue = form.crop === "Другое" ? form.customCrop.trim() : form.crop.trim();
    const nextErrors = {};
    const fieldName = form.name.trim();
    if (fieldName && fieldName.length < 2) nextErrors.name = "Название должно содержать минимум 2 символа.";
    if (fieldName && !/^[\p{L}\p{N}][\p{L}\p{N} .№()_-]*$/u.test(fieldName)) nextErrors.name = "Используйте буквы, цифры, пробелы и обычные знаки препинания.";
    if (!cropValue) nextErrors.crop = "Выберите культуру, чтобы сохранить поле.";
    else if (!/\p{L}/u.test(cropValue)) nextErrors.crop = "Название культуры должно содержать буквы.";
    if (!isValidPolygon(geometry) || !area) nextErrors.geometry = "Разметьте границу поля на карте. Площадь посчитается автоматически.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setError("Проверьте выделенные поля."); return; }
    setSaving(true); setError("");
    try {
      const created = await exchangeApi.createField({ name: fieldName, crop: cropValue, region, geometry });
      window.dispatchEvent(new CustomEvent("pole:field-created", { detail: created }));
      setForm({ name: "", crop: "", customCrop: "" }); setFieldErrors({}); setGeometry(null); setRegion(""); setArea(0); setShowForm(false); await load();
      setSavedNotice(`Поле №${created.field_number}${created.name ? ` «${created.name}»` : ""} сохранено.`);
      window.setTimeout(() => setSavedNotice(""), 3200);
    } catch (saveError) { setError(saveError.message || "Не удалось сохранить поле."); }
    finally { setSaving(false); }
  }

  function requestRemoveField(field) { setDeleteError(""); setDeleteTarget(field); }

  async function removeField() {
    const field = deleteTarget;
    if (!field) return;
    setDeleting(field.id); setDeleteError("");
    try {
      await exchangeApi.deleteField(field.id);
      setDeleteTarget(null);
      window.dispatchEvent(new CustomEvent("pole:field-deleted"));
      await load();
    } catch (deleteError) {
      setDeleteError(deleteError.message || "Не удалось удалить поле.");
    } finally { setDeleting(""); }
  }

  const visibleCrops = crops.filter((crop) => crop.toLocaleLowerCase("ru-RU").includes(cropQuery.trim().toLocaleLowerCase("ru-RU")));

  function chooseCrop(value) {
    setForm((current) => ({ ...current, crop: value, customCrop: "" }));
    setCropQuery("");
    setCropOpen(false);
    if (fieldErrors.crop) setFieldErrors((items) => ({ ...items, crop: "" }));
  }

  function validateFieldPart(kind, value) {
    const next = { ...fieldErrors };
    const text = String(value ?? "").trim();
    if (kind === "name") {
      next.name = text && text.length < 2 ? "Название должно содержать минимум 2 символа." : "";
      if (text && next.name === "" && !/^[\p{L}\p{N}][\p{L}\p{N} .№()_-]*$/u.test(text)) next.name = "Используйте буквы, цифры, пробелы и обычные знаки препинания.";
    } else if (kind === "crop") {
      const cropValue = form.crop === "Другое" ? form.customCrop.trim() : text;
      next.crop = !cropValue ? "Выберите культуру." : /\p{L}/u.test(cropValue) ? "" : "Название культуры должно содержать буквы.";
    }
    setFieldErrors(next);
  }

  return <>
    <section className="page-title-row"><div><span className="eyebrow">ПОЛЯ</span><h1>Мои поля</h1><p className="page-lead">Сохранённые участки для быстрых заказов на облёт.</p></div><span className="counter-badge">{fields.length} {fields.length === 1 ? "поле" : "полей"}</span></section>
    {error && <div className="form-error page-alert" role="alert">{error}<button type="button" className="alert-retry" onClick={load}>Повторить</button></div>}
    {loading && <div className="loading-state glass-card"><div className="loading-pulse" /><span>Загружаем сохранённые поля…</span></div>}
    {savedNotice && <div className="success-alert page-alert" role="status">{savedNotice}</div>}

    <section className="glass-card create-cta"><div><span className="eyebrow">НОВОЕ ПОЛЕ</span><strong>Добавьте участок</strong><p>Назовите поле, выберите культуру и разметьте границу на спутниковой карте. Номер и площадь присвоим автоматически.</p></div><Button mode="primary" onClick={() => setShowForm((value) => !value)} iconBefore={<Plus size={17} />}>{showForm ? "Скрыть" : "Добавить поле"}</Button></section>

    {showForm && <form className="glass-card order-form form-card-wide" onSubmit={submit} noValidate>
      <div className="form-step"><span>01</span><div><strong>Данные поля</strong><small>Номер присвоится автоматически. Название можно оставить пустым.</small></div></div>
      <label className={`field-label ${fieldErrors.name ? "has-error" : ""}`}>Название поля <span className="optional-label">необязательно</span><Input value={form.name} maxLength={80} onBlur={(event) => validateFieldPart("name", event.target.value)} onChange={(event) => { setForm({ ...form, name: event.target.value }); if (fieldErrors.name) setFieldErrors((items) => ({ ...items, name: "" })); }} placeholder="Например, Северное" aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}</label>
      <label className={`field-label ${fieldErrors.crop ? "has-error" : ""}`}>Культура
        <div className={`crop-picker ${cropOpen ? "is-open" : ""} ${fieldErrors.crop ? "is-invalid" : ""}`}>
          <div className="crop-picker-input-row">
            <Search size={17} aria-hidden="true" />
            <input
              value={cropOpen ? cropQuery : form.crop}
              onFocus={() => { setCropOpen(true); setCropQuery(""); }}
              onChange={(event) => { setCropOpen(true); setCropQuery(event.target.value); setForm((current) => ({ ...current, crop: "", customCrop: "" })); if (fieldErrors.crop) setFieldErrors((items) => ({ ...items, crop: "" })); }}
              onBlur={() => window.setTimeout(() => setCropOpen(false), 120)}
              placeholder="Найдите культуру или выберите из списка"
              aria-label="Культура"
              aria-expanded={cropOpen}
              role="combobox"
              autoComplete="off"
            />
            <ChevronDown size={17} className="crop-picker-chevron" aria-hidden="true" />
          </div>
          {cropOpen && <div className="crop-picker-menu" role="listbox">
            {visibleCrops.length ? visibleCrops.map((crop) => (
              <button type="button" key={crop} role="option" aria-selected={form.crop === crop} className={form.crop === crop ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseCrop(crop)}><span>{crop}</span>{form.crop === crop && <Check size={15} />}</button>
            )) : <div className="crop-picker-empty">Ничего не найдено. Выберите «Другое» и укажите название вручную.</div>}
          </div>}
        </div>
        {form.crop === "Другое" && <div className="crop-custom-row"><Input value={form.customCrop} onBlur={(event) => validateFieldPart("crop", event.target.value)} onChange={(event) => { setForm({ ...form, customCrop: event.target.value }); if (fieldErrors.crop) setFieldErrors((items) => ({ ...items, crop: "" })); }} placeholder="Введите культуру вручную" maxLength={80} aria-invalid={Boolean(fieldErrors.crop)} /><button type="button" className="crop-clear-button" onClick={() => setForm((current) => ({ ...current, crop: "", customCrop: "" }))} aria-label="Очистить культуру"><X size={15} /></button></div>}
        {fieldErrors.crop && <span className="field-error">{fieldErrors.crop}</span>}
      </label>
      <div className="auto-area-card"><Ruler size={18} /><div><span>Площадь участка</span><strong>{area ? formatAreaHa(area) : "Рассчитается после разметки"}</strong></div></div>
      <div className="form-step"><span>02</span><div><strong>Граница поля</strong><small>Нарисуйте контур. Площадь и геометрия сохранятся автоматически.</small></div></div>
      <div className={fieldErrors.geometry ? "map-field-error-wrap" : ""}><YandexFieldMap onChange={(next) => { setGeometry(next); if (isValidPolygon(next)) setFieldErrors((items) => ({ ...items, geometry: "" })); }} onAreaChange={setArea} onRegionChange={setRegion} />{fieldErrors.geometry && <div className="field-error map-field-error">{fieldErrors.geometry}</div>}</div>
      <div className="form-actions-row"><div><strong>{area ? "Контур готов" : "Граница ещё не задана"}</strong><span>{area ? formatAreaHa(area) : "Разметьте участок на карте"}</span></div><Button mode="primary" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить поле"}</Button></div>
    </form>}

    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">РЕЕСТР</span><h2>Сохранённые участки</h2></div></div>
      <div className="field-cards">{!loading && fields.length ? fields.map((field) => <article className="field-register-card glass-card" key={field.id}>
        <div className="field-card-content"><div className="field-card-top"><div className="field-thumb"><Map size={23} /></div><div><span className="eyebrow">{field.crop || "Культура"}</span><strong>{`Поле №${field.field_number || "—"}`}{field.name ? ` · ${field.name}` : ""}</strong><span>{formatAreaHa(field.area)}</span></div><button className="icon-button field-delete" type="button" aria-label={`Удалить поле ${field.field_number || ""}`} onClick={() => requestRemoveField(field)} disabled={deleting === field.id} title="Удалить поле"><Trash2 size={16} /></button></div><div className="field-card-meta">{field.region && <span>{field.region}</span>}<span>Добавлено {new Date(field.created_at).toLocaleDateString("ru-RU")}</span></div></div>
        <div className="field-card-map"><YandexFieldPreview geometry={field.geometry} /></div>
      </article>) : !loading && <div className="empty-state glass-card"><Map size={32} /><h2>Пока нет полей</h2><p>Добавьте первый участок, чтобы быстро создавать заказы.</p></div>}</div>
    </section>
    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title="Удалить поле?"
      description={deleteTarget ? `Поле №${deleteTarget.field_number || "—"}${deleteTarget.name ? ` «${deleteTarget.name}»` : ""} будет удалено из реестра. Завершённые заказы сохранят данные поля.` : ""}
      confirmLabel="Удалить поле"
      icon={<Trash2 size={21} />}
      busy={Boolean(deleting)}
      onCancel={() => !deleting && setDeleteTarget(null)}
      onConfirm={removeField}
    >
      {deleteError && <div className="confirm-dialog-error" role="alert">{deleteError}</div>}
    </ConfirmDialog>
  </>;
}
