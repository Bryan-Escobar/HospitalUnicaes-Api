-- =============================================================================
-- HUNI-63: los resultados de laboratorio aceptan PDF o imagen (JPG, PNG, WebP)
--
-- Amplía los tipos permitidos del bucket privado `resultados-laboratorio` (sigue siendo privado y
-- de 10 MB). La API comprueba el tipo real por sus primeros bytes antes de subir y los clientes
-- descargan con la URL firmada de siempre. `archivo_url` guarda la ruta con su extensión.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    public = false,
    file_size_limit = 10485760
where id = 'resultados-laboratorio';

comment on column public.resultados_laboratorio.archivo_url is
  'Ruta del archivo (PDF o imagen) dentro del bucket resultados-laboratorio, no una URL pública. '
  'Se descarga con URL firmada (HUNI-62, HUNI-63).';
