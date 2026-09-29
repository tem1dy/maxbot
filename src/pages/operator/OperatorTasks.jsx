import { useEffect, useState } from "react";
import { Button, Input } from "../../components/ui/Controls.jsx";
import { CheckCircle2, ExternalLink, FileUp, Image as ImageIcon, ScanLine, X } from "lucide-react";
import { Link } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";

export function OperatorTasks() {
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState({});
  const [links, setLinks] = useState({});
  const [descriptions, setDescriptions] = useState({});
  const [uploaded, setUploaded] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try { setTasks(await exchangeApi.operatorOrders()); setError(""); }
    catch (loadError) { setError(loadError.message || "Не удалось загрузить активные задания."); }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  async function complete(task) {
    const selectedFile = files[task.id];
    if (!selectedFile && !uploaded[task.id] && !links[task.id]?.trim()) { setError("Добавьте файл результата или ссылку на отчёт."); return; }
    if (selectedFile && selectedFile.size > 25 * 1024 * 1024) { setError("Файл слишком большой. Максимальный размер: 25 МБ."); return; }
    setBusy(task.id); setError(""); setSuccess("");
    try {
      if (files[task.id] && !uploaded[task.id]) {
        await exchangeApi.uploadFile(task.id, files[task.id]);
        setUploaded((current) => ({ ...current, [task.id]: true }));
      }
      await exchangeApi.completeOrder(task.id, { report_url: links[task.id] || "", description: descriptions[task.id] || "" });
      setSuccess(`Заказ «${task.field_name}» завершён. Фермер получил уведомление.`);
      setFiles((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setLinks((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setDescriptions((current) => { const next = { ...current }; delete next[task.id]; return next; });
      setUploaded((current) => { const next = { ...current }; delete next[task.id]; return next; });
      await load();
    } catch (completeError) { setError(completeError.message || "Не удалось завершить заказ."); }
    finally { setBusy(""); }
  }

  return <>
    <section className="page-title-row"><div><span className="eyebrow">ОПЕРАТОР · ЗАДАНИЯ</span><h1>Мои задания</h1><p className="page-lead">Здесь только назначенные вам полёты. Загрузите материал и завершите задание, чтобы фермер сразу получил уведомление.</p></div><span className="counter-badge">{tasks.length} в работе</span></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    {success && <div className="success-alert page-alert" role="status"><CheckCircle2 size={16} /> {success}</div>}
    <section className="tasks-stack">
      {tasks.length ? tasks.map((task) => <article className="glass-card task-card-new" key={task.id}>
        <div className="task-new-head"><div className="list-icon"><ScanLine size={19} /></div><div><span className="eyebrow">АКТИВНОЕ ЗАДАНИЕ</span><strong>{task.field_name}</strong><span>{task.task} · {task.area} га</span></div><span className="status-badge status-in_progress">В работе</span></div>
        <div className="task-context-row"><span>Заказ {task.id.slice(0, 8).toUpperCase()}</span><Link to={`/operator/orders/${task.id}`}>Открыть детали <ExternalLink size={12} /></Link></div>
        {task.description && <div className="task-description">{task.description}</div>}
        <div className="task-result-box"><div><FileUp size={18} /><strong>Файл результата</strong><span>{files[task.id] ? files[task.id].name : "PDF, фото, видео или 3D"}</span></div><label className="file-picker"><span>Выбрать файл</span><input type="file" accept="image/*,application/pdf,video/mp4,.glb,.gltf" onChange={(event) => { const next = event.target.files?.[0] || null; if (next && next.size > 25 * 1024 * 1024) { setError("Файл слишком большой. Максимальный размер: 25 МБ."); event.target.value = ""; return; } setError(""); setFiles({ ...files, [task.id]: next }); }} /></label></div>
        {files[task.id] && files[task.id].type?.startsWith("image/") && <div className="selected-file-preview"><ImageIcon size={15} /><span>{files[task.id].name}</span><button type="button" onClick={() => setFiles({ ...files, [task.id]: null })} aria-label="Убрать выбранный файл"><X size={14} /></button></div>}
        <Input placeholder="Или ссылка на внешний отчёт (https://…)" value={links[task.id] || ""} onChange={(event) => setLinks({ ...links, [task.id]: event.target.value })} />
        <textarea className="task-description-input" placeholder="Коротко опишите, что проверено и что входит в результат" rows="3" maxLength="1000" value={descriptions[task.id] || ""} onChange={(event) => setDescriptions({ ...descriptions, [task.id]: event.target.value })} />
        <div className="task-submit-row"><span>{uploaded[task.id] ? "Файл загружен. Можно отправить результат." : "Нужен хотя бы файл или внешняя ссылка"}</span><Button mode="primary" size="large" onClick={() => complete(task)} disabled={busy === task.id} iconBefore={<CheckCircle2 size={17} />}>{busy === task.id ? "Отправляем…" : "Завершить и отправить"}</Button></div>
      </article>) : <div className="empty-state glass-card"><CheckCircle2 size={32} /><h2>Активных заданий нет</h2><p className="page-lead">После выбора вашего предложения назначенное задание появится здесь.</p><Link to="/operator" className="primary-link">Вернуться на биржу</Link></div>}
    </section>
  </>;
}
