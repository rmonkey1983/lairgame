-- Staff authorization boundary. Control Room and Staff CRUD remain deferred.

create or replace function public.get_my_staff_access()
returns table (
  staff_member_id uuid,
  display_name text,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  return query
    select s.id, s.display_name, s.active
    from public.staff_members s
    where s.auth_user_id = auth.uid()
      and s.active = true;

  if not found then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.get_my_staff_access() from public, anon;
grant execute on function public.get_my_staff_access() to authenticated;
