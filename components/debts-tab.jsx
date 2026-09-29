'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Loader2, RefreshCw, Upload, WalletCards } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SUPPLIERS = [
[1,'سبا'],[2,'نهلة'],[3,'المدائن'],[4,'بيروت'],[5,'الجبل'],[6,'التساهل'],[7,'نسيم الحدباء'],[8,'الرعاية'],[9,'حياة الموصل'],[10,'سبأ (مواد عامة)'],[11,'المصارف المركزي'],[12,'صدى الكوثر'],[13,'التيسير'],[14,'الجزيرة'],[15,'نهلة عامة'],[16,'الفخامة'],[17,'الكوثر'],[18,'بلاد الخير'],[19,'مكتب سما العلمي'],[20,'العلاج الامثل'],[21,'دار الصيدلة'],[22,'نركال جملة'],[23,'ارض الخير'],[24,'نهلة (مواد عامة)'],[25,'بحر المرجان'],[26,'الشافي'],[27,'فورمانا'],[28,'النور'],[29,'الموصل الحدباء'],[30,'قمة الجبل'],[31,'العاصمة'],[32,'غلوبال'],[33,'الرحمة مفرد و وكالات'],[34,'الرازي الحديث'],[35,'الصيادلة'],[36,'الزهراء'],[37,'الكنز العلمي'],[38,'تييسير الجملة والمواد العامة'],[39,'نهلة جملة'],[40,'الشفاء الموصل'],[41,'نركال مفرد'],[42,'كوثر عامة'],[43,'الورد'],[44,'فيتا ماكس'],[45,'بايوتيج'],[46,'المصارف المركزي جملة'],[47,'الشافي جملة'],[48,'بلاد الخير جملة وعامة'],[49,'فارومنا'],[50,'دستور الدواء'],[51,'سما سبأ'],[52,'بلقيس'],[53,'نركال وكالات']
]
const supplierName = id => SUPPLIERS.find(x => String(x[0]) === String(id))?.[1] || ''

function money(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'
}
function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.rows || []
}
function reviewRow(r) {
  return {
    invoice_number: String(r.invoice_number ?? r['رقم القائمة'] ?? '').trim(),
    supplier_text_read: r.supplier_text_read ?? r['المذخر المقروء'] ?? '',
    supplier_id: r.supplier_id ?? r['ID المذخر'] ?? '',
    supplier_name: r.supplier_name ?? r['اسم المذخر'] ?? '',
    date: r.date ?? r['التاريخ'] ?? '',
    amount: r.amount ?? r['المبلغ'] ?? '',
    type: r.type ?? r['النوع'] ?? 'sale',
    confidence: r.confidence ?? r['نسبة الثقة'] ?? 0,
    problems: r.problems ?? r['سبب المراجعة'] ?? '',
    status: r.status ?? r['الحالة'] ?? '',
    row_number: r.row_number ?? r.rowNumber ?? r._row ?? null,
  }
}
function invoiceRow(r) {
  return {
    invoice_number: String(r.invoice_number ?? r['القائمة_ID'] ?? '').trim(),
    supplier_id: r.supplier_id ?? r['ID_المذخر'] ?? '',
    supplier_name: r.supplier_name ?? r.col_3 ?? supplierName(r.supplier_id ?? r['ID_المذخر']),
    date: r.date ?? r['التاريخ'] ?? '',
    amount: r.amount ?? r['مجموع القائمة'] ?? '',
  }
}

export default function DebtsTab({ authedFetch }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [reviews, setReviews] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState({})
  const [savingKey, setSavingKey] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [reviewRes, invoiceRes] = await Promise.all([
        authedFetch('/api/debts/review'),
        authedFetch('/api/debts/invoices'),
      ])
      const reviewData = await reviewRes.json().catch(() => [])
      const invoiceData = await invoiceRes.json().catch(() => [])
      if (!reviewRes.ok) throw new Error(reviewData?.error || 'تعذر تحميل قوائم المراجعة')
      if (!invoiceRes.ok) throw new Error(invoiceData?.error || 'تعذر تحميل الديون')
      setReviews(normalizeRows(reviewData).map(reviewRow).filter(r => r.invoice_number && r.status !== 'تمت المراجعة'))
      setInvoices(normalizeRows(invoiceData).map(invoiceRow).filter(r => r.invoice_number))
    } catch (e) {
      toast.error(e.message)
    } finally { setLoading(false) }
  }, [authedFetch])

  useEffect(() => { load() }, [load])

  const total = useMemo(() => invoices.reduce((s, x) => s + (Number(x.amount) || 0), 0), [invoices])
  const suppliersCount = useMemo(() => new Set(invoices.map(x => String(x.supplier_id)).filter(Boolean)).size, [invoices])

  async function uploadPdf() {
    if (!file) return toast.error('اختر ملف PDF أولاً')
    if (!file.name.toLowerCase().endsWith('.pdf')) return toast.error('ارفع ملف PDF فقط')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('data', file)
      const res = await authedFetch('/api/debts/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'فشل رفع الملف')
      toast.success('تم إرسال الملف للمعالجة')
      setFile(null)
      setTimeout(load, 2500)
    } catch (e) { toast.error(e.message) }
    finally { setUploading(false) }
  }

  function draftFor(r) {
    return editing[r.invoice_number] || { ...r, supplier_id: String(r.supplier_id || ''), supplier_name: r.supplier_name || supplierName(r.supplier_id) }
  }
  function patchDraft(r, patch) {
    const d = draftFor(r)
    const next = { ...d, ...patch }
    if (patch.supplier_id !== undefined) next.supplier_name = supplierName(patch.supplier_id)
    setEditing(v => ({ ...v, [r.invoice_number]: next }))
  }

  async function approve(r) {
    const d = draftFor(r)
    if (!d.invoice_number || !d.supplier_id || !d.date || !Number.isFinite(Number(d.amount)) || Number(d.amount) <= 0) {
      return toast.error('أكمل رقم القائمة والمذخر والتاريخ والمبلغ')
    }
    setSavingKey(r.invoice_number)
    try {
      const res = await authedFetch('/api/debts/review/approve', {
        method: 'POST',
        body: JSON.stringify({
          ...d,
          supplier_id: Number(d.supplier_id),
          supplier_name: supplierName(d.supplier_id),
          amount: Number(d.amount),
          type: d.type === 'return' ? 'return' : 'sale',
          row_number: r.row_number,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'تعذر اعتماد القائمة')
      toast.success(data?.duplicate ? 'القائمة موجودة مسبقاً ولم تتكرر' : 'تم اعتماد القائمة وإضافتها للديون')
      setEditing(v => { const n = { ...v }; delete n[r.invoice_number]; return n })
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setSavingKey(null) }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><WalletCards className="size-6 text-primary" /> ديون الصيدلية</h2>
        <p className="text-sm text-muted-foreground mt-1">رفع القوائم، مراجعة الحالات غير الواضحة، ومتابعة الديون من مكان واحد.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">إجمالي الديون</p><p className="text-xl font-bold num mt-1">{money(total)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">عدد القوائم</p><p className="text-xl font-bold num mt-1">{invoices.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">المذاخر</p><p className="text-xl font-bold num mt-1">{suppliersCount}</p></CardContent></Card>
        <Card className={reviews.length ? 'border-amber-300 bg-amber-50/40' : ''}><CardContent className="p-4"><p className="text-xs text-muted-foreground">تحتاج مراجعة</p><p className="text-xl font-bold num mt-1">{reviews.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="size-5" /> رفع ملف القوائم</CardTitle><CardDescription>ارفع ملف PDF المعدّل بالاتجاه الصحيح، وسيتم تحليله وإضافة القوائم الصحيحة تلقائياً.</CardDescription></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="flex-1" />
          <Button onClick={uploadPdf} disabled={!file || uploading} className="gap-2">{uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {uploading ? 'جاري المعالجة...' : 'رفع ومعالجة'}</Button>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={'size-4 ml-2 ' + (loading ? 'animate-spin' : '')} /> تحديث</Button>
        </CardContent>
      </Card>

      <Card className={reviews.length ? 'border-amber-300' : ''}>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-amber-600" /> قوائم تحتاج مراجعة <Badge variant="secondary">{reviews.length}</Badge></CardTitle><CardDescription>صحح الحقول غير الواضحة ثم اضغط «تمت المراجعة». لن تُضاف القائمة مرتين إذا كانت موجودة مسبقاً.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-8 text-center"><Loader2 className="size-5 animate-spin inline-block" /></div> : reviews.length === 0 ? <div className="p-8 text-center text-muted-foreground"><CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-600" /> لا توجد قوائم تحتاج مراجعة</div> :
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-amber-50"><tr><th className="p-3 text-right">رقم القائمة</th><th className="p-3 text-right">المذخر المقروء</th><th className="p-3 text-right">المذخر الصحيح</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">النوع</th><th className="p-3 text-right">سبب المراجعة</th><th className="p-3">الإجراء</th></tr></thead>
            <tbody>{reviews.map(r => { const d = draftFor(r); return (
              <tr key={r.invoice_number} className="border-t align-top">
                <td className="p-2"><Input value={d.invoice_number} onChange={e => patchDraft(r,{invoice_number:e.target.value})} className="w-32 num" /></td>
                <td className="p-3 max-w-48">{r.supplier_text_read || '—'}</td>
                <td className="p-2"><Select value={String(d.supplier_id || '')} onValueChange={v => patchDraft(r,{supplier_id:v})}><SelectTrigger className="w-52"><SelectValue placeholder="اختر المذخر" /></SelectTrigger><SelectContent>{SUPPLIERS.map(([id,name]) => <SelectItem key={id} value={String(id)}>{id} — {name}</SelectItem>)}</SelectContent></Select></td>
                <td className="p-2"><Input type="date" value={d.date || ''} onChange={e => patchDraft(r,{date:e.target.value})} className="w-40" /></td>
                <td className="p-2"><Input type="number" value={d.amount ?? ''} onChange={e => patchDraft(r,{amount:e.target.value})} className="w-36 num" /></td>
                <td className="p-2"><Select value={d.type || 'sale'} onValueChange={v => patchDraft(r,{type:v})}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sale">شراء</SelectItem><SelectItem value="return">مرتجع</SelectItem></SelectContent></Select></td>
                <td className="p-3 text-amber-800 max-w-52">{Array.isArray(r.problems) ? r.problems.join('، ') : (r.problems || 'ثقة منخفضة')}</td>
                <td className="p-2"><Button size="sm" onClick={() => approve(r)} disabled={savingKey === r.invoice_number}>{savingKey === r.invoice_number ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4 ml-1" />} تمت المراجعة</Button></td>
              </tr>
            )})}</tbody>
          </table>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="size-5" /> القوائم المسجلة</CardTitle><CardDescription>آخر البيانات الموجودة في شيت القوائم.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted"><tr><th className="p-3 text-right">رقم القائمة</th><th className="p-3 text-right">المذخر</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المبلغ</th></tr></thead>
            <tbody>{invoices.slice().reverse().slice(0,100).map((r,i) => <tr key={r.invoice_number + i} className="border-t"><td className="p-3 num font-medium">{r.invoice_number}</td><td className="p-3">{r.supplier_name || supplierName(r.supplier_id) || r.supplier_id}</td><td className="p-3 num">{r.date || '—'}</td><td className="p-3 num font-semibold">{money(r.amount)}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
