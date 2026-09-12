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
  if (!profile) return { id: user.id, email: user.email, role: 'staff', full_name: user.user_metadata?.full_name || null }
  return profile
}

async function notifyInventoryWebhook(payload) {
  const webhook = process.env.N8N_INVENTORY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'pharmacy-inventory', occurred_at: new Date().toISOString(), ...payload }),
      cache: 'no-store',
    })
  } catch (error) {
    console.error('n8n inventory webhook error:', error)
  }
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

      // جلب الإحصائيات العامة + توزيع الأدوية حسب المخزن
      const { data: general, error: gErr } = await sb.from('medicines')
        .select('warehouse', { count: 'exact' })
        .eq('upload_id', latestId)

      if (gErr) throw gErr

      // تجميع البيانات في JS (عدد الأدوية لكل مخزن)
      const warehouseMap = {}
      general.forEach(item => {
        const wh = item.warehouse || 'غير محدد'
        warehouseMap[wh] = (warehouseMap[wh] || 0) + 1
      })

      return cors(NextResponse.json({
        total_records: general.length,
        by_warehouse: Object.entries(warehouseMap).map(([name, count]) => ({ name, count }))
      }))
    }

    // -------- UPLOADS LIST (auth required) --------
    if (route === '/uploads' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const sb = supabaseAdmin()
      const { data, error } = await sb.from('uploads').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return cors(NextResponse.json(data || []))
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
      const { data } = await sb.from('uploads').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
      return data?.id || null
    }

    // -------- LIVE SUGGESTIONS (auth required) - filters to LATEST UPLOAD ONLY --------
    if (route === '/suggest' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return cors(NextResponse.json([]))
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      if (!latestId) return cors(NextResponse.json([]))
      const { data, error } = await sb.from('medicines')
        .select('name, scientific_name, company, source_id')
        .eq('upload_id', latestId)
        .ilike('search_text', `%${q.toLowerCase()}%`)
        .limit(200)
      if (error) throw error
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
      const latestId = await getLatestUploadId(sb)
      if (!latestId) return cors(NextResponse.json([]))
      let query = sb.from('medicines').select('*').eq('upload_id', latestId).order('created_at', { ascending: false }).limit(limit)
      if (q) query = query.ilike('search_text', `%${q.toLowerCase()}%`)
      const { data, error } = await query
      if (error) throw error
      return cors(NextResponse.json(data || []))
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
      return cors(NextResponse.json(data || []))
    }

    // -------- USERS LIST (admin only) --------
    // -------- INVENTORY MANAGEMENT (ADMIN ONLY) --------
    if (route === '/inventory' && method === 'GET') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim().toLowerCase()
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      if (!latestId) return cors(NextResponse.json({ items: [], summary: { total: 0, low_stock: 0, expiring: 0, expired: 0 } }))
      let dbQuery = sb.from('medicines').select('*').eq('upload_id', latestId).order('name').limit(2000)
      if (q) dbQuery = dbQuery.ilike('search_text', `%${q}%`)
      const { data, error } = await dbQuery
      if (error) throw error
      const items = data || []
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
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      if (!latestId) return cors(NextResponse.json({ error: 'ارفع ملف الأدوية أولاً، ثم أضف الدواء إلى المخزن' }, { status: 400 }))
      const row = {
        upload_id: latestId, name: body.name.trim(), scientific_name: body.scientific_name || null,
        company: body.company || null, quantity: Number(body.quantity || 0), min_stock: Number(body.min_stock ?? 10),
        expiry_date: body.expiry_date || null, expiry_raw: body.expiry_date || null, batch_number: body.batch_number || null,
        barcode: body.barcode || null, selling_price: body.selling_price === '' ? null : Number(body.selling_price),
        notes: body.notes || null, warehouse: body.warehouse || 'المخزن الرئيسي',
      }
      const { data, error } = await sb.from('medicines').insert(row).select('*').single()
      if (error) throw error
      await notifyInventoryWebhook({ action: 'add', item: data, performed_by: profile.email })
      return cors(NextResponse.json({ ok: true, item: data }))
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
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      const { data: current, error: findError } = await sb.from('medicines').select('*').eq('id', id).eq('upload_id', latestId).maybeSingle()
      if (findError) throw findError
      if (!current) return cors(NextResponse.json({ error: 'الدواء غير موجود في المخزن الحالي' }, { status: 404 }))
      const currentQuantity = Number(current.quantity || 0)
      const newQuantity = body.action === 'increase' ? currentQuantity + qty : currentQuantity - qty
      if (newQuantity < 0) return cors(NextResponse.json({ error: 'الكمية المطلوبة أكبر من الكمية المتوفرة' }, { status: 400 }))
      const { data, error } = await sb.from('medicines').update({ quantity: newQuantity }).eq('id', id).select('*').single()
      if (error) throw error
      await notifyInventoryWebhook({ action: body.action, qty, current_quantity: currentQuantity, new_quantity: newQuantity, item: data, performed_by: profile.email })
      return cors(NextResponse.json({ ok: true, item: data }))
    }

    if (route.startsWith('/inventory/') && method === 'DELETE') {
      const profile = await getUserProfile(request)
      if (!profile) return cors(NextResponse.json({ error: 'unauthenticated' }, { status: 401 }))
      if (profile.role !== 'admin') return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const id = route.split('/')[2]
      const sb = supabaseAdmin()
      const latestId = await getLatestUploadId(sb)
      const { data: current } = await sb.from('medicines').select('*').eq('id', id).eq('upload_id', latestId).maybeSingle()
      if (!current) return cors(NextResponse.json({ error: 'الدواء غير موجود في المخزن الحالي' }, { status: 404 }))
      const { error } = await sb.from('medicines').delete().eq('id', id)
      if (error) throw error
      await notifyInventoryWebhook({ action: 'delete', item: current, performed_by: profile.email })
      return cors(NextResponse.json({ ok: true }))
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
