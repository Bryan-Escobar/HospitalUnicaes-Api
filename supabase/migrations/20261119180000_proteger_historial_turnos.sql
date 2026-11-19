-- HUNI-52: el historial se cierra al iniciar el día del turno, en hora de El Salvador.
create function public.proteger_historial_turnos()
  returns trigger
  language plpgsql
  set search_path to ''
as $$
declare
  hoy date := (statement_timestamp() at time zone 'America/El_Salvador')::date;
begin
  if old.fecha <= hoy then
    raise exception using errcode = 'PT409',
      message = 'TURNO_HISTORICO: Solo se pueden editar o eliminar turnos que empiezan a partir de mañana.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.fecha <= hoy then
    raise exception using errcode = 'PT409',
      message = 'TURNO_HISTORICO: La nueva fecha de inicio debe ser a partir de mañana.';
  end if;
  return new;
end;
$$;

create trigger turnos_personal_proteger_historial
  before update or delete on public.turnos_personal
  for each row execute function public.proteger_historial_turnos();

revoke execute on function public.proteger_historial_turnos() from public, anon, authenticated;

-- Un cambio de nombre en el catálogo conserva el área con que se registró cada turno histórico.
create or replace function public.renombrar_area_turnos()
  returns trigger
  language plpgsql
  security definer
  set search_path to ''
as $$
begin
  update public.turnos_personal t
  set area = new.nombre
  where t.area = old.nombre
    and t.fecha > (statement_timestamp() at time zone 'America/El_Salvador')::date;
  return null;
end;
$$;
