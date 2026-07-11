# Orvanta personal single-user mode

This installation is intentionally configured as a private personal workspace for Ahmed Nasser Alahmad.

## Runtime behavior

- No login screen.
- No logout action.
- No employee, invitation, company registration, licensing or public onboarding.
- All internal API calls receive one OWNER context for tenant `golden-star`.
- Commercial authentication can only be restored later by setting `ORVANTA_PERSONAL_MODE=false` and rebuilding the commercial onboarding experience deliberately.

## Important

The current Vercel URL must be treated as a private URL because the application itself no longer asks for credentials.
