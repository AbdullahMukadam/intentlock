import { Injectable } from "@nestjs/common";

import { newSecret, sha256Hex } from "../common/utils/crypto.util.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { RequestMeta } from "./types/request-meta.type.js";
import { SESSION_REFRESH_AFTER_MS, SESSION_TTL_MS } from "./constants/session.constants.js";
import type { ResolvedSession } from "./types/resolved-session.type.js";
import type { SessionRow } from "./types/session-row.type.js";

// One place that decides whether a session is valid, for HTTP requests and WebSocket handshakes alike.
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    user: { id: string; orgId: string },
    meta: RequestMeta,
    db: Pick<OrgTx, "session"> = orgDb(this.prisma, user.orgId),
  ): Promise<string> {
    const cookie = newSecret();
    await db.session.create({
      data: {
        id: sha256Hex(cookie),
        orgId: user.orgId,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return cookie;
  }

  resolveCookie(cookie: string | undefined): Promise<ResolvedSession | null> {
    return cookie ? this.resolve(sha256Hex(cookie)) : Promise.resolve(null);
  }

  async resolve(sessionId: string): Promise<ResolvedSession | null> {
    const [row] = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT s."expiresAt", u.id, u."orgId", u.email, u.role::text AS role, u.groups
      FROM "Session" s JOIN "User" u ON u.id = s."userId" AND u."orgId" = s."orgId"
      WHERE s.id = ${sessionId} AND u."disabledAt" IS NULL`;
    if (!row || row.expiresAt.getTime() <= Date.now()) return null;
    return {
      user: {
        id: row.id,
        orgId: row.orgId,
        email: row.email,
        role: row.role,
        groups: row.groups,
        sessionId,
      },
      expiresAt: row.expiresAt,
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
