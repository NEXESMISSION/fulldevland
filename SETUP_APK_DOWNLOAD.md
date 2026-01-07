# إعداد تحميل APK - دليل شامل

## الخطوة 1: إنشاء Bucket في Supabase

### في Supabase Dashboard:

1. **اذهب إلى Storage**
   - من القائمة الجانبية، اضغط على "Storage"

2. **أنشئ Bucket جديد**
   - اضغط على زر "New bucket"
   - **الاسم**: `app-downloads` (يجب أن يكون بالضبط هذا الاسم)
   - **Public bucket**: ✅ فعّل (مهم جداً - يجب أن يكون public)
   - **File size limit**: `104857600` (100 ميجابايت)
   - **Allowed MIME types**: 
     ```
     application/vnd.android.package-archive,application/octet-stream
     ```
   - اضغط "Create bucket"

## الخطوة 2: رفع ملف APK

### بعد إنشاء الـ Bucket:

1. **افتح الـ Bucket**
   - من قائمة Storage، اضغط على `app-downloads`

2. **ارفع الملف**
   - اضغط على "Upload file" أو اسحب الملف
   - اختر ملف APK الخاص بك
   - **اسم الملف**: يجب أن يكون بالضبط `app.apk` (مهم جداً)
   - اضغط "Upload"

3. **تحقق من الرفع**
   - يجب أن ترى ملف `app.apk` في قائمة الملفات
   - اضغط على الملف للتأكد من أنه تم رفعه بنجاح

## الخطوة 3: تشغيل SQL Policies

### في Supabase SQL Editor:

1. **افتح SQL Editor**
   - من القائمة الجانبية، اضغط على "SQL Editor"

2. **شغّل ملف SQL**
   - انسخ محتوى ملف `create_app_downloads_bucket.sql`
   - الصقه في SQL Editor
   - اضغط "Run" أو F5

3. **تحقق من النجاح**
   - يجب أن ترى رسالة نجاح
   - إذا كان هناك أخطاء، تأكد من أن الـ Bucket تم إنشاؤه أولاً

## الخطوة 4: اختبار التحميل

1. **اذهب إلى صفحة التحميل**
   - في التطبيق، اذهب إلى `/download`

2. **اضغط على زر التحميل**
   - يجب أن يبدأ تحميل ملف APK
   - إذا لم يعمل، تحقق من:
     - اسم الـ Bucket: `app-downloads`
     - اسم الملف: `app.apk`
     - الـ Bucket public

## بديل: استخدام مجلد Public

إذا لم تريد استخدام Supabase Storage:

1. **ضع الملف في مجلد Public**
   - انسخ ملف APK إلى: `frontend/public/app.apk`
   - يجب أن يكون الاسم بالضبط `app.apk`

2. **أعد بناء التطبيق**
   ```bash
   cd frontend
   npm run build
   ```

3. **التحميل سيعمل تلقائياً**
   - التطبيق سيبحث عن الملف في `/app.apk`

## استكشاف الأخطاء

### الخطأ: "Bucket not found"
- **الحل**: تأكد من إنشاء الـ Bucket في Dashboard أولاً

### الخطأ: "File not found"
- **الحل**: تأكد من أن اسم الملف هو بالضبط `app.apk`

### الخطأ: "Permission denied"
- **الحل**: تأكد من أن الـ Bucket public وتم تشغيل SQL policies

### الخطأ: "400 Bad Request"
- **الحل**: تأكد من أن MIME types صحيحة وأن الملف APK فعلياً

## ملاحظات مهمة

- ✅ اسم الـ Bucket يجب أن يكون: `app-downloads`
- ✅ اسم الملف يجب أن يكون: `app.apk`
- ✅ الـ Bucket يجب أن يكون Public
- ✅ يجب تشغيل SQL policies بعد إنشاء الـ Bucket

