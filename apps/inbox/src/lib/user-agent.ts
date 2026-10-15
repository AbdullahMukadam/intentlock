const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function describeUserAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/node|undici|curl/i.test(ua)) return "Command line";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? ua.slice(0, 40);
}
