<div dir="rtl">

# LeadConnector Clone — تطبيق CRM كامل بنمط LeadConnector / HighLevel

تطبيق متكامل (واجهة + سيرفر + قاعدة بيانات + أتمتة) يحاكي تطبيق **LeadConnector** للموبايل:
صندوق وارد موحّد لكل القنوات، جهات الاتصال، خطوط المبيعات (Pipelines)، التقويم والحجوزات،
المهام، الفواتير والمدفوعات، التقييمات (Reputation)، الإشعارات، الاتصال، والأتمتة (Workflows).

> الكود ملكك بالكامل — غيّر الاسم والألوان والشعار وانشره باسمك.

---

## التشغيل السريع

المتطلبات: **Node.js 22.9 أو أحدث** (قاعدة البيانات SQLite مدمجة في Node، لا تحتاج تثبيت أي قاعدة بيانات).

```bash
cd leadconnector-clone
npm run install:all     # تثبيت حزم السيرفر والواجهة
npm run dev             # السيرفر على 4000 والواجهة على 5173
```

افتح: http://localhost:5173
حساب تجريبي جاهز (يُنشأ تلقائياً مع بيانات تجريبية):

| البريد | كلمة المرور | الصلاحية |
|---|---|---|
| demo@leadconnector.app | demo1234 | Admin |
| sara@leadconnector.app | demo1234 | User |

### تشغيل الإنتاج (Production)

```bash
cp .env.example .env    # عدّل JWT_SECRET و PUBLIC_URL
npm run build           # يبني الواجهة إلى client/dist
npm start               # السيرفر يخدم الواجهة + الـ API على منفذ واحد (4000)
```

أو عبر Docker:

```bash
docker build -t leadconnector-clone .
docker run -p 4000:4000 -v lc-data:/data -e JWT_SECRET=xxx -e PUBLIC_URL=https://crm.yourdomain.com leadconnector-clone
```

### إعادة البيانات التجريبية

```bash
npm run seed            # يمسح قاعدة البيانات ويعيد تعبئتها
```

ابدأ بقاعدة فارغة بوضع `SEED=false` في ملف `.env` ثم سجّل حساب جديد من صفحة **Create an account**.

---

## تحويله إلى تطبيق موبايل (Android / iOS)

الواجهة مبنية كـ **PWA** (قابلة للتثبيت من المتصفح على الهاتف مباشرة: "Add to Home screen").
ولإنتاج تطبيق متجر (APK / AAB / IPA) استخدم Capacitor:

```bash
cd client
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "LeadConnector" com.yourcompany.leadconnector --web-dir=dist
# اجعل الواجهة تتصل بالسيرفر المنشور:
echo "VITE_API_URL=https://crm.yourdomain.com" > .env.production
npm run build
npx cap add android && npx cap sync && npx cap open android   # Android Studio → Build APK
npx cap add ios && npx cap open ios                            # Xcode (على Mac)
```

---

## ربط القنوات الحقيقية

بدون مفاتيح، الإرسال **محاكى** (يُسجَّل ويظهر كـ delivered) حتى يعمل كل شيء مباشرة.
لتفعيل الإرسال الحقيقي ضع المفاتيح في `.env`:

| القناة | المتغيرات |
|---|---|
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| WhatsApp | نفس Twilio + `TWILIO_WHATSAPP_FROM` |
| Email | `SENDGRID_API_KEY`, `EMAIL_FROM` |

استقبال الرسائل الواردة:
- **Twilio SMS/WhatsApp**: ضع Webhook الرسائل في Twilio إلى `POST https://your-domain/api/public/twilio`
- **أي قناة أخرى** (Facebook, Instagram, Google Business…): `POST /api/public/inbound/:locationId?key=API_KEY`
  بجسم `{ "type": "facebook", "phone"|"email": "...", "name": "...", "body": "..." }`
- **نماذج الموقع / Zapier**: `POST /api/public/leads/:locationId?key=API_KEY`
- **Live Chat**: صفحة `/chat/:locationId` جاهزة للتضمين في موقعك عبر iframe (الكود موجود في Settings → Integrations)

بوابة الدفع: صفحة الدفع `/pay/:token` جاهزة، والدفع حالياً محاكى. اربط Stripe في
`server/src/routes/public.js` داخل `POST /invoices/:token/pay` (التعليق يوضح المكان).
بطاقة `4000 0000 0000 0002` تحاكي رفض الدفع للاختبار.

---

## هيكل المشروع

```
leadconnector-clone/
├── server/                     Node.js + Express + SQLite (node:sqlite)
│   └── src/
│       ├── index.js            تشغيل السيرفر، المسارات، SSE للتحديث اللحظي
│       ├── db.js               مخطط قاعدة البيانات (31 جدول) + أدوات
│       ├── auth.js             JWT + صلاحيات + الحساب الفرعي النشط
│       ├── services.js         منطق الأعمال: جهات الاتصال، الرسائل، الإشعارات، الدفع…
│       ├── workflows.js        محرك الأتمتة (12 مُشغّل، 15 إجراء، انتظار، سجل تنفيذ)
│       ├── scheduler.js        الرسائل المجدولة، استكمال الانتظار، تذكير المواعيد
│       ├── providers.js        Twilio / SendGrid (أو محاكاة)
│       ├── seed.js             بيانات تجريبية
│       └── routes/             auth, contacts, conversations, opportunities, calendars,
│                               tasks, payments, reviews, misc, public
└── client/                     React 18 + Vite + React Router (PWA)
    └── src/
        ├── App.jsx             كل الشاشات (40+ شاشة)
        ├── app-context.jsx     المستخدم، الحساب الفرعي، الفريق، التحديث اللحظي، الإشعارات
        ├── components/         Layout (الشريط السفلي + زر ⚡)، FilterBuilder، ContactPicker، UI
        └── pages/              الشاشات + settings/ + public/ (حجز، دفع، تقييم، شات)
```

قائمة الميزات الكاملة ومقارنتها مع التطبيق الأصلي: **[FEATURES.md](FEATURES.md)**

</div>

---

## English quick reference

- `npm run install:all && npm run dev` → API on :4000, web app on :5173 (login `demo@leadconnector.app` / `demo1234`).
- `npm run build && npm start` → single server on :4000 serving the built PWA + API.
- Data lives in SQLite (`server/data/app.db`, built into Node ≥ 22.9 — no external DB needed).
- Real SMS/WhatsApp/email turn on automatically when Twilio / SendGrid env vars are set; otherwise delivery is simulated.
- See [FEATURES.md](FEATURES.md) for the full feature map and API reference.
