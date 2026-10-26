import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiResponse } from '../../domain/interfaces';

export const PDF_MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'archivo'));
  },
});

const MENSAJES: Partial<Record<multer.ErrorCode, string>> = {
  LIMIT_FILE_SIZE: 'El PDF supera el máximo de 10 MB',
  LIMIT_FILE_COUNT: 'Envía un solo archivo',
  LIMIT_UNEXPECTED_FILE: 'Solo se acepta un PDF en el campo `archivo`',
};

/**
 * multipart/form-data con un PDF opcional en `archivo` (queda en memoria, en req.file).
 * Los demás campos llegan en req.body como texto. Un archivo inválido → 400 SOLICITUD_INVALIDA.
 */
export const subirPdfOpcional = (req: Request, res: Response, next: NextFunction) => {
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
