import { CustomError } from "../domain/errors/CustomError";
import { ErrorHandlerInterface } from "../domain/errors/errorHandler.interface";
import { ZodError } from "zod";

//Helper para manejo centralizado de errores en controladores
export const handleError = (error: any): ErrorHandlerInterface => {
  let statusCode = 500,
    message = "Error interno del servidor";

  if (error instanceof CustomError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    message = error.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
  } else if (error && typeof error === "object" && "code" in error) {
    const prismaCode = String((error as any).code ?? "");
    if (prismaCode === "P2002") {
      statusCode = 409;
      message = "Conflicto por registro duplicado. Verifica que la postulación no exista ya para el mismo ciclo.";
    } else if (prismaCode === "P2003") {
      statusCode = 400;
      message = "Error de referencia de datos. Verifica docente, materia y ciclo seleccionados.";
    } else if (prismaCode === "P2025") {
      statusCode = 404;
      message = "No se encontró el registro solicitado para completar la operación.";
    }
  }

  return { statusCode, message };
};
