import { Global, Module } from "@nestjs/common";
import { importPublicKeyPem } from "@intentlock/core";

import { VENDOR_PUBLIC_KEY } from "./constants/license.constants.js";
import { VENDOR_PUBLIC_KEY_PEM } from "./constants/vendor-public-key.constant.js";
import { LicenseController } from "./license.controller.js";
import { LicenseService } from "./license.service.js";

@Global()
@Module({
  controllers: [LicenseController],
  providers: [
    LicenseService,
    { provide: VENDOR_PUBLIC_KEY, useFactory: () => importPublicKeyPem(VENDOR_PUBLIC_KEY_PEM) },
  ],
  exports: [LicenseService],
})
export class LicenseModule {}
