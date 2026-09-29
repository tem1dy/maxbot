import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, FileBox, Image as ImageIcon, PlaySquare, Share2, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { exchangeApi } from "../../lib/exchangeApi.js";
import { ConfirmDialog } from "../../components/ui/Controls.jsx";
import { downloadMaxFile, openMaxFile, shareMaxContent, notifyMax } from "../../lib/maxBridge.js";

function apiUrl(path) { return path?.startsWith("http") ? path : `${window.location.origin}${path || ""}`; }
function fileIcon(type) { if (type?.startsWith("image/")) return ImageIcon; if (type === "video/mp4") return PlaySquare; return FileBox; }

export function FarmerResultDetail() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    exchangeApi.results().then((items) => {
      const found = items.find((item) => item.id === id);
      if (!found) throw new Error("Результат не найден.");
      setResult(found);
    }).catch((err) => setError(err.message || "Не удалось загрузить результат."));
  }, [id]);

  if (error) return <><section className="page-title-row"><div><span className="eyebrow">РЕЗУЛЬТАТ</span><h1>Результат не найден</h1></div></section><div className="form-error page-alert">{error}</div><Link className="primary-link" to="/farmer/results"><ArrowLeft size={15}/> К результатам</Link></>;
  if (!result) return <div className="loading-state glass-card"><div className="loading-pulse"/><span>Загружаем результат…</span></div>;

  return <>
    <section className="result-detail-hero">
      <Link className="text-action result-detail-back" to="/farmer/results"><ArrowLeft size={16}/> Все результаты</Link>
      <div className="result-detail-hero-main">
        <div className="result-detail-hero-copy">
          <span className="eyebrow">РЕЗУЛЬТАТ ОБЛЁТА</span>
          <h1>{result.field_name}</h1>
          <div className="result-detail-meta">
            <span>{result.task}</span>
            <span className="result-detail-meta-dot">•</span>
            <span>{Number(result.area || 0).toLocaleString("ru-RU", { minimumFractionDigits:2, maximumFractionDigits:2 })} га</span>
            <span className="result-detail-meta-dot">•</span>
            <span>{new Date(result.created_at).toLocaleDateString("ru-RU")}</span>
          </div>
        </div>
        <span className="status-badge status-completed result-detail-status">Готово</span>
      </div>
    </section>

    <section className="glass-card result-report-summary">
      <div className="result-report-summary-icon"><CheckCircle2 size={21}/></div>
      <div className="result-report-summary-copy">
        <span className="eyebrow">ОТЧЁТ О ВЫПОЛНЕНИИ</span>
        <strong>Оператор завершил заказ</strong>
        <p>{result.description || "Материалы облёта доступны ниже. Если файлов пока нет, оператор завершил заказ без прикреплённых материалов."}</p>
      </div>
    </section>

    <section className="section-block result-materials-section">
      <div className="section-heading result-materials-heading">
        <div>
          <span className="eyebrow">МАТЕРИАЛЫ</span>
          <h2>{result.files?.length || 0} файлов</h2>
        </div>
        <span className="counter-badge">Отчёт</span>
      </div>
      <div className="result-files glass-card">
        {result.files?.length ? result.files.map((file) => { const Icon=fileIcon(file.content_type); const url=apiUrl(file.download_url || file.url); return <div className="result-file" key={file.id}>
          <div className="file-type-icon"><Icon size={20}/></div>
          <div><strong>{file.name}</strong><span>{file.size ? `${(Number(file.size)/1024/1024).toFixed(1)} МБ` : "Размер не указан"}</span></div>
          <div className="result-file-actions"><button type="button" className="inline-file-action" onClick={() => downloadMaxFile(url,file.name)}><Download size={15}/> Скачать</button><button type="button" className="inline-file-action" onClick={() => openMaxFile(url)}><ExternalLink size={15}/> Открыть</button></div>
        </div> }) : <div className="result-empty-file"><FileBox size={20}/><div><strong>Материалы не прикреплены</strong><span>Оператор завершил заказ, но файлов в отчёте пока нет.</span></div></div>}
      </div>
    </section>

    <div className="result-detail-actions">
      <button type="button" className="inline-file-action result-detail-primary-action" onClick={async()=>{await shareMaxContent({text:`Отчёт по ${result.field_name}`,link:apiUrl(`/api/orders/${result.order_id}/report.pdf`)});notifyMax("success");}}><Share2 size={15}/> Поделиться отчётом</button>
      <Link className="result-back-order" to={`/farmer/orders/${result.order_id}`}><FileBox size={15}/> К заказу</Link>
      <button type="button" className="inline-file-action result-delete-action" onClick={()=>{setDeleteError("");setDeleteOpen(true);}}><Trash2 size={15}/> Удалить отчёт</button>
    </div>
    <ConfirmDialog open={deleteOpen} title="Удалить отчёт?" description={`Отчёт по ${result.field_name} будет удалён вместе с прикреплёнными материалами. Это действие нельзя отменить.`} confirmLabel="Удалить отчёт" icon={<Trash2 size={21}/>} busy={deleting} onCancel={()=>!deleting&&setDeleteOpen(false)} onConfirm={async()=>{setDeleting(true);setDeleteError("");try{await exchangeApi.deleteResult(result.id);window.location.assign("/farmer/results");}catch(err){setDeleteError(err?.message||"Не удалось удалить отчёт.");}finally{setDeleting(false);}}}>{deleteError&&<div className="confirm-dialog-error" role="alert">{deleteError}</div>}</ConfirmDialog>
  </>;
}
