import { Request, Response } from 'express';
import { ApiResponse } from '../../domain/interfaces';
import { CrearPersonalBody } from '../../domain/validators/personal.validator';
import { toErrorResponse } from '../../lib/errorHandler';
import { PersonalDto, PersonalService } from '../../services/personal.service';

export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  public crear = async (req: Request<unknown, unknown, CrearPersonalBody>, res: Response) => {
    try {
      const data = await this.personalService.crear(req.body);
      const response: ApiResponse<PersonalDto> = { statusCode: 201, success: true, message: 'Empleado creado', data };
      res.status(201).json(response);
    } catch (error) {
      const response = toErrorResponse(error);
      res.status(response.statusCode).json(response);
    }
  };
}
