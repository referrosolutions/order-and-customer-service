import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from 'src/types';
import { extractTokenFromRequest } from 'src/utils/extract-token.util';

@Injectable()
export class IsAuthMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const token = extractTokenFromRequest(req);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      req.user = payload;
      next();
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
