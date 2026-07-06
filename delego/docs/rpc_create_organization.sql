-- ============================================================
-- Delego – RPC: create_organization
-- Ergänzung zu Schema V1. Einspielen: Supabase Dashboard →
-- SQL Editor → New query → Run
--
-- Hintergrund: org_insert erlaubt jedem angemeldeten Nutzer das
-- Anlegen einer Organisation, aber mem_write verlangt für den
-- memberships-Insert bereits die Admin-Rolle. Diese Funktion legt
-- deshalb Organisation + Admin-Mitgliedschaft atomar an
-- (security definer, wie im Schema-Kommentar vorgesehen).
-- ============================================================

create or replace function create_organization(org_name text, org_slug text)
returns organizations
language plpgsql security definer
set search_path = public
as $$
declare
  new_org organizations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into organizations (name, slug)
  values (org_name, org_slug)
  returning * into new_org;

  insert into memberships (user_id, organization_id, role)
  values (auth.uid(), new_org.id, 'admin');

  return new_org;
end $$;

-- Nur angemeldete Nutzer dürfen die Funktion aufrufen.
revoke execute on function create_organization(text, text) from anon, public;
grant execute on function create_organization(text, text) to authenticated;
