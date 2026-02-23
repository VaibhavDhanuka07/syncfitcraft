# SyncFit Kraft Inventory + Order Management

Production-ready Next.js + Supabase platform with admin/client workflows, registration approval, item-level order decisions, analytics, import/export, and transactional stock protection.

## Run Migrations (Order)

1. `supabase/migrations/20260219163000_inventory_system.sql`
2. `supabase/migrations/20260219190000_platform_extensions.sql`
3. `supabase/migrations/20260219210000_business_upgrade.sql`

## New Upgrades

- Product `type` support: `GY | NS`
- Product admin controls: `price`, `discount`, `stock`, `is_active`, `low_stock_threshold`, `image_url`
- Partial order handling via item-level acceptance/rejection (`item_status`)
- Status model supports `pending`, `accepted`, `rejected`, `partial` (legacy values still compatible)
- Analytics upgrades with revenue + monthly/yearly charts
- Unified admin export API: `/api/admin/export?range=monthly&type=csv|xlsx|pdf`
- Unified admin import API: `/api/admin/import` (target `stock` or `orders`, CSV/XLSX)
- Notifications route: `/api/notifications`

## Admin Sections

- `/admin`
- `/admin/products`
- `/admin/orders`
- `/admin/users`
- `/admin/analytics`
- `/admin/import-export`
- `/admin/settings`

## Required Env Vars

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=mailer@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM="SyncFit Kraft <no-reply@example.com>"
```

## Notes

- Admin/API admin routes are middleware-protected.
- Stock reduces only on accepted items.
- Partial orders are derived from mixed accepted/rejected item decisions.
- Existing data and legacy statuses are preserved for compatibility.
