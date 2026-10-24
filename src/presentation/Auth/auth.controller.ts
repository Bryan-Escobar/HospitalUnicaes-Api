import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { ActualizarMiPerfilBody, RegistroPacienteBody } from '../../domain/validators/auth.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { AuthService, Me, PerfilDto } from '../../services/auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  public registrar = async (req: Request<unknown, unknown, RegistroPacienteBody>, res: Response) => {
    try {
      const data = await this.authService.registrarPaciente(req.body);
      const response: ApiResponse<Me> = { statusCode: 201, success: true, message: 'Paciente registrado', data };
      res.status(201).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };

  public getMe = async (req: Request, res: Response) => {
    try {
      const data = await this.authService.getMe(req.usuario!.id);
      const response: ApiResponse<Me> = { statusCode: 200, success: true, message: 'Usuario autenticado', data };
      res.status(200).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };

  public actualizarMe = async (req: Request<unknown, unknown, ActualizarMiPerfilBody>, res: Response) => {
    try {
      const data = await this.authService.actualizarMiPerfil(req.usuario!.id, req.body);
      const response: ApiResponse<PerfilDto> = { statusCode: 200, success: true, message: 'Perfil actualizado', data };
      res.status(200).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };
}
