import { supabaseStorage } from '../config/supabase';

/** Bucket privado creado por la migración de HUNI-62 (solo PDF, máx. 10 MB). */
export const BUCKET_RESULTADOS = 'resultados-laboratorio';

/** PDF de resultados de laboratorio en Supabase Storage. Solo la API (llave de servicio) escribe y firma. */
export class ResultadosStorageRepository {
  /** Sube (o reemplaza) el PDF en la ruta dada. */
  async subirPdf(ruta: string, contenido: Buffer): Promise<void> {
    const { error } = await supabaseStorage
      .from(BUCKET_RESULTADOS)
      .upload(ruta, contenido, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
  }

  /** Borra el PDF (se usa para deshacer una subida si falla el registro en la base de datos). */
  async eliminar(ruta: string): Promise<void> {
    const { error } = await supabaseStorage.from(BUCKET_RESULTADOS).remove([ruta]);
    if (error) throw error;
  }

  /** URL temporal de descarga. */
  async urlFirmada(ruta: string, segundos: number): Promise<string> {
    const { data, error } = await supabaseStorage.from(BUCKET_RESULTADOS).createSignedUrl(ruta, segundos);
    if (error) throw error;
    return data.signedUrl;
  }
}
