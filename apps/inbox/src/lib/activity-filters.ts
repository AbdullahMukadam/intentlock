import { ActivityParam } from "./enums/activity-param.enum";

export type ActivityFilters = Record<ActivityParam, string>;

export function parseFilters(
  params: Record<string, string | string[] | undefined>,
): ActivityFilters {
  const pick = (key: ActivityParam) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  return Object.fromEntries(
    Object.values(ActivityParam).map((key) => [key, pick(key)]),
  ) as ActivityFilters;
}

function localToIso(value: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}

export function toAuditQuery(filters: ActivityFilters): Record<string, string | undefined> {
  return {
    ...filters,
    [ActivityParam.FROM]: localToIso(filters[ActivityParam.FROM]),
    [ActivityParam.TO]: localToIso(filters[ActivityParam.TO]),
  };
}
