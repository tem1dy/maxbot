import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmDialog } from "../../components/ui/Controls.jsx";
import { ClipboardList, Download, ExternalLink, FileBox, Image as ImageIcon, PlaySquare, ScanLine, Share2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { downloadMaxFile, openMaxFile, notifyMax, shareMaxContent } from "../../lib/maxBridge.js";

function apiUrl(path) { return path?.startsWith("http") ? path : `${window.location.origin}${path || ""}`; }
function fileIcon(type) { if (type?.startsWith("image/")) return ImageIcon; if (type === "video/mp4") return PlaySquare; return FileBox; }
function isPreviewableImage(type) { return type?.startsWith("image/"); }

async function exportResultReport(result) {
  const url = apiUrl(result.report_download_url || `/api/orders/${result.order_id}/report.pdf`);
  await downloadMaxFile(url, `pole-${result.order_id.slice(0, 8)}-otchet.pdf`);
}

async function shareResult(result) {
  const link = apiUrl(result.report_share_url || `/api/orders/${result.order_id}/report.pdf`);
  try {
    await shareMaxContent({ text: `Отчёт по ${result.field_name}`, link });
    notifyMax("success");
  } catch (error) {
    throw new Error(error?.message || "Не удалось поделиться отчётом.");
  }
}
function prettySize(bytes) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "Размер не указан";
  const value = Number(bytes);
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

export function FarmerResults() {
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);
  const [actionError, setActionError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => { exchangeApi.results().then(setResults).catch((loadError) => setError(loadError.message || "Не удалось загрузить результаты.")); }, []);

  const filesCount = useMemo(() => results.reduce((sum, result) => sum + (result.files?.length || 0), 0), [results]);
  const imagesCount = useMemo(() => results.reduce((sum, result) => sum + (result.files || []).filter((file) => isPreviewableImage(file.content_type)).length, 0), [results]);

  return <>
    <section className="page-title-row"><div><span className="eyebrow">РЕЗУЛЬТАТЫ</span><h1>Результаты облётов</h1></div></section>
    {error && <div className="form-error page-alert" role="alert">{error}</div>}
    {actionError && <div className="form-error page-alert" role="alert">{actionError}</div>}
    <section className="result-stats"><div className="glass-card"><span>Завершено</span><strong>{results.length}</strong><small>заказов дали результат</small></div><div className="glass-card"><span>Материалы</span><strong>{filesCount}</strong><small>файлов загружено</small></div><div className="glass-card"><span>Снимки</span><strong>{imagesCount}</strong><small>доступно для просмотра</small></div></section>

    <section className="results-list">{results.length ? results.map((result) => <article className="result-card glass-card" key={result.id}>
      <div className="result-card-head"><div className="result-icon"><ScanLine size={20} /></div><div><span className="eyebrow">{result.task}</span><strong>{result.field_name}</strong><span>{Number(result.area || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} га · {new Date(result.created_at).toLocaleDateString("ru-RU")}</span></div><span className="status-badge status-completed">Готово</span></div>
      <div className="result-summary"><span className="eyebrow">ОТЧЁТ О ВЫПОЛНЕНИИ</span><p>{result.description || "Оператор завершил заказ. Материалы доступны ниже."}</p></div>
      {result.files?.some((file) => isPreviewableImage(file.content_type)) && <div className="result-gallery">{result.files.filter((file) => isPreviewableImage(file.content_type)).slice(0, 4).map((file) => <button type="button" className="result-thumb" key={file.id} onClick={() => setActive({ result, file: { ...file, url: file.download_url || file.url } })}><img src={apiUrl(file.url)} alt={`Материал ${file.name}`} loading="lazy" /></button>)}</div>}
      <div className="result-files">{result.files?.length ? result.files.map((file) => { const Icon = fileIcon(file.content_type); const url = apiUrl(file.url); const downloadUrl = apiUrl(file.download_url || file.url); return <div className="result-file" key={file.id}><div className="file-type-icon"><Icon size={18} /></div><div><strong>{file.name}</strong><span>{prettySize(file.size)}</span></div><div className="result-file-actions"><button type="button" className="inline-file-action" onClick={async () => { try { setActionError(""); await downloadMaxFile(downloadUrl, file.name); } catch (err) { setActionError(err?.message || "Не удалось скачать файл."); } }}><Download size={15} /> Скачать</button><button type="button" className="inline-file-action" onClick={async () => { try { setActionError(""); await openMaxFile(downloadUrl); } catch (err) { setActionError(err?.message || "Не удалось открыть файл."); } }}><ExternalLink size={15} /> Открыть</button></div></div>; }) : <div className="result-empty-file">Файлы не прикреплены. Проверьте ссылку на отчёт ниже.</div>}</div>
      {result.report_url && <a className="report-link" href={result.report_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Внешний отчёт</a>}
      <div className="result-card-footer"><span>Заказ {result.order_id.slice(0, 8).toUpperCase()}</span><div className="result-footer-actions"><Link to={`/farmer/results/${result.id}`} className="result-open-detail"><FileBox size={14} /> Открыть отчёт</Link><button type="button" className="inline-file-action" onClick={async () => { try { setActionError(""); await exportResultReport(result); } catch (err) { setActionError(err?.message || "Не удалось экспортировать PDF."); } }}><Download size={14} /> Экспортировать PDF</button><button type="button" className="inline-file-action" onClick={async () => { try { setActionError(""); await shareResult(result); } catch (err) { setActionError(err?.message || "Не удалось поделиться отчётом."); } }}><Share2 size={14} /> Поделиться</button><button type="button" className="inline-file-action result-delete-action" onClick={() => { setDeleteError(""); setDeleteTarget(result); }}><Trash2 size={14} /> Удалить</button><Link to={`/farmer/orders/${result.order_id}`} className="result-back-order"><ClipboardList size={14} /> К заказу</Link></div></div>
    </article>) : <div className="empty-state glass-card"><FileBox size={34} /><h2>Результатов пока нет</h2><p className="page-lead">Когда оператор завершит заказ, материалы появятся здесь автоматически.</p><Link to="/farmer/orders" className="primary-link">Открыть заказы</Link></div>}</section>

    <ConfirmDialog
      open={Boolean(deleteTarget)}
      title="Удалить отчёт?"
      description={deleteTarget ? `Отчёт по ${deleteTarget.field_name} будет удалён вместе с прикреплёнными материалами. Это действие нельзя отменить.` : ""}
      confirmLabel="Удалить отчёт"
      icon={<Trash2 size={21} />}
      busy={deleting}
      onCancel={() => !deleting && setDeleteTarget(null)}
      onConfirm={async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError("");
        try {
          await exchangeApi.deleteResult(deleteTarget.id);
          setResults((items) => items.filter((item) => item.id !== deleteTarget.id));
          setDeleteTarget(null);
        } catch (err) {
          setDeleteError(err?.message || "Не удалось удалить отчёт.");
        } finally {
          setDeleting(false);
        }
      }}
    >
      {deleteError && <div className="confirm-dialog-error" role="alert">{deleteError}</div>}
    </ConfirmDialog>

    {active && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр изображения" onClick={() => setActive(null)}><div className="lightbox-card" onClick={(event) => event.stopPropagation()}><img src={apiUrl(active.file.url)} alt={active.file.name} /><div><strong>{active.file.name}</strong><Button mode="secondary" onClick={() => setActive(null)}>Закрыть</Button></div></div></div>}
  </>;
}
