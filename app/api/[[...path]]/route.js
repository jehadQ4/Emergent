import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase'
import { parseSheetBuffer } from '@/lib/parseSheet'

// 🚀 هذه الأسطر الثلاثة هي الحل لمنع التخزين المؤقت وإجبار النظام على التحديث
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export const runtime = 'nodejs'
export const maxDuration = 60

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  // 🚀 إجبار المتصفح أيضاً على عدم تخزين النتيجة القديمة
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  
  return res
}

export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }

// Verify the user's access token and return their profile (with role)
async function getUserProfile(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) return null
  const admin = supabaseAdmin()
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle()
  // Never grant access implicitly. Accounts without a profile must wait for admin approval.
  if (!profile) return { id: user.id, email: user.email, role: 'pending', full_name: user.user_metadata?.full_name || null }
  return profile
}

const INVENTORY_WEBHOOKS = {
  get: process.env.N8N_GET_MEDICINES_URL || 'https://n8n.jehadq4.io/webhook/get-medicines',
  update: process.env.N8N_UPDATE_STOCK_URL || 'https://n8n.jehadq4.io/webhook/update-stock',
  add: process.env.N8N_ADD_MEDICINE_URL || 'https://n8n.jehadq4.io/webhook/add-medicine',
  delete: process.env.N8N_DELETE_MEDICINE_URL || 'https://n8n.jehadq4.io/webhook/delete-medicine',
}

async function callInventoryWebhook(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000), ...options })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { message: text } }
  if (!response.ok) throw new Error(data?.message || data?.error || `n8n error: ${response.status}`)
  return data
}

function normalizeInventoryItem(row) {
  return {
    id: String(row.row_number ?? row['رمز الدواء'] ?? ''),
    row_number: row.row_number,
    medicine_code: row['رمز الدواء'],
    name: row['اسم الدواء'] || '',
    category: row['التصنيف'] || '',
    expiry_date: row['تاريخ الانتهاء'] || null,
    quantity: Number(row['الكمية'] || 0),
    min_stock: Number(row['الحد الأدنى'] || 0),
    price: Number(row['السعر'] || 0),
    total_value: Number(row['القيمة الإجمالية'] || 0),
    status: row['الحالة'] || '',
  }
}

function uploadSequence(filename) {
  const stem = String(filename ?? '').replace(/\.[^.]+$/, '')
  const numbers = stem.match(/\d+/g)
  return numbers?.length ? Number(numbers[numbers.length - 1]) : -1
}

function sortUploadsNewestFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const sequenceDifference = uploadSequence(b.filename) - uploadSequence(a.filename)
    if (sequenceDifference) return sequenceDifference
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function editDistance(a, b) {
  if (!a) return b.length
  if (!b) return a.length
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = old
    }
  }
  return previous[b.length]
}

function medicineSearchScore(row, rawQuery) {
  const query = normalizeSearchText(rawQuery)
  if (!query) return 1
  const fields = [row.name, row.scientific_name, row.company, row.barcode, row.source_id]
    .map(normalizeSearchText).filter(Boolean)
  let best = 0
  for (const field of fields) {
    if (field === query) best = Math.max(best, 100)
    else if (field.startsWith(query)) best = Math.max(best, 90)
    else if (field.includes(query)) best = Math.max(best, 80)
    for (const word of field.split(' ')) {
      const distance = editDistance(query, word)
      const similarity = 1 - distance / Math.max(query.length, word.length, 1)
      if (similarity >= 0.62) best = Math.max(best, Math.round(similarity * 70))
    }
  }
  return best
}

async function fuzzySearchLatest(sb, latestId, q, limit) {
  if (!q) {
    const { data, error } = await sb.from('medicines').select('*').eq('upload_id', latestId)
      .order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    return data || []
  }

  const { data: direct, error: directError } = await sb.from('medicines').select('*')
    .eq('upload_id', latestId).ilike('search_text', `%${q.toLowerCase()}%`).limit(limit)
  if (directError) throw directError
  if (direct?.length) return direct.map(row => ({ ...row, _search_score: medicineSearchScore(row, q) || 80 }))

  const candidates = []
  const pageSize = 1000
  for (let from = 0; from < 10000; from += pageSize) {
    const { data: page, error } = await sb.from('medicines')
      .select('id,name,scientific_name,company,barcode,source_id').eq('upload_id', latestId)
      .range(from, from + pageSize - 1)
    if (error) throw error
    candidates.push(...(page || []))
    if (!page || page.length < pageSize) break
  }
  const matches = candidates.map(row => ({ ...row, _search_score: medicineSearchScore(row, q) }))
    .filter(row => row._search_score > 0)
    .sort((a, b) => b._search_score - a._search_score)
    .slice(0, limit)
  if (!matches.length) return []
  const scoreById = new Map(matches.map(row => [row.id, row._search_score]))
  const { data: fullRows, error: fullError } = await sb.from('medicines').select('*')
    .in('id', matches.map(row => row.id))
  if (fullError) throw fullError
  return (fullRows || []).map(row => ({ ...row, _search_score: scoreById.get(row.id) || 0 }))
    .sort((a, b) => b._search_score - a._search_score)
}

async function handle(request, { params }) {
  const { path = [] } = await params
  const route = `/${path.join('/')}`
  const method = request.method
  try {
    if (route === '/' && method === 'GET') {
      return cors(NextResponse.json({ ok: true, service: 'pharmacy-search' }))
    }

    // -------- SIGNUP (public) - new users start as 'pending' --------
    if (route === '/signup' && method === 'POST') {
      const body = await request.json()
      const { email, password, full_name } = body || {}
      if (!email || !password) return cors(NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 }))
      if (String(password).length < 8) return cors(NextResponse.json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' }, { status: 400 }))
      const admin = supabaseAdmin()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      })
      if (cErr) return cors(NextResponse.json({ error: cErr.message }, { status: 400 }))
      const { error: pErr } = await admin.from('profiles').upsert({
        id: created.user.id, email, full_name: full_name || null, role: 'pending',
      })
      if (pErr) return cors(NextResponse.json({ error: pErr.message }, { status: 400 }))
      return cors(NextResponse.json({ ok: true, message: 'تم إرسال طلبك. سيتم تفعيل حسابك بعد موافقة الرئيس.' }))
    }

    // -------- WHOAMI: return current profile --------
    if (route === '/me' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      return cors(NextResponse.json(profile))
    }

    // -------- STATS (معدلة لتشمل إحصائيات حسب المخزن) --------
    if (route === '/stats' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      if (!latestId) return cors(NextResponse.json({ total_records: 0, by_warehouse: [] }))

      const { count: totalRecords, error: countError } = await sb.from('medicines')
        .select('*', { count: 'exact', head: true }).eq('upload_id', latestId)
      if (countError) throw countError
      const { count: totalUploads, error: uploadCountError } = await sb.from('uploads')
        .select('*', { count: 'exact', head: true })
      if (uploadCountError) throw uploadCountError

      // Supabase limits a response to 1000 rows, so read the current upload in safe pages.
      const allRows = []
      const pageSize = 1000
      for (let from = 0; from < (totalRecords || 0); from += pageSize) {
        const { data: page, error: pageError } = await sb.from('medicines')
          .select('name,company,warehouse').eq('upload_id', latestId).range(from, from + pageSize - 1)
        if (pageError) throw pageError
        allRows.push(...(page || []))
      }

      const warehouseMap = {}
      const medicineNames = new Set()
      const companies = new Set()
      allRows.forEach(item => {
        const wh = item.warehouse || 'غير محدد'
        warehouseMap[wh] = (warehouseMap[wh] || 0) + 1
        if (item.name) medicineNames.add(item.name.trim().toLowerCase())
        if (item.company) companies.add(item.company.trim().toLowerCase())
      })

      return cors(NextResponse.json({
        total_records: totalRecords || 0,
        unique_medicines: medicineNames.size,
        total_uploads: totalUploads || 0,
        warehouses_count: Object.keys(warehouseMap).length,
        companies_count: companies.size,
        by_warehouse: Object.entries(warehouseMap).map(([name, count]) => ({ name, count }))
      }))
    }

    // -------- UPLOADS LIST (auth required) --------
    if (route === '/uploads' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const sb = supabaseAdmin()
      const { data, error } = await sb.from('uploads').select('*').limit(500)
      if (error) throw error
      return cors(NextResponse.json(sortUploadsNewestFirst(data)))
    }

    // -------- UPLOAD FILE (ADMIN ONLY) --------
    if (route === '/upload' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden: admin only' }, { status: 403 }))
      const formData = await request.formData()
      const file = formData.get('file')
      const warehouseHint = formData.get('warehouse') || null
      if (!file) return cors(NextResponse.json({ error: 'No file provided' }, { status: 400 }))
      const extension = String(file.name || '').toLowerCase().split('.').pop()
      if (!['xlsx', 'xls', 'csv'].includes(extension)) {
        return cors(NextResponse.json({ error: 'نوع الملف غير مدعوم. استخدم xlsx أو xls أو csv' }, { status: 400 }))
      }
      if (file.size > 25 * 1024 * 1024) {
        return cors(NextResponse.json({ error: 'حجم الملف أكبر من الحد المسموح (25 MB)' }, { status: 413 }))
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const { records, headers, mapped } = parseSheetBuffer(buffer, file.name)

      if (!records.length) {
        return cors(NextResponse.json({
          error: 'لم يتم العثور على أي صفوف صالحة. تأكد من وجود عمود "اسم الدواء".',
          headers, mapped,
        }, { status: 400 }))
      }

      const sb = supabaseAdmin()
      const { data: uploadRow, error: upErr } = await sb.from('uploads').insert({
        filename: file.name,
        rows_count: records.length,
        warehouse_hint: warehouseHint,
        uploaded_by: profile.id,
        uploaded_by_email: profile.email,
      }).select('*').single()
      if (upErr) throw upErr

      const BATCH = 500
      let inserted = 0
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH).map(r => ({
          ...r,
          upload_id: uploadRow.id,
          warehouse: r.warehouse || warehouseHint || null,
        }))
        const { error: insErr } = await sb.from('medicines').insert(batch)
        if (insErr) { console.error('Batch insert error:', insErr); throw insErr }
        inserted += batch.length
      }

      return cors(NextResponse.json({ ok: true, upload_id: uploadRow.id, filename: file.name, rows_inserted: inserted, headers, mapped }))
    }

    // Helper to get latest upload id (for "current dataset" filtering)
    async function getLatestUploadId(sb) {
      const { data, error } = await sb.from('uploads').select('id,filename,created_at').limit(500)
      if (error) throw error
      return sortUploadsNewestFirst(data)[0]?.id || null
    }

    async function resolveUploadId(sb, requestedId) {
      if (requestedId) {
        const { data } = await sb.from('uploads').select('id').eq('id', requestedId).maybeSingle()
        if (data?.id) return data.id
      }
      return getLatestUploadId(sb)
    }

    // -------- LIVE SUGGESTIONS (auth required) - filters to LATEST UPLOAD ONLY --------
    if (route === '/suggest' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return cors(NextResponse.json([]))
      const sb = supabaseAdmin()
      const latestId = await resolveUploadId(sb, url.searchParams.get('upload_id'))
      if (!latestId) return cors(NextResponse.json([]))
      const data = await fuzzySearchLatest(sb, latestId, q, 200)
      // Group by name in JS
      const map = new Map()
      for (const r of data || []) {
        const key = r.name
        if (!map.has(key)) map.set(key, { name: r.name, scientific_name: r.scientific_name, company: r.company, hits: 0, max_id: parseInt(r.source_id) || 0 })
        const g = map.get(key); g.hits++
        const sid = parseInt(r.source_id); if (!isNaN(sid) && sid > g.max_id) g.max_id = sid
      }
      const out = Array.from(map.values())
        .sort((a, b) => {
          const aStarts = a.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1
          const bStarts = b.name.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1
          if (aStarts !== bStarts) return aStarts - bStarts
          return b.max_id - a.max_id
        })
        .slice(0, 10)
      return cors(NextResponse.json(out))
    }

    // -------- SEARCH (auth required) - filters to LATEST UPLOAD ONLY --------
    if (route === '/search' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim()
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 2000)
      const sb = supabaseAdmin()
      const latestId = await resolveUploadId(sb, url.searchParams.get('upload_id'))
      if (!latestId) return cors(NextResponse.json([]))
      const data = await fuzzySearchLatest(sb, latestId, q, limit)
      return cors(NextResponse.json(data))
    }

    // -------- DELETE AN UPLOAD (admin only) -------- 
    if (route.startsWith('/uploads/') && method === 'DELETE') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      const sb = supabaseAdmin()
      const { error: dmErr } = await sb.from('medicines').delete().eq('upload_id', id)
      if (dmErr) return cors(NextResponse.json({ error: dmErr.message }, { status: 400 }))
      const { error: duErr } = await sb.from('uploads').delete().eq('id', id)
      if (duErr) return cors(NextResponse.json({ error: duErr.message }, { status: 400 }))
      return cors(NextResponse.json({ ok: true }))
    }

    // -------- HISTORY (auth required) --------
    if (route === '/history' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const url = new URL(request.url)
      const name = (url.searchParams.get('name') || '').trim()
      if (!name) return cors(NextResponse.json([]))
      const sb = supabaseAdmin()
      const { data, error } = await sb.from('medicines')
        .select('*').ilike('name', name)
        .order('invoice_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      // The same source sheet may be uploaded more than once. Keep the database
      // untouched and hide identical purchase rows only in the history response.
      const seen = new Set()
      const history = (data || []).filter((row) => {
        const purchaseKey = [
          row.name, row.source_id, row.invoice_number, row.invoice_date,
          row.warehouse, row.quantity, row.unit_price, row.total_price,
          row.expiry_raw || row.expiry_date,
        ].map(value => String(value ?? '').trim().toLowerCase()).join('|')
        if (seen.has(purchaseKey)) return false
        seen.add(purchaseKey)
        return true
      })
      return cors(NextResponse.json(history))
    }

    // -------- USERS LIST (admin only) --------
    // -------- INVENTORY MANAGEMENT (ADMIN ONLY) --------
    if (route === '/inventory/source' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.get)
      return cors(NextResponse.json(data))
    }

    if (route === '/inventory/stock' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const body = await request.json()
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.update, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      return cors(NextResponse.json(data || { ok: true }))
    }

    if (route === '/inventory/add' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const body = await request.json()
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.add, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      return cors(NextResponse.json(data || { ok: true }))
    }

    if (route === '/inventory/delete' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const body = await request.json()
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.delete, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      return cors(NextResponse.json(data || { ok: true }))
    }

    if (route === '/inventory' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()
      const raw = await callInventoryWebhook(INVENTORY_WEBHOOKS.get)
      let items = (Array.isArray(raw) ? raw : raw?.data || raw?.items || []).map(normalizeInventoryItem)
      if (q) items = items.filter(item => `${item.name} ${item.category} ${item.medicine_code}`.toLowerCase().includes(q))
      const now = new Date(); now.setHours(0, 0, 0, 0)
      const in90 = new Date(now); in90.setDate(in90.getDate() + 90)
      const summary = items.reduce((s, item) => {
        const qty = Number(item.quantity || 0), min = Number(item.min_stock ?? 10)
        if (qty <= min) s.low_stock++
        if (item.expiry_date) {
          const expiry = new Date(item.expiry_date)
          if (expiry < now) s.expired++
          else if (expiry <= in90) s.expiring++
        }
        return s
      }, { total: items.length, low_stock: 0, expiring: 0, expired: 0 })
      return cors(NextResponse.json({ items, summary }))
    }

    if (route === '/inventory' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const body = await request.json()
      if (!body?.name?.trim()) return cors(NextResponse.json({ error: 'اسم الدواء مطلوب' }, { status: 400 }))
      const payload = {
        action: 'add',
        name: body.name.trim(),
        category: body.category || '',
        expiry_date: body.expiry_date || '',
        quantity: Number(body.quantity || 0),
        min_stock: Number(body.min_stock || 0),
        price: Number(body.price || 0),
        'اسم الدواء': body.name.trim(), 'التصنيف': body.category || '', 'تاريخ الانتهاء': body.expiry_date || '',
        'الكمية': Number(body.quantity || 0), 'الحد الأدنى': Number(body.min_stock || 0), 'السعر': Number(body.price || 0),
      }
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.update, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return cors(NextResponse.json({ ok: true, result: data }))
    }

    if (route.startsWith('/inventory/') && method === 'PATCH') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      const body = await request.json()
      if (!['increase', 'dispense'].includes(body?.action)) return cors(NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 }))
      const qty = Number(body.qty)
      if (!Number.isFinite(qty) || qty <= 0) return cors(NextResponse.json({ error: 'الكمية غير صالحة' }, { status: 400 }))
      const currentQuantity = Number(body.current_quantity || 0)
      const newQuantity = body.action === 'increase' ? currentQuantity + qty : currentQuantity - qty
      if (newQuantity < 0) return cors(NextResponse.json({ error: 'الكمية المطلوبة أكبر من الكمية المتوفرة' }, { status: 400 }))
      const payload = {
        row_number: Number(body.row_number || id), medicine_code: body.medicine_code, id: body.medicine_code,
        action: body.action, qty, amount: qty, current_quantity: currentQuantity, new_quantity: newQuantity,
        quantity: newQuantity, 'رمز الدواء': body.medicine_code, 'الكمية': newQuantity,
      }
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.update, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return cors(NextResponse.json({ ok: true, result: data, new_quantity: newQuantity }))
    }

    if (route.startsWith('/inventory/') && method === 'DELETE') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      const body = await request.json().catch(() => ({}))
      const payload = { row_number: Number(body.row_number || id), medicine_code: body.medicine_code, id: body.medicine_code, 'رمز الدواء': body.medicine_code }
      const data = await callInventoryWebhook(INVENTORY_WEBHOOKS.delete, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      return cors(NextResponse.json({ ok: true, result: data }))
    }

    if (route === '/users' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const sb = supabaseAdmin()
      const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return cors(NextResponse.json(data || []))
    }

    // -------- CREATE USER (admin only) --------
    if (route === '/users' && method === 'POST') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const body = await request.json()
      const { email, password, full_name, role = 'staff' } = body || {}
      if (!email || !password) return cors(NextResponse.json({ error: 'البريد وكلمة المرور مطلوبان' }, { status: 400 }))
      if (!['admin','staff'].includes(role)) return cors(NextResponse.json({ error: 'invalid role' }, { status: 400 }))

      const admin = supabaseAdmin()
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name },
      })
      if (cErr) return cors(NextResponse.json({ error: cErr.message }, { status: 400 }))
      const { error: pErr } = await admin.from('profiles').upsert({
        id: created.user.id, email, full_name: full_name || null, role,
      })
      if (pErr) return cors(NextResponse.json({ error: pErr.message }, { status: 400 }))
      return cors(NextResponse.json({ ok: true, user: { id: created.user.id, email, full_name, role } }))
    }

    // -------- DELETE USER (admin only) --------
    if (route.startsWith('/users/') && method === 'DELETE') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      if (id === profile.id) return cors(NextResponse.json({ error: 'لا يمكنك حذف نفسك' }, { status: 400 }))
      const admin = supabaseAdmin()
      const { error: dErr } = await admin.auth.admin.deleteUser(id)
      if (dErr) return cors(NextResponse.json({ error: dErr.message }, { status: 400 }))
      return cors(NextResponse.json({ ok: true }))
    }

    // -------- UPDATE USER ROLE (admin only) --------
    if (route.startsWith('/users/') && method === 'PATCH') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      const body = await request.json()
      const { role, password } = body || {}
      const admin = supabaseAdmin()
      if (password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password })
        if (error) return cors(NextResponse.json({ error: error.message }, { status: 400 }))
      }
      if (role && ['admin','staff'].includes(role)) {
        const { error } = await admin.from('profiles').update({ role }).eq('id', id)
        if (error) return cors(NextResponse.json({ error: error.message }, { status: 400 }))
      }
      return cors(NextResponse.json({ ok: true }))
    }

    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (e) {
    console.error('API error:', e)
    return cors(NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 }))
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
