import { Injectable } from "@nestjs/common";

import { sha256Hex } from "../common/utils/crypto.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_REFRESH_AFTER_MS, SESSION_TTL_MS } from "./constants/session.constants.js";
import type { ResolvedSession } from "./types/resolved-session.type.js";

// One place that decides whether a session is valid, for HTTP requests and WebSocket handshakes alike.
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  resolveCookie(cookie: string | undefined): Promise<ResolvedSession | null> {
    return cookie ? this.resolve(sha256Hex(cookie)) : Promise.resolve(null);
  }

  async resolve(sessionId: string): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.disabledAt || user.orgId !== session.orgId) return null;
    return {
      user: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
        groups: user.groups,
        sessionId: session.id,
      },
      expiresAt: session.expiresAt,
    };
  }

  async slide(session: ResolvedSession): Promise<boolean> {
    const now = Date.now();
    if (session.expiresAt.getTime() - now >= SESSION_TTL_MS - SESSION_REFRESH_AFTER_MS)
      return false;
    await this.prisma.session.updateMany({
      where: { id: session.user.sessionId },
      data: { expiresAt: new Date(now + SESSION_TTL_MS) },
    });
    return true;
  }
}
