import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // SSE : EventSource ne peut pas envoyer de headers — token via query param
    if (!req.headers.authorization && req.query?.token) {
      req.headers.authorization = 'Bearer ' + req.query.token;
    }
    return super.canActivate(context);
  }
}
