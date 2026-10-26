import Link from "next/link";
import "./public-document.css";

const CONTACT = "orvantacompany@gmail.com";

export function PublicLinks() {
  return (
    <nav className="public-doc__links" aria-label="صفحات عامة">
      <Link href="/">أورفانتا</Link>
      <Link href="/privacy">الخصوصية</Link>
      <Link href="/terms">الشروط</Link>
      <Link href="/login">دخول المكتب</Link>
      <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
    </nav>
  );
}

export function PublicHome() {
  return (
    <article className="public-doc">
      <div className="public-doc__sheet">
        <p className="public-doc__mark">Orvanta</p>
        <h1>أورفانتا</h1>
        <p>نظام تشغيل أعمال داخلي تديره أورفانتا. المكتب الخاص لصاحب الشركة، وليس خدمة عامة.</p>
        <p>
          للتواصل: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
        <PublicLinks />

        <section className="public-doc__en" lang="en" dir="ltr">
          <h2>Orvanta</h2>
          <p>Orvanta is an internal business operating system operated by Orvanta. The private office belongs to the company owner. It is not a public service.</p>
          <p>
            Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </section>
      </div>
    </article>
  );
}

export function PrivacyPolicy() {
  return (
    <article className="public-doc">
      <div className="public-doc__sheet">
        <p className="public-doc__mark">Orvanta</p>
        <h1>الخصوصية</h1>
        <p>أورفانتا نظام تشغيل أعمال داخلي تديره أورفانتا. يُستخدم لحساب صاحب الشركة فقط.</p>
        <h2>ما يتصل بحساب Google</h2>
        <p>يربط صاحب الشركة حسابه بنفسه. الصلاحيات المستخدمة ثلاث فقط، ونيابة عنه:</p>
        <ul>
          <li><span dir="ltr">gmail.compose</span> لإنشاء مسودات البريد في صندوقه. لا تخرج رسالة إلا إذا اعتمد صاحب الشركة إرسالها داخل أورفانتا.</li>
          <li><span dir="ltr">spreadsheets</span> لكتابة جداول البيانات في حسابه.</li>
          <li><span dir="ltr">drive.file</span> لكتابة الملفات التي ينشئها النظام في حسابه.</li>
        </ul>
        <h2>ما لا نفعله</h2>
        <p>لا نبيع بيانات الشركة، ولا نشاركها مع طرف آخر. لا نستخدم هذه الصلاحيات للإعلان أو لبناء ملف عن أشخاص خارج عمل الشركة.</p>
        <p>
          للاستفسار: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
        <PublicLinks />

        <section className="public-doc__en" lang="en" dir="ltr">
          <h2>Privacy</h2>
          <p>Orvanta is an internal business operating system operated by Orvanta. It runs for the company owner.</p>
          <p>The owner connects a Google account. Orvanta requests only these scopes, and only to act on that owner’s behalf:</p>
          <ul>
            <li><span>gmail.compose</span> to draft email in the owner’s mailbox. A message is sent only after the owner approves that send inside Orvanta.</li>
            <li><span>spreadsheets</span> to write spreadsheets in the owner’s account.</li>
            <li><span>drive.file</span> to write files the system creates in the owner’s account.</li>
          </ul>
          <p>Company data is not sold and not shared with anyone else. These scopes are not used for advertising or for profiling people outside the company’s work.</p>
          <p>
            Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </section>
      </div>
    </article>
  );
}

export function TermsOfUse() {
  return (
    <article className="public-doc">
      <div className="public-doc__sheet">
        <p className="public-doc__mark">Orvanta</p>
        <h1>الشروط</h1>
        <p>أورفانتا نظام تشغيل أعمال داخلي تديره أورفانتا. استخدام المكتب الخاص مقصور على صاحب الشركة، والدخول إليه يبقى مقيداً.</p>
        <p>
          بيانات حساب Google تُستخدم فقط كما هو موضح في سياسة الخصوصية، بالصلاحيات <span dir="ltr">gmail.compose</span> و<span dir="ltr">spreadsheets</span> و<span dir="ltr">drive.file</span>: مسودات البريد، وجداول البيانات، والملفات، نيابة عن صاحب الشركة.
        </p>
        <p>لا تُباع بيانات الشركة ولا تُشارك مع طرف آخر.</p>
        <p>
          للاستفسار: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
        <PublicLinks />

        <section className="public-doc__en" lang="en" dir="ltr">
          <h2>Terms</h2>
          <p>Orvanta is an internal business operating system operated by Orvanta. The private office is for the company owner, and access to it stays restricted.</p>
          <p>Google account data is used only as the privacy policy describes, through the gmail.compose, spreadsheets, and drive.file scopes: email drafts, spreadsheets, and files, on the company owner’s behalf.</p>
          <p>Company data is not sold and not shared with anyone else.</p>
          <p>
            Contact: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </section>
      </div>
    </article>
  );
}
