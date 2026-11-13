import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiResponse } from '../../domain/interfaces';

export const ARCHIVO_MAX_BYTES = 10 * 1024 * 1024;

/** Tipos que se aceptan como resultado de laboratorio (HUNI-62 PDF; HUNI-63 también imágenes). */
export const MIME_RESULTADO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ARCHIVO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((MIME_RESULTADO as readonly string[]).includes(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'archivo'));
  },
});

const MENSAJES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: 'El archivo supera el máximo de 10 MB',
  LIMIT_FILE_COUNT: 'Envía un solo archivo',
  LIMIT_UNEXPECTED_FILE: 'Solo se acepta un PDF o una imagen (JPG, PNG o WebP) en el campo `archivo`',
};

/**
 * multipart/form-data con un archivo opcional en `archivo` (PDF o imagen; queda en memoria, en req.file).
 * Los demás campos llegan en req.body como texto. Un archivo inválido → 400 SOLICITUD_INVALIDA.
 */
export const subirArchivoResultadoOpcional = (req: Request, res: Response, next: NextFunction) => {
  upload.single('archivo')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const response: ApiResponse = {
        statusCode: 400,
        success: false,
        code: 'SOLICITUD_INVALIDA',
        message: MENSAJES[error.code] ?? 'No se pudo leer el archivo enviado',
      };
      return res.status(400).json(response);
    }
    next(error);
  });
};
