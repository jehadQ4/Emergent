# إعداد نظام إدارة المخزن

نظام المخزن مستقل عن جدول أدوية Supabase ويقرأ حصراً من Google Sheet عبر n8n.
يمكن تغيير روابط n8n الافتراضية بإضافة متغيرات البيئة التالية إلى الخادم:

```env
N8N_GET_MEDICINES_URL=https://n8n.jehadq4.io/webhook/get-medicines
N8N_UPDATE_STOCK_URL=https://n8n.jehadq4.io/webhook/update-stock
N8N_DELETE_MEDICINE_URL=https://n8n.jehadq4.io/webhook/delete-medicine
```

لا تستخدم روابط `webhook-test` في الموقع المنشور لأنها لا تعمل إلا أثناء تنفيذ الاختبار داخل n8n.
