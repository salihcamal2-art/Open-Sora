<div dir="rtl">

# خريطة الميزات — LeadConnector Clone

هذا الملف يجمع نتائج البحث عن تطبيق LeadConnector (تطبيق HighLevel للموبايل، أكثر من 100 ألف تحميل،
آخر تحديث 30 سبتمبر 2026: "Advanced Filters using AND/OR rules across channels, assignees, followers,
mentions, and message direction") وكيف تم تنفيذ كل ميزة في هذا المشروع.

مصادر البحث: صفحة التطبيق على Google Play، دليل البدء السريع الرسمي لـ LeadConnector،
مقالات HighLevel Support عن تجربة الموبايل الجديدة، الاتصال الصادر، Opportunities V2، ومساحة جهات الاتصال الموحّدة.

## 1) التنقل والواجهة
| الميزة في التطبيق الأصلي | التنفيذ |
|---|---|
| شريط سفلي (Home, Conversations, Contacts, Opportunities, More) | `components/Layout.jsx` — مع شارات عدد غير المقروء |
| زر البرق ⚡ للإجراءات السريعة (SMS، Email، Call، إضافة جهة اتصال، حجز موعد، طلب تقييم، فاتورة…) | زر عائم + 12 إجراء سريع |
| الصفحة الرئيسية الجديدة: 8 اختصارات مثبتة قابلة لإعادة الترتيب بالسحب | `Home.jsx` — تعديل/تثبيت/سحب لإعادة الترتيب، تُحفظ في تفضيلات المستخدم |
| تبديل الحساب الفرعي (Sub-account / Location) | الضغط على اسم النشاط أعلى الرئيسية + إنشاء حساب فرعي جديد |
| لوحة مؤشرات (Insights) | محادثات غير مقروءة، قيمة الـ pipeline، الإيراد، المهام المستحقة، العملاء الجدد، متوسط التقييم، مواعيد اليوم، الفرص حسب المرحلة، مصادر العملاء، رسم بياني 14 يوم |
| بحث شامل | `/search` — جهات اتصال، فرص، فواتير |
| الوضع الليلي | تلقائي حسب النظام أو يدوي من الإعدادات |
| شريط جانبي على الشاشات الكبيرة | يظهر تلقائياً على عرض ≥ 960px |

## 2) المحادثات (Unified Inbox)
| الميزة | التنفيذ |
|---|---|
| كل القنوات في صندوق واحد: SMS، Email، WhatsApp، Facebook، Instagram، Google Business، Live Chat، المكالمات | جدول `messages` موحّد بحقل `type` |
| تبويبات: Unread، Recents، Starred، Assigned to me، Unassigned، All، Closed | `Conversations.jsx` |
| **Advanced Filters بقواعد AND/OR** عبر القناة، المُسند إليه، المتابعين، الإشارات (Mentions)، اتجاه الرسالة، الحالة، النجمة، غير المقروء، الوسم | `FilterBuilder.jsx` (مجموعات قواعد + AND/OR داخل وبين المجموعات + is / is not) ← يُترجم إلى SQL في `routes/conversations.js` |
| حفظ الفلاتر كاختصارات | تُحفظ في تفضيلات المستخدم |
| اختيار قناة الإرسال، الموضوع للبريد | محدد القناة في شاشة المحادثة |
| Snippets (قوالب) مع متغيرات `{{contact.first_name}}` … | الإعدادات ← Snippets، وزر في المحادثة |
| جدولة الرسائل وإلغاؤها | الرسائل المجدولة تُرسل بواسطة `scheduler.js` |
| تعليقات داخلية مع @mention للزملاء + إشعار | قناة "Internal Comment" |
| إسناد المحادثة، المتابعة (Follow)، تمييز كمقروء/غير مقروء، نجمة، إغلاق/إعادة فتح، حذف | قائمة المحادثة + ضغط مطوّل في القائمة |
| احترام DND لكل قناة، و STOP يفعّل DND تلقائياً | `services.js` |
| عدّاد مقاطع SMS | أسفل مربع الكتابة |
| تحديث لحظي بدون إعادة تحميل | Server-Sent Events `/api/stream` |

## 3) جهات الاتصال (Contacts)
| الميزة | التنفيذ |
|---|---|
| بحث، ترتيب، تحميل المزيد | `Contacts.jsx` |
| Smart Lists (قوائم ذكية محفوظة) + "My contacts" | تبويبات أعلى القائمة + "Save as smart list" |
| فلاتر: الوسوم، النوع، المُسند إليه، المصدر، DND، وجود هاتف/بريد | ورقة الفلاتر |
| إجراءات جماعية: إضافة/إزالة وسوم، إسناد، DND، حذف | وضع التحديد |
| ضغط مطوّل ← بطاقات Call / SMS / Email / Book / Collect Payment | كما في التطبيق الأصلي |
| **مسح بطاقة العمل (Business Card Scanner)** | `ScanCard.jsx` — OCR على الجهاز (tesseract.js) + استخراج الاسم/الهاتف/البريد/الشركة/المسمى |
| استيراد CSV مع مطابقة الأعمدة + استيراد من جهات اتصال الهاتف (Contact Picker API) | `ImportContacts.jsx` |
| ملف جهة الاتصال: التفاصيل، النشاط (Timeline)، الملاحظات، المهام، المواعيد، الفرص، المدفوعات | `ContactDetail.jsx` |
| الحقول المخصّصة (نص، رقم، تاريخ، قائمة، مربع اختيار) | الإعدادات ← Custom Fields |
| الوسوم | إضافة/إزالة من الملف + إدارة من الإعدادات |
| DND لكل قناة أو لكل القنوات | مفاتيح في تبويب التفاصيل |
| إضافة إلى Workflow يدوياً، طلب تقييم، إنشاء فاتورة/فرصة | قائمة ⋮ |
| منع التكرار (هاتف/بريد) | رسالة خطأ 409 |

## 4) الفرص (Opportunities / Pipelines)
| الميزة | التنفيذ |
|---|---|
| لوحة Kanban حسب المراحل مع السحب والإفلات | `Opportunities.jsx` |
| عرض قائمة بديل | زر التبديل |
| مجموع القيمة لكل مرحلة | رأس العمود |
| إجراءات سريعة على البطاقة: Call، SMS، Note، Task، تغيير المرحلة، Won/Lost | ورقة الإجراءات (Opportunities V2) |
| الحالات: Open / Won / Lost / Abandoned + سبب الخسارة | نموذج الفرصة |
| عدة Pipelines + تحرير المراحل وترتيبها | الإعدادات ← Pipelines |

## 5) التقويم والمواعيد
| الميزة | التنفيذ |
|---|---|
| عرض يومي (Timeline) + شريط الأسبوع + عرض القائمة | `Calendars.jsx` |
| حجز موعد من الأوقات المتاحة أو وقت مخصّص | `AppointmentForm.jsx` |
| حجب وقت (Block off time) | زر + ← Block off time |
| حالات الموعد: Confirmed / Showed / No-show / Cancelled | أزرار الحالة |
| عدة تقويمات، مدة، فاصل (buffer)، ساعات عمل أسبوعية بعدة فترات، مالك | الإعدادات ← Calendars |
| **صفحة حجز عامة** للعملاء `/book/:slug` | `public/BookPage.jsx` — تحترم التوافر والمواعيد المحجوزة والمنطقة الزمنية |
| تذكير قبل الموعد بـ 15 دقيقة | `scheduler.js` |

## 6) المهام
تبويبات Pending / Due today / Overdue / Completed / All، فلترة "لي" أو للجميع، ربط بجهة اتصال، إسناد، إشعار عند الإسناد.

## 7) المدفوعات
| الميزة | التنفيذ |
|---|---|
| الفواتير: بنود، خصم، ضريبة، تواريخ، ملاحظات، حالات (Draft/Sent/Partially paid/Paid/Overdue/Void) | `InvoiceForm.jsx` / `InvoiceDetail.jsx` |
| إرسال الفاتورة SMS / Email / WhatsApp مع رابط دفع (Text2Pay) | `POST /payments/invoices/:id/send` |
| صفحة دفع عامة `/pay/:token` | `public/PayPage.jsx` |
| تسجيل دفعة يدوية (نقد، بطاقة، تحويل، شيك) ودفعات جزئية | Record payment |
| نقطة البيع (POS) — مبلغ مخصص أو سلة منتجات | `PointOfSale.jsx` |
| المنتجات (مرة واحدة / متكرر) | الإعدادات ← Products |
| المعاملات + الاسترجاع (Refund) | تبويب Transactions |

## 8) السمعة والتقييمات (Reputation)
متوسط التقييم وتوزيع النجوم، الرد على التقييمات مع ردود جاهزة، فلترة حسب المنصة/غير المرد عليها،
**طلب تقييم** عبر SMS/Email مع صفحة تقييم عامة `/review/:token` (4–5 نجوم ← تحويل إلى Google، أقل ← ملاحظات خاصة)، سجل الطلبات.

## 9) الاتصال (Dialer)
لوحة أرقام، اختيار جهة اتصال، الاتصال عبر الهاتف (`tel:`)، مؤقت المكالمة، تسجيل النتيجة (Connected / No answer / Voicemail / Busy / Wrong number) والمدة والملاحظات في المحادثة، سجل المكالمات الأخيرة.

## 10) الإجراءات اليدوية (Manual Actions)
قائمة مهام اتصال/رسائل تُنشئها الـ Workflows، مع "Call now / Text now / Done / Skip".

## 11) الإشعارات
داخل التطبيق + لحظية + إشعارات المتصفح، حسب النوع: رسائل واردة، إسناد، إشارة @، مواعيد، مهام، مدفوعات، تقييمات، Workflows.
تفضيلات لكل نوع + وضع "عدم الإزعاج" للمستخدم.

## 12) الأتمتة (Workflows)
- **المُشغِّلات (12):** Contact Created، Tag Added، Customer Replied (حسب القناة)، Appointment Booked، Appointment Status، Opportunity Created، Stage Changed، Opportunity Status، Invoice Paid، Payment Received، Review Received (حسب الحد الأقصى للتقييم)، Task Completed.
- **الإجراءات (15):** Send SMS / Email / WhatsApp، Add/Remove Tag، Create Task، Create/Update Opportunity، Assign User، Add Note، Update Field (بما فيها الحقول المخصّصة)، Enable DND، Internal Notification، Manual Action، **Wait**، Webhook.
- نشر/إيقاف، سجل تنفيذ لكل خطوة، حماية من الحلقات اللانهائية، إضافة جهة اتصال يدوياً لأي Workflow.

## 13) الفريق والحسابات
تسجيل/دخول JWT، أدوار Admin/User، إضافة أعضاء، عدة حسابات فرعية لكل مستخدم، تعديل الملف الشخصي وكلمة المرور.

## 14) التكاملات
مفتاح API لكل حساب فرعي، Webhook لـ Twilio، استقبال العملاء من النماذج/Zapier، استقبال رسائل أي قناة، ويدجت Live Chat قابل للتضمين.

</div>

---

## REST API reference (all under `/api`, JSON, `Authorization: Bearer <token>`, `X-Location-Id: <id>`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET/PUT /auth/me`, `PUT /auth/me/password`, `GET/PUT /auth/location`, `POST /auth/locations`, `POST /auth/location/api-key`, `GET/POST /auth/team`, `PUT/DELETE /auth/team/:id` |
| Contacts | `GET/POST /contacts`, `POST /contacts/import`, `POST /contacts/bulk`, `GET/PUT/DELETE /contacts/:id`, `/contacts/:id/{tags,notes,tasks,activity,opportunities,appointments,invoices,workflows}`, `GET/POST/DELETE /contacts/{tags,custom-fields,smart-lists}` |
| Conversations | `GET /conversations?tab=&q=&filter=<json>`, `POST /conversations`, `GET/PUT/DELETE /conversations/:id`, `GET/POST /conversations/:id/messages`, `DELETE /conversations/:id/messages/:mid`, `POST /conversations/:id/{calls,read,follow}` |
| Opportunities | `GET/POST /opportunities`, `GET/PUT/DELETE /opportunities/:id`, `GET/POST /opportunities/pipelines`, `PUT/DELETE /opportunities/pipelines/:id` |
| Calendars | `GET/POST /calendars`, `PUT/DELETE /calendars/:id`, `GET /calendars/:id/slots?date=`, `GET /calendars/appointments/list`, `POST /calendars/appointments`, `GET/PUT/DELETE /calendars/appointments/:id` |
| Tasks | `GET/POST /tasks`, `PUT/DELETE /tasks/:id` |
| Payments | `/payments/products`, `/payments/invoices` (+ `/:id/send`, `/:id/payments`, `/:id/void`), `/payments/transactions` (+ `/:id/refund`), `POST /payments/charge`, `GET /payments/summary` |
| Reviews | `GET/POST /reviews`, `GET /reviews/stats`, `POST /reviews/:id/reply`, `GET/POST /reviews/requests` |
| Other | `GET /dashboard`, `GET /search`, `GET /calls`, `/notifications`, `/snippets`, `/workflows` (+ `/meta`), `/manual-actions`, `GET /stream` (SSE) |
| Public | `/public/calendars/:slug` (+ `/slots`, `/book`), `/public/invoices/:token` (+ `/pay`), `/public/reviews/:token`, `/public/chat/:locationId`, `POST /public/leads/:locationId`, `POST /public/inbound/:locationId`, `POST /public/twilio` |
