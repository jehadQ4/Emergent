'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Upload, Pill, Building2, FileSpreadsheet, Database, Calendar, DollarSign, Hash, Package, History, Loader2, ShieldCheck, X, LogOut, UserPlus, User, Trash2, Users as UsersIcon, Warehouse, Plus, Minus, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import InventorySheetTab from '@/components/inventory-sheet-tab'

function formatNumber(n) {
  if (n === null || n === undefined || n === '') return '—'
  const num = typeof n === 'number' ? n : parseFloat(n)
  if (isNaN(num)) return String(n)
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-CA') } catch { return String(d) }
}

// Helper: authenticated fetch using current session token
function useAuthedFetch(session) {
  return useCallback(async (url, opts = {}) => {
    const headers = new Headers(opts.headers || {})
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
    if (!(opts.body instanceof FormData) && opts.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    return fetch(url, { ...opts, headers })
  }, [session?.access_token])
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1 num">{value}</p>
          </div>
          <div className={`size-12 rounded-xl flex items-center justify-center ${accent}`}><Icon className="size-6" /></div>
        </div>
      </CardContent>
    </Card>
  )
}

function MedicineDetailDialog({ record, open, onOpenChange, authedFetch }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !record?.name) return
    setLoading(true)
    authedFetch(`/api/history?name=${encodeURIComponent(record.name)}`)
      .then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(() => setHistory([])).finally(() => setLoading(false))
  }, [open, record?.name, authedFetch])

  if (!record) return null
  const fields = [
    { label: 'ID', value: record.source_id, icon: Hash },
    { label: 'الاسم العلمي', value: record.scientific_name, icon: Pill },
    { label: 'الشركة', value: record.company, icon: Building2 },
    { label: 'المخزن', value: record.warehouse, icon: Database },
    { label: 'رقم الفاتورة', value: record.invoice_number, icon: Hash },
    { label: 'تاريخ الفاتورة', value: formatDate(record.invoice_date), icon: Calendar },
    { label: 'الكمية', value: formatNumber(record.quantity), icon: Package },
    { label: 'سعر الشراء', value: formatNumber(record.unit_price), icon: DollarSign },
    { label: 'السعر الكلي', value: formatNumber(record.total_price), icon: DollarSign },
    { label: 'السعر الأصلي', value: formatNumber(record.original_price), icon: DollarSign },
    { label: 'سعر البيع', value: formatNumber(record.selling_price), icon: DollarSign },
    { label: 'هدية', value: formatNumber(record.gift), icon: Package },
    { label: 'هدية مندوب', value: formatNumber(record.rep_gift), icon: Package },
    { label: 'رقم الدفعة', value: record.batch_number, icon: Hash },
    { label: 'تاريخ الانتهاء', value: record.expiry_raw || formatDate(record.expiry_date), icon: Calendar },
    { label: 'الباركود', value: record.barcode, icon: Hash },
    { label: 'ملاحظات', value: record.notes, icon: FileSpreadsheet },
    { label: 'تاريخ الرفع', value: formatDate(record.created_at), icon: Calendar },
  ]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-4xl max-h-[95dvh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Pill className="size-5" /></div>
            {record.name}
          </DialogTitle>
          <DialogDescription>كل المعلومات المتوفرة + سجل الشراء الكامل</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {fields.map((f, i) => (
              <div key={f.label} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border">
                <f.icon className="size-4 text-primary mt-1 flex-shrink-0" />
                <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{f.label}</p><p className="font-medium truncate">{f.value || '—'}</p></div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-3"><History className="size-5 text-primary" /> سجل الشراء الكامل {history.length > 0 && <Badge variant="secondary" className="num">{history.length}</Badge>}</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground p-4"><Loader2 className="size-4 animate-spin" /> جاري التحميل...</div>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground p-4">لا يوجد سجل آخر.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {history.map((h) => (
                  <div key={h.id} className="rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2 border-b pb-2 mb-2">
                      <p className="font-bold leading-tight">{h.name || record.name || '—'}</p>
                      <Badge variant="outline" className="num shrink-0">ID: {h.source_id || '—'}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <HistoryField label="رقم الفاتورة" value={h.invoice_number} numeric />
                      <HistoryField label="المخزن" value={h.warehouse} />
                      <HistoryField label="تاريخ الفاتورة" value={formatDate(h.invoice_date)} numeric />
                      <HistoryField label="الكمية" value={formatNumber(h.quantity)} numeric />
                      <HistoryField label="سعر الوحدة" value={formatNumber(h.unit_price)} numeric />
                      <HistoryField label="السعر الكلي" value={formatNumber(h.total_price)} numeric />
                      <HistoryField label="الانتهاء" value={h.expiry_raw || formatDate(h.expiry_date)} numeric />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function HistoryField({ label, value, numeric = false }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className={`font-medium ${numeric ? 'num' : ''}`}>{value || '—'}</p></div>
}

function SearchTab({ authedFetch }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [open, setOpen] = useState(false)
  const [currentFile, setCurrentFile] = useState(null)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const debounceRef = useRef(null)

  // Load current upload info
  useEffect(() => {
    authedFetch('/api/uploads').then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length > 0) {
        setUploadedFiles(d)
        const savedId = window.localStorage.getItem('pharmacy-search-upload-id')
        setCurrentFile(d.find(file => file.id === savedId) || d[0])
      }
    }).catch(() => {})
  }, [authedFetch])

  useEffect(() => {
    if (!currentFile?.id) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (!q) {
      setSuggestions([])
      authedFetch(`/api/search?q=&limit=24&upload_id=${encodeURIComponent(currentFile.id)}`).then(r => r.json()).then(d => setResults(Array.isArray(d) ? d : []))
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const rRes = await authedFetch(`/api/search?q=${encodeURIComponent(q)}&limit=100&upload_id=${encodeURIComponent(currentFile.id)}`)
        const rData = await rRes.json()
        const rows = Array.isArray(rData) ? rData : []
        const names = new Map()
        rows.forEach(row => {
          if (!names.has(row.name)) names.set(row.name, { name: row.name, company: row.company, scientific_name: row.scientific_name, hits: 0 })
          names.get(row.name).hits += 1
        })
        setSuggestions(Array.from(names.values()).slice(0, 8))
        setResults(rows)
      } catch (e) { console.error(e) }
    }, 300)
  }, [query, authedFetch, currentFile?.id])

  const sorted = useMemo(() => {
    const arr = [...results]
    arr.sort((a, b) => {
      if (query.trim()) {
        const scoreDifference = (b._search_score || 0) - (a._search_score || 0)
        if (scoreDifference) return scoreDifference
      }
      const ai = parseInt(a.source_id, 10)
      const bi = parseInt(b.source_id, 10)
      const aValid = !isNaN(ai), bValid = !isNaN(bi)
      if (aValid && bValid) return bi - ai
      if (aValid) return -1
      if (bValid) return 1
      // fallback to created_at desc
      return new Date(b.created_at) - new Date(a.created_at)
    })
    return arr.slice(0, 200)
  }, [results, query])

  return (
    <div className="space-y-4">
      {currentFile && (
        <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-4 py-2.5 text-sm flex items-center gap-2 flex-wrap">
          <FileSpreadsheet className="size-4 text-emerald-700" />
          <span className="text-emerald-900">يبحث النظام في الملف:</span>
          <span className="font-semibold text-emerald-900">{currentFile.filename}</span>
          <Badge variant="outline" className="border-emerald-300 num text-emerald-800">{formatNumber(currentFile.rows_count)} سجل</Badge>
          <span className="text-xs text-emerald-700">رُفع في {formatDate(currentFile.created_at)}</span>
          {uploadedFiles.length > 1 && (
            <Select value={currentFile.id} onValueChange={id => {
              const selectedFile = uploadedFiles.find(file => file.id === id)
              if (selectedFile) {
                setCurrentFile(selectedFile)
                setQuery(''); setResults([]); setSuggestions([])
                window.localStorage.setItem('pharmacy-search-upload-id', id)
              }
            }}>
              <SelectTrigger className="w-full sm:w-[240px] h-9 mr-auto bg-white"><SelectValue placeholder="اختر ملف البحث" /></SelectTrigger>
              <SelectContent>{uploadedFiles.map(file => <SelectItem key={file.id} value={file.id}>{file.filename} — {formatNumber(file.rows_count)} سجل</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      )}
      <div className="relative">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setShowSuggest(true) }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
          placeholder="ابحث عن دواء بالعربي أو الإنجليزي، أو الشركة، أو الباركود..."
          className="h-14 pr-12 text-lg shadow-sm border-2 focus-visible:ring-primary"
        />
        {query && (<button onClick={() => setQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="size-5" /></button>)}
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute z-30 mt-2 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button key={s.name} onMouseDown={(e) => { e.preventDefault(); setQuery(s.name); setShowSuggest(false) }}
                className="w-full text-right px-4 py-3 hover:bg-accent border-b last:border-b-0 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-medium truncate">{s.name}</p><p className="text-xs text-muted-foreground truncate">{s.company || s.scientific_name || '—'}</p></div>
                <Badge variant="outline" className="num">{s.hits} سجل</Badge>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>{sorted.length > 0 ? <>عدد النتائج: <span className="num font-bold text-foreground">{sorted.length}</span> سجل ({query.trim() ? 'الأقرب لبحثك أولاً' : 'مرتبة من الأحدث'})</> : 'لا توجد نتائج'}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((r) => (
          <Card key={r.id} className="hover:shadow-md hover:border-primary/40 transition cursor-pointer" onClick={() => { setSelected(r); setOpen(true) }}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-base leading-tight line-clamp-2">{r.name}</h3>
                {r.source_id && <Badge className="shrink-0 num">ID: {r.source_id}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {r.scientific_name && <p className="truncate">{r.scientific_name}</p>}
                {r.company && <p className="flex items-center gap-1"><Building2 className="size-3" /> {r.company}</p>}
                {r.warehouse && <p className="flex items-center gap-1"><Database className="size-3" /> {r.warehouse}</p>}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <div><p className="text-[10px] text-muted-foreground">السعر</p><p className="font-semibold text-sm num">{formatNumber(r.unit_price)}</p></div>
                <div><p className="text-[10px] text-muted-foreground">الكمية</p><p className="font-semibold text-sm num">{formatNumber(r.quantity)}</p></div>
                <div><p className="text-[10px] text-muted-foreground">تاريخ الفاتورة</p><p className="font-semibold text-xs num">{formatDate(r.invoice_date)}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <MedicineDetailDialog record={selected} open={open} onOpenChange={setOpen} authedFetch={authedFetch} />
    </div>
  )
}

function AdminTab({ authedFetch }) {
  const [file, setFile] = useState(null)
  const [warehouse, setWarehouse] = useState('')
  const [uploading, setUploading] = useState(false)
  const [stats, setStats] = useState(null)
  const [uploads, setUploads] = useState([])
  const [lastResult, setLastResult] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([
        authedFetch('/api/stats').then(r => r.json()),
        authedFetch('/api/uploads').then(r => r.json()),
      ])
      setStats(s); setUploads(Array.isArray(u) ? u : [])
    } catch (e) { console.error(e) }
  }, [authedFetch])
  useEffect(() => { refresh() }, [refresh])

  async function handleUpload() {
    if (!file) { toast.error('اختر ملفاً أولاً'); return }
    setUploading(true); setLastResult(null)
    try {
      const fd = new FormData(); fd.append('file', file); if (warehouse) fd.append('warehouse', warehouse)
      const res = await authedFetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'فشل الرفع'); setLastResult(data) }
      else { toast.success(`تم استيراد ${data.rows_inserted} سجل بنجاح — الملف الجديد أصبح هو ملف البحث الحالي`); setLastResult(data); setFile(null); refresh() }
    } catch (e) { toast.error(e?.message || 'فشل الاتصال') } finally { setUploading(false) }
  }
  async function handleDeleteUpload(id, filename) {
    if (!confirm(`حذف الملف "${filename}" وكل سجلاته نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) return
    setDeletingId(id)
    try {
      const res = await authedFetch(`/api/uploads/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) toast.error(data?.error || 'فشل الحذف')
      else { toast.success('تم حذف الملف بنجاح'); refresh() }
    } finally { setDeletingId(null) }
  }

  const currentUpload = uploads[0] // newest first

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Database} label="إجمالي السجلات" value={formatNumber(stats?.total_records || 0)} accent="bg-primary/10 text-primary" />
        <StatCard icon={Pill} label="عدد الأدوية" value={formatNumber(stats?.unique_medicines || 0)} accent="bg-cyan-500/10 text-cyan-700" />
        <StatCard icon={FileSpreadsheet} label="الملفات المرفوعة" value={formatNumber(stats?.total_uploads || 0)} accent="bg-amber-500/10 text-amber-700" />
        <StatCard icon={Building2} label="الشركات" value={formatNumber(stats?.companies_count || 0)} accent="bg-indigo-500/10 text-indigo-700" />
        <StatCard icon={Package} label="المخازن" value={formatNumber(stats?.warehouses_count || 0)} accent="bg-emerald-500/10 text-emerald-700" />
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="size-5 text-primary" /> رفع ملف Excel جديد</CardTitle><CardDescription>كل صف يُحفظ كسجل تاريخي جديد ولا يُستبدل أي سجل سابق.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="md:col-span-2 cursor-pointer">
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary hover:bg-primary/5 transition">
                <FileSpreadsheet className="size-10 text-primary mx-auto mb-2" />
                <p className="font-medium">{file?.name || 'اختر ملف .xlsx أو .xls أو .csv'}</p>
                <p className="text-xs text-muted-foreground mt-1">سيتم التعرف على الأعمدة تلقائياً (عربي / إنجليزي)</p>
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="space-y-3">
              <Input placeholder="اسم المخزن (اختياري)" value={warehouse} onChange={e => setWarehouse(e.target.value)} />
              <Button onClick={handleUpload} disabled={uploading || !file} className="w-full h-11">
                {uploading ? <><Loader2 className="size-4 animate-spin ml-2" /> جاري الرفع...</> : <><Upload className="size-4 ml-2" /> ارفع وأضف للقاعدة</>}
              </Button>
            </div>
          </div>
          {lastResult?.ok && (<div className="rounded-lg border bg-emerald-50 border-emerald-200 p-3 text-sm">تم استيراد <span className="num font-bold">{lastResult.rows_inserted}</span> سجل من "{lastResult.filename}".</div>)}
          {lastResult && !lastResult.ok && (<div className="rounded-lg border bg-red-50 border-red-200 p-3 text-sm text-red-700">{lastResult.error}</div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary" /> الملفات المرفوعة</CardTitle>
          <CardDescription>الملف الأحدث (في الأعلى) هو الذي يبحث فيه النظام حالياً. الملفات القديمة محفوظة لسجل الشراء التاريخي ويمكنك حذفها يدوياً.</CardDescription>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (<p className="text-muted-foreground text-sm">لم يُرفع أي ملف بعد.</p>) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground"><tr><th className="p-2 text-right">الحالة</th><th className="p-2 text-right">الملف</th><th className="p-2 text-right">المخزن</th><th className="p-2 text-right">عدد السجلات</th><th className="p-2 text-right">رفع بواسطة</th><th className="p-2 text-right">تاريخ الرفع</th><th className="p-2"></th></tr></thead>
                <tbody>{uploads.map(u => (
                  <tr key={u.id} className={`border-t hover:bg-muted/30 ${u.id === currentUpload?.id ? 'bg-emerald-50' : ''}`}>
                    <td className="p-2">{u.id === currentUpload?.id ? <Badge className="bg-emerald-600">ملف البحث الحالي</Badge> : <Badge variant="outline">قديم</Badge>}</td>
                    <td className="p-2 font-medium truncate max-w-xs">{u.filename}</td>
                    <td className="p-2">{u.warehouse_hint || '—'}</td>
                    <td className="p-2 num">{formatNumber(u.rows_count)}</td>
                    <td className="p-2 text-xs">{u.uploaded_by_email || '—'}</td>
                    <td className="p-2 num">{formatDate(u.created_at)}</td>
                    <td className="p-2 text-left">
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteUpload(u.id, u.filename)} disabled={deletingId === u.id}>
                        {deletingId === u.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}
                      </Button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InventoryTab({ authedFetch }) {
  const emptyForm = { name: '', category: '', quantity: '', min_stock: '10', expiry_date: '', price: '' }
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ total: 0, low_stock: 0, expiring: 0, expired: 0 })
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [stockItem, setStockItem] = useState(null)
  const [stockAction, setStockAction] = useState('increase')
  const [stockQty, setStockQty] = useState('')
  const debounceRef = useRef(null)

  const refresh = useCallback(async (q = query) => {
    setLoading(true)
    try {
      const r = await authedFetch(`/api/inventory?q=${encodeURIComponent(q.trim())}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'فشل تحميل المخزن')
      setItems(Array.isArray(d.items) ? d.items : [])
      setSummary(d.summary || { total: 0, low_stock: 0, expiring: 0, expired: 0 })
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [authedFetch, query])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => refresh(query), 220)
    return () => clearTimeout(debounceRef.current)
  }, [query, refresh])

  async function addItem() {
    if (!form.name.trim()) { toast.error('اسم الدواء مطلوب'); return }
    setSaving(true)
    try {
      const r = await authedFetch('/api/inventory', { method: 'POST', body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'فشلت الإضافة')
      toast.success('تمت إضافة الدواء إلى المخزن')
      setOpen(false); setForm(emptyForm); refresh('')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  function openStock(item, action) {
    setStockItem(item); setStockAction(action); setStockQty('')
  }

  async function changeStock() {
    const qty = Number(stockQty)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('أدخل كمية صحيحة'); return }
    setSaving(true)
    try {
      const r = await authedFetch(`/api/inventory/${stockItem.row_number}`, { method: 'PATCH', body: JSON.stringify({ action: stockAction, qty, current_quantity: stockItem.quantity, row_number: stockItem.row_number, medicine_code: stockItem.medicine_code }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'فشل تحديث الكمية')
      toast.success(stockAction === 'increase' ? 'تمت زيادة الكمية' : 'تم صرف الكمية')
      setStockItem(null); refresh()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  async function removeItem(item) {
    if (!confirm(`حذف "${item.name}" من المخزن؟`)) return
    const r = await authedFetch(`/api/inventory/${item.row_number}`, { method: 'DELETE', body: JSON.stringify({ row_number: item.row_number, medicine_code: item.medicine_code }) })
    const d = await r.json()
    if (!r.ok) toast.error(d?.error || 'فشل الحذف')
    else { toast.success('تم حذف الدواء'); refresh() }
  }

  const expiryStatus = (item) => {
    if (!item.expiry_date) return null
    const days = Math.ceil((new Date(item.expiry_date) - new Date()) / 86400000)
    if (days < 0) return { text: 'منتهي الصلاحية', cls: 'bg-red-100 text-red-800 border-red-200' }
    if (days <= 90) return { text: `ينتهي خلال ${days} يوم`, cls: 'bg-amber-100 text-amber-800 border-amber-200' }
    return null
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Package} label="مواد المخزن" value={formatNumber(summary.total)} accent="bg-primary/10 text-primary" />
        <StatCard icon={AlertTriangle} label="بلغ الحد الأدنى" value={formatNumber(summary.low_stock)} accent="bg-orange-500/10 text-orange-700" />
        <StatCard icon={Calendar} label="تنتهي خلال 90 يومًا" value={formatNumber(summary.expiring)} accent="bg-amber-500/10 text-amber-700" />
        <StatCard icon={X} label="منتهية الصلاحية" value={formatNumber(summary.expired)} accent="bg-red-500/10 text-red-700" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم الدواء، التصنيف أو الرمز..." className="pr-10 h-11" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refresh()} className="gap-2"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> تحديث</Button>
          <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="size-4" /> إضافة دواء</Button>
        </div>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-10 text-center text-muted-foreground"><Loader2 className="size-6 animate-spin inline-block ml-2" /> جاري التحميل...</div> : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-3 text-right">الدواء</th><th className="p-3 text-right">التصنيف</th><th className="p-3 text-right">الكمية</th><th className="p-3 text-right">الحد الأدنى</th><th className="p-3 text-right">الصلاحية</th><th className="p-3 text-right">السعر</th><th className="p-3 text-left">الإجراءات</th></tr></thead>
            <tbody>{items.map(item => {
              const low = Number(item.quantity || 0) <= Number(item.min_stock ?? 10)
              const expiry = expiryStatus(item)
              return <tr key={item.id} className={`border-t hover:bg-muted/30 ${low ? 'bg-orange-50/50' : ''}`}>
                <td className="p-3"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">رمز: {item.medicine_code || '—'}</p></td>
                <td className="p-3">{item.category || '—'}</td>
                <td className="p-3"><Badge variant={low ? 'destructive' : 'secondary'} className="num text-sm">{formatNumber(item.quantity || 0)}</Badge></td>
                <td className="p-3 num">{formatNumber(item.min_stock ?? 10)}</td>
                <td className="p-3">{expiry ? <Badge variant="outline" className={expiry.cls}>{expiry.text}</Badge> : <span className="num">{formatDate(item.expiry_date)}</span>}</td>
                <td className="p-3 num">{formatNumber(item.price)}</td>
                <td className="p-3"><div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => openStock(item, 'increase')} className="text-emerald-700 gap-1"><Plus className="size-3.5" /> زيادة</Button>
                  <Button size="sm" variant="outline" onClick={() => openStock(item, 'dispense')} className="text-amber-700 gap-1"><Minus className="size-3.5" /> صرف</Button>
                  <Button size="sm" variant="ghost" onClick={() => removeItem(item)}><Trash2 className="size-4 text-destructive" /></Button>
                </div></td>
              </tr>
            })}{items.length === 0 && <tr><td colSpan="7" className="p-10 text-center text-muted-foreground">لا توجد نتائج.</td></tr>}</tbody>
          </table>
        )}
      </CardContent></Card>

      <div className="rounded-lg border bg-slate-50 p-3 text-xs text-muted-foreground flex items-center gap-2"><ExternalLink className="size-4" /> هذه البيانات مأخوذة حصراً من Google Sheet عن طريق n8n ولا تستخدم جدول أدوية Supabase.</div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>إضافة دواء إلى المخزن</DialogTitle><DialogDescription>سيُرسل الدواء إلى Google Sheet عن طريق n8n.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input placeholder="اسم الدواء *" value={form.name} onChange={e => setForm({...form, name:e.target.value})} />
          <Input placeholder="التصنيف" value={form.category} onChange={e => setForm({...form, category:e.target.value})} />
          <Input type="number" min="0" placeholder="الكمية" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})} />
          <Input type="number" min="0" placeholder="الحد الأدنى" value={form.min_stock} onChange={e => setForm({...form, min_stock:e.target.value})} />
          <Input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date:e.target.value})} />
          <Input type="number" min="0" placeholder="السعر" value={form.price} onChange={e => setForm({...form, price:e.target.value})} />
        </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={addItem} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : 'إضافة'}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={!!stockItem} onOpenChange={v => !v && setStockItem(null)}><DialogContent><DialogHeader><DialogTitle>{stockAction === 'increase' ? 'زيادة الكمية' : 'صرف من المخزن'}</DialogTitle><DialogDescription>{stockItem?.name} — الكمية الحالية: {formatNumber(stockItem?.quantity || 0)}</DialogDescription></DialogHeader>
        <Input type="number" min="0.01" step="any" autoFocus placeholder="أدخل الكمية" value={stockQty} onChange={e => setStockQty(e.target.value)} />
        <DialogFooter><Button variant="outline" onClick={() => setStockItem(null)}>إلغاء</Button><Button onClick={changeStock} disabled={saving} className={stockAction === 'dispense' ? 'bg-amber-600 hover:bg-amber-700' : ''}>{saving ? <Loader2 className="size-4 animate-spin" /> : 'تأكيد'}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  )
}

function UsersTab({ authedFetch, currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'staff' })
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await authedFetch('/api/users'); const d = await r.json()
      setUsers(Array.isArray(d) ? d : [])
    } finally { setLoading(false) }
  }, [authedFetch])
  useEffect(() => { refresh() }, [refresh])

  async function create() {
    if (!form.email || !form.password) { toast.error('البريد وكلمة المرور مطلوبان'); return }
    setCreating(true)
    try {
      const r = await authedFetch('/api/users', { method: 'POST', body: JSON.stringify(form) })
      const d = await r.json()
      if (!r.ok) toast.error(d?.error || 'فشل الإنشاء')
      else { toast.success('تم إنشاء المستخدم'); setOpen(false); setForm({ email: '', password: '', full_name: '', role: 'staff' }); refresh() }
    } finally { setCreating(false) }
  }

  async function remove(id, isPending = false) {
    if (!confirm(isPending ? 'رفض هذا الطلب وحذف المستخدم؟' : 'حذف هذا المستخدم؟')) return
    const r = await authedFetch(`/api/users/${id}`, { method: 'DELETE' }); const d = await r.json()
    if (!r.ok) toast.error(d?.error); else { toast.success(isPending ? 'تم رفض الطلب' : 'تم الحذف'); refresh() }
  }
  async function changeRole(id, role) {
    const r = await authedFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    const d = await r.json(); if (!r.ok) toast.error(d?.error); else { toast.success('تم التحديث'); refresh() }
  }
  async function approve(id, role = 'staff') {
    const r = await authedFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    const d = await r.json(); if (!r.ok) toast.error(d?.error); else { toast.success(`تمت الموافقة كـ ${role === 'admin' ? 'رئيس' : 'موظف'}`); refresh() }
  }

  const pending = users.filter(u => u.role === 'pending')
  const active = users.filter(u => u.role !== 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-xl font-bold flex items-center gap-2"><UsersIcon className="size-5 text-primary" /> إدارة المستخدمين</h2><p className="text-sm text-muted-foreground">يمكن للموظفين تسجيل أنفسهم — وأنت توافق أو ترفض من هنا.</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2" variant="outline"><UserPlus className="size-4" /> إضافة مستخدم مباشرة</Button>
      </div>

      {/* Pending users section */}
      {pending.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <ShieldCheck className="size-5" /> طلبات بانتظار الموافقة
              <Badge className="bg-amber-500 hover:bg-amber-600 num">{pending.length}</Badge>
            </CardTitle>
            <CardDescription>هؤلاء سجلوا أنفسهم وينتظرون موافقتك للوصول إلى النظام.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-amber-100/50 text-amber-900"><tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">البريد</th><th className="p-3 text-right">تاريخ الطلب</th><th className="p-3 text-left">الإجراء</th></tr></thead>
              <tbody>{pending.map(u => (
                <tr key={u.id} className="border-t border-amber-200">
                  <td className="p-3 font-medium">{u.full_name || '—'}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3 num text-muted-foreground">{formatDate(u.created_at)}</td>
                  <td className="p-3 text-left">
                    <div className="flex gap-2 justify-end flex-wrap">
                      <Button size="sm" onClick={() => approve(u.id, 'staff')} className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                        <ShieldCheck className="size-4" /> موافقة (موظف)
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => approve(u.id, 'admin')} className="gap-1">
                        <ShieldCheck className="size-4" /> موافقة (رئيس)
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(u.id, true)} className="text-destructive hover:text-destructive">
                        <X className="size-4" /> رفض
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Active users */}
      <Card><CardContent className="p-0 overflow-hidden">
        {loading ? <div className="p-6 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline-block ml-2" /> جاري التحميل...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-3 text-right">الاسم</th><th className="p-3 text-right">البريد</th><th className="p-3 text-right">الدور</th><th className="p-3 text-right">تاريخ الإنشاء</th><th className="p-3"></th></tr></thead>
            <tbody>{active.map(u => (
              <tr key={u.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{u.full_name || '—'} {u.id === currentUser?.id && <Badge variant="secondary" className="mr-2">أنت</Badge>}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <Select value={u.role} onValueChange={(v) => changeRole(u.id, v)} disabled={u.id === currentUser?.id}>
                    <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="admin">رئيس</SelectItem><SelectItem value="staff">موظف</SelectItem></SelectContent>
                  </Select>
                </td>
                <td className="p-3 num text-muted-foreground">{formatDate(u.created_at)}</td>
                <td className="p-3 text-left">{u.id !== currentUser?.id && (<Button size="sm" variant="ghost" onClick={() => remove(u.id)}><Trash2 className="size-4 text-destructive" /></Button>)}</td>
              </tr>
            ))}{active.length === 0 && (<tr><td colSpan="5" className="p-6 text-center text-muted-foreground">لا يوجد مستخدمون مفعّلون.</td></tr>)}</tbody>
          </table>
        )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="size-5 text-primary" /> إضافة مستخدم مفعّل مباشرة</DialogTitle><DialogDescription>سيتم إنشاء الحساب وتفعيله فوراً (تجاوز خطوة الموافقة).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="الاسم الكامل" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            <Input placeholder="البريد الإلكتروني" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="كلمة المرور (8 أحرف أو أكثر)" type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="staff">موظف (بحث فقط)</SelectItem><SelectItem value="admin">رئيس (بحث + رفع + إدارة)</SelectItem></SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button onClick={create} disabled={creating}>{creating ? <Loader2 className="size-4 animate-spin" /> : 'إنشاء'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
const submit = async (e) => {
  e.preventDefault();

  setLoading(true);

  try {
    const sb = getBrowserSupabase();

    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("تم تسجيل الدخول");
    } else {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data?.error || 'تعذر إنشاء الحساب');
        return;
      }
      toast.success("تم إنشاء الحساب وهو بانتظار موافقة الرئيس");
      setMode('login');
    }
  } finally {
    setLoading(false);
  }
};
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-white to-cyan-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-4">
          <img src="/logo.png" alt="شعار صيدلية الغسق" className="h-32 w-auto object-contain mx-auto drop-shadow-sm" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 bg-muted p-1 rounded-lg">
            <button type="button" onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md text-sm font-medium transition ${mode === 'login' ? 'bg-white shadow text-foreground' : 'text-muted-foreground'}`}>تسجيل دخول</button>
            <button type="button" onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-md text-sm font-medium transition ${mode === 'signup' ? 'bg-white shadow text-foreground' : 'text-muted-foreground'}`}>إنشاء حساب</button>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1"><label className="text-sm font-medium">الاسم الكامل</label><Input value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11" placeholder="اسمك الكامل" /></div>
            )}
            <div className="space-y-1"><label className="text-sm font-medium">البريد الإلكتروني</label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" placeholder="name@pharmacy.com" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">كلمة المرور</label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="h-11" placeholder="••••••••" /></div>
            <Button type="submit" className="w-full h-11 mt-2" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : (mode === 'login' ? 'دخول' : 'إنشاء حساب جديد')}
            </Button>
          </form>
          {mode === 'signup' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3 text-center">
              ⏳ سيتم تفعيل حسابك بعد موافقة الرئيس من داخل النظام.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
function PendingScreen({ profile, onLogout }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center space-y-3">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg mx-auto"><ShieldCheck className="size-8" /></div>
          <CardTitle className="text-2xl">حسابك بانتظار الموافقة</CardTitle>
          <CardDescription>مرحباً <span className="font-semibold text-foreground">{profile?.full_name || profile?.email}</span> — تم استلام طلبك وسيتم تفعيل حسابك من قِبل الرئيس قريباً.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 text-center">
            بمجرد الموافقة، ستتمكن من تسجيل الدخول والبحث في الأدوية.
          </div>
          <Button variant="outline" className="w-full" onClick={onLogout}><LogOut className="size-4 ml-2" /> خروج</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [tab, setTab] = useState('search')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const sb = getBrowserSupabase()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setBootLoading(false) })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) setProfile(null) })
    return () => sub.subscription.unsubscribe()
  }, [])

  const authedFetch = useAuthedFetch(session)

  useEffect(() => {
    if (!session) { setProfile(null); return }
    authedFetch('/api/me').then(r => r.json()).then(p => { if (p?.id) setProfile(p) }).catch(() => {})
  }, [session, authedFetch])

  useEffect(() => {
    if (profile?.role !== 'admin') { setPendingCount(0); return }
    const load = () => authedFetch('/api/users').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setPendingCount(d.filter(u => u.role === 'pending').length)
    }).catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [profile, authedFetch, tab])

  async function logout() {
    await getBrowserSupabase().auth.signOut()
    setSession(null); setProfile(null); setTab('search')
  }

  if (bootLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
  if (!session) return <LoginScreen onLoggedIn={setSession} />
  if (!profile) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>

  if (profile.role === 'pending') return <PendingScreen profile={profile} onLogout={logout} />

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/logo.png" alt="شعار صيدلية الغسق" className="h-16 w-auto object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-sm bg-muted px-3 py-1.5 rounded-full">
              <User className="size-4 text-primary" />
              <span className="font-medium">{profile?.full_name || profile?.email || '...'}</span>
              <Badge variant={isAdmin ? 'default' : 'secondary'} className="text-[10px]">{isAdmin ? 'رئيس' : 'موظف'}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={logout} className="gap-2"><LogOut className="size-4" /> خروج</Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className={`grid h-auto w-full ${isAdmin ? 'grid-cols-2 sm:grid-cols-4 max-w-4xl' : 'grid-cols-1 max-w-xs'} gap-1`}>
            <TabsTrigger value="search" className="gap-1.5 py-2.5 text-xs sm:text-sm"><Search className="size-4" /> بحث</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin" className="gap-1.5 py-2.5 text-xs sm:text-sm"><ShieldCheck className="size-4" /> رفع وإدارة</TabsTrigger>}
            {isAdmin && <TabsTrigger value="users" className="gap-1.5 py-2.5 text-xs sm:text-sm"><UsersIcon className="size-4" /> المستخدمون {pendingCount > 0 && <Badge className="bg-amber-500 hover:bg-amber-600 num text-[10px] px-1.5">{pendingCount}</Badge>}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="inventory" className="gap-1.5 py-2.5 text-xs sm:text-sm"><Warehouse className="size-4" /> إدارة المخزن</TabsTrigger>}
          </TabsList>
          <TabsContent value="search"><SearchTab authedFetch={authedFetch} /></TabsContent>
          {isAdmin && <TabsContent value="admin"><AdminTab authedFetch={authedFetch} /></TabsContent>}
          {isAdmin && <TabsContent value="users"><UsersTab authedFetch={authedFetch} currentUser={profile} /></TabsContent>}
          {isAdmin && <TabsContent value="inventory"><InventorySheetTab authedFetch={authedFetch} /></TabsContent>}
        </Tabs>
      </main>
      <footer className="border-t mt-12 py-4 text-center text-xs text-muted-foreground">نظام بحث الأدوية — Supabase + Next.js</footer>
    </div>
  )
}
export default App
