import { API_ENDPOINTS } from "@intentlock/core";
import { queryOptions } from "@tanstack/react-query";

import { apiUrl, request } from "./api";
import { queryKeyFor } from "./query-client";
import { AuditVerifyResult } from "./schemas";

const url = apiUrl(API_ENDPOINTS.AUDIT_VERIFY);

export const auditSummaryUrl = apiUrl(API_ENDPOINTS.AUDIT_SUMMARY);

export const auditVerifyQuery = queryOptions({
  queryKey: queryKeyFor(url),
  queryFn: () => request(url, AuditVerifyResult),
  enabled: false,
  staleTime: Infinity,
  gcTime: Infinity,
});
