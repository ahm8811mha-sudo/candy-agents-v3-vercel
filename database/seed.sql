insert into departments (id, name, description) values
  ('exec', 'الإدارة التنفيذية', 'القيادة والتخطيط واتخاذ القرار'),
  ('sales', 'المبيعات', 'إدارة العملاء والطلبات والتحصيل'),
  ('factory', 'المصنع', 'الإنتاج والجودة والمخزون'),
  ('finance', 'المالية', 'التقارير المالية والتحصيل')
on conflict (id) do update set name = excluded.name, description = excluded.description;

insert into employees (id, full_name, email, role, department_id, manager_id, job_title, status, joined_at) values
  ('e-ceo', 'خالد العمري', 'ceo@golden-star.local', 'CEO', 'exec', null, 'المدير التنفيذي', 'ACTIVE', '2026-01-01'),
  ('e-sales-manager', 'سارة القحطاني', 'sales.manager@golden-star.local', 'MANAGER', 'sales', 'e-ceo', 'مديرة المبيعات', 'ACTIVE', '2026-01-05'),
  ('e-factory-manager', 'ناصر الحربي', 'factory.manager@golden-star.local', 'MANAGER', 'factory', 'e-ceo', 'مدير المصنع', 'ACTIVE', '2026-01-05'),
  ('e-finance-manager', 'محمد الشهري', 'finance.manager@golden-star.local', 'MANAGER', 'finance', 'e-ceo', 'المدير المالي', 'ACTIVE', '2026-01-05'),
  ('e-employee-1', 'محمد السالم', 'employee@golden-star.local', 'EMPLOYEE', 'factory', 'e-factory-manager', 'مشرف إنتاج', 'ACTIVE', '2026-02-10')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  department_id = excluded.department_id,
  manager_id = excluded.manager_id,
  job_title = excluded.job_title,
  status = excluded.status;
