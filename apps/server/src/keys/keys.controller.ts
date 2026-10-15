import { Controller, Get } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { Public } from "../common/decorators/public.decorator.js";
import { KeysService } from "./keys.service.js";

@Controller()
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Public()
  @Get(API_ENDPOINTS.JWKS)
  jwks() {
    return this.keys.jwks();
  }
}
