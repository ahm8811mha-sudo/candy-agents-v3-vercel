-- A configured OAuth client is not proof that an external action completed.
-- Keep these capabilities in SANDBOX until a canary or verified receipt exists.
update public.capability_registry
set
  status = 'SANDBOX',
  notes = case capability_key
    when 'government.document.analysis' then 'يُرقى إلى LIVE بعد حفظ استخراج فعلي وملف وإيصال تحقق'
    else 'يُرقى إلى LIVE بعد نجاح canary معزول أو وجود external receipt موثق'
  end,
  updated_at = now()
where capability_key in (
  'google.gmail.draft',
  'google.drive.file',
  'google.sheets.row',
  'government.document.analysis'
);

notify pgrst, 'reload schema';
