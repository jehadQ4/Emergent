# إعداد نظام إدارة المخزن

بعد نشر التحديث، شغّل الأمر التالي مرة واحدة في **Supabase SQL Editor**:

```sql
alter table public.medicines
add column if not exists min_stock numeric default 10;
```

لربط عمليات المخزن بـ n8n أضف متغير البيئة التالي إلى الخادم:

```env
N8N_INVENTORY_WEBHOOK_URL=https://your-n8n-domain/webhook/inventory
```

يرسل النظام عمليات `add` و`increase` و`dispense` و`delete`. عمليات الكمية تتضمن
`qty` و`current_quantity` و`new_quantity`، ولا تتعطل العملية الأساسية إذا كان n8n غير متاح.
