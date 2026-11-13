import { supabaseStorage } from '../config/supabase';

/** Bucket privado creado en HUNI-62 (PDF) y ampliado a imágenes en HUNI-63 (máx. 10 MB). */
export const BUCKET_RESULTADOS = 'resultados-laboratorio';

/** Archivos de resultados de laboratorio en Supabase Storage. Solo la API (llave de servicio) escribe y firma. */
export class ResultadosStorageRepository {
  /** Sube el archivo en la ruta dada. Sin `upsert`: cada subida usa una ruta nueva y no pisa la de otra petición. */
  async subirArchivo(ruta: string, contenido: Buffer, contentType: string): Promise<void> {
    const { error } = await supabaseStorage.from(BUCKET_RESULTADOS).upload(ruta, contenido, { contentType });
    if (error) throw error;
  }

  /** Borra el archivo (se usa para deshacer una subida si falla el registro en la base de datos). */
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
